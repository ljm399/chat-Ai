import readline from "readline";
import ora from "ora";
import { createOpenAIClient, getAIResponse } from "./request/index.js";
import logger from "./utils/logger.js";
import { welcomeLog } from "./utils/init.js";
import { writeHistoryToFrontFile } from "./utils/fsHandle.js";
import { getSlashCommands } from "./recommends/commandManager.js";
import {
  getProjectCustomCommands,
  hasCommandLabelConflict,
  writeProjectCustomCommands,
} from "./recommends/customCommandManager.js";
import { getProjectFiles, readContextFile } from "./utils/contextPicker.js";
import {
  clearInputFrame,
  renderInputFrame,
} from "./utils/terminalRenderer.js";

const openai = createOpenAIClient();
const messages = [];

const state = {
  commandPrefix: "",
  inputBuffer: "",
  cursorIndex: 0,
  picker: {
    visible: false,
    type: null,
    items: [],
    activeIndex: 0,
    triggerIndex: -1,
  },
  form: {
    visible: false,
    prompt: "",
    resolver: null,
  },
  customCommandAction: null,
  selectedContextFile: null,
  notice: "",
  isSubmitting: false,
};

let hasSavedHistory = false;
let isClosing = false;
let inputInitialized = false;

function persistHistory() {
  if (hasSavedHistory) {
    return null;
  }

  hasSavedHistory = true;

  if (!messages.length) {
    return null;
  }

  return writeHistoryToFrontFile(messages);
}

function cleanupInput() {
  if (!inputInitialized) {
    return;
  }

  process.stdin.removeListener("keypress", handleKeypress);

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }

  process.stdin.pause();
  clearInputFrame();
  inputInitialized = false;
}

function safeClose() {
  if (isClosing) {
    return;
  }

  isClosing = true;
  cleanupInput();

  const historyFilePath = persistHistory();

  if (historyFilePath) {
    logger.log(`本次对话已保存至: ${historyFilePath}`, "gray");
  }

  process.exit(0);
}

function closePicker() {
  state.picker.visible = false;
  state.picker.type = null;
  state.picker.items = [];
  state.picker.activeIndex = 0;
  state.picker.triggerIndex = -1;
  state.customCommandAction = null;
}

function setNotice(notice) {
  state.notice = notice;
}

function clearNotice() {
  state.notice = "";
}

function resetInputBuffer() {
  state.commandPrefix = "";
  state.inputBuffer = "";
  state.cursorIndex = 0;
}

function rerender() {
  if (!state.isSubmitting && !isClosing) {
    renderInputFrame(state);
  }
}

function insertCharacter(character) {
  state.inputBuffer =
    state.inputBuffer.slice(0, state.cursorIndex) +
    character +
    state.inputBuffer.slice(state.cursorIndex);
  state.cursorIndex += character.length;
}

function removeCharacterBeforeCursor() {
  if (state.cursorIndex === 0) {
    return;
  }

  state.inputBuffer =
    state.inputBuffer.slice(0, state.cursorIndex - 1) +
    state.inputBuffer.slice(state.cursorIndex);
  state.cursorIndex -= 1;
}

function promptForText(prompt, defaultValue = "") {
  return new Promise((resolve) => {
    state.form.visible = true;
    state.form.prompt = prompt;
    state.form.resolver = resolve;
    state.inputBuffer = defaultValue;
    state.cursorIndex = defaultValue.length;
    state.commandPrefix = "";
    closePicker();
    rerender();
  });
}

function resolveCurrentForm() {
  const resolver = state.form.resolver;
  const value = state.inputBuffer;

  state.form.visible = false;
  state.form.prompt = "";
  state.form.resolver = null;
  resetInputBuffer();

  if (resolver) {
    resolver(value);
  }
}

async function openSlashPicker(triggerIndex) {
  const items = await getSlashCommands({
    onError: (message) => setNotice(message),
  });

  state.picker.visible = true;
  state.picker.type = "slash";
  state.picker.items = items;
  state.picker.activeIndex = 0;
  state.picker.triggerIndex = triggerIndex;
}

async function openAtPicker(triggerIndex) {
  const items = await getProjectFiles();

  state.picker.visible = true;
  state.picker.type = "at";
  state.picker.items = items;
  state.picker.activeIndex = 0;
  state.picker.triggerIndex = triggerIndex;
}

async function openCustomCommandPicker(action) {
  const items = await getProjectCustomCommands({
    onError: (message) => setNotice(message),
  });

  if (!items.length) {
    setNotice("暂无项目自定义指令。");
    return false;
  }

  state.customCommandAction = action;
  state.picker.visible = true;
  state.picker.type = "custom-command";
  state.picker.items = items;
  state.picker.activeIndex = 0;
  state.picker.triggerIndex = -1;
  return true;
}

function applySlashSelection(command) {
  const triggerIndex = state.picker.triggerIndex;
  const beforeTrigger = state.inputBuffer.slice(0, triggerIndex);
  const afterTrigger = state.inputBuffer.slice(triggerIndex + 1);

  state.commandPrefix = `${state.commandPrefix}${beforeTrigger}${command.content} `;
  state.inputBuffer = afterTrigger;
  state.cursorIndex = state.inputBuffer.length;
  closePicker();
}

function applyAtSelection(fileItem) {
  const triggerIndex = state.picker.triggerIndex;

  state.selectedContextFile = fileItem;
  state.inputBuffer =
    state.inputBuffer.slice(0, triggerIndex) +
    state.inputBuffer.slice(triggerIndex + 1);
  state.cursorIndex = Math.min(triggerIndex, state.inputBuffer.length);
  closePicker();
  setNotice(`已选择上下文文件: ${fileItem.relativePath}`);
}

export async function buildUserMessage({ rawInput, selectedContextFile }) {
  if (!selectedContextFile) {
    return {
      content: rawInput,
      truncated: false,
    };
  }

  const contextResult = await readContextFile(selectedContextFile.path);
  const content = [
    "以下是本轮附加的项目文件上下文：",
    `文件路径: ${contextResult.relativePath}`,
    "文件内容：",
    contextResult.content,
    "",
    "用户问题：",
    rawInput,
  ].join("\n");

  return {
    content,
    truncated: contextResult.truncated,
  };
}

async function getVisibleCommandsForValidation() {
  return getSlashCommands({
    onError: (message) => setNotice(message),
  });
}

async function addCustomCommand() {
  resetInputBuffer();
  clearInputFrame();

  const label = (await promptForText("新增指令 label：")).trim();

  if (!label) {
    setNotice("指令 label 不能为空。");
    rerender();
    return;
  }

  const visibleCommands = await getVisibleCommandsForValidation();

  if (hasCommandLabelConflict(label, visibleCommands)) {
    setNotice(`指令 ${label} 已存在，不能重复。`);
    rerender();
    return;
  }

  const description = (await promptForText("新增指令 description：")).trim();
  const content = (await promptForText("新增指令 content：")).trim();

  if (!content) {
    setNotice("指令 content 不能为空。");
    rerender();
    return;
  }

  const projectCommands = await getProjectCustomCommands({
    onError: (message) => setNotice(message),
  });

  await writeProjectCustomCommands([
    ...projectCommands,
    {
      label,
      description: description || "自定义指令",
      content,
    },
  ]);

  setNotice(`已新增自定义指令: ${label}`);
  rerender();
}

async function editCustomCommand(command) {
  closePicker();
  resetInputBuffer();
  clearInputFrame();

  const nextLabelInput = await promptForText(
    `编辑 label，留空保留 ${command.label}：`
  );
  const nextLabel = nextLabelInput.trim() || command.label;
  const visibleCommands = await getVisibleCommandsForValidation();

  if (
    hasCommandLabelConflict(nextLabel, visibleCommands, {
      allowLabel: command.label,
    })
  ) {
    setNotice(`指令 ${nextLabel} 已存在，不能重复。`);
    rerender();
    return;
  }

  const nextDescriptionInput = await promptForText(
    "编辑 description，留空保留原值："
  );
  const nextContentInput = await promptForText("编辑 content，留空保留原值：");
  const nextContent = nextContentInput.trim() || command.content;

  if (!nextContent) {
    setNotice("指令 content 不能为空。");
    rerender();
    return;
  }

  const projectCommands = await getProjectCustomCommands({
    onError: (message) => setNotice(message),
  });
  const updatedCommands = projectCommands.map((item) =>
    item.label === command.label
      ? {
          label: nextLabel,
          description: nextDescriptionInput.trim() || command.description,
          content: nextContent,
        }
      : item
  );

  await writeProjectCustomCommands(updatedCommands);
  setNotice(`已更新自定义指令: ${nextLabel}`);
  rerender();
}

async function deleteCustomCommand(command) {
  const projectCommands = await getProjectCustomCommands({
    onError: (message) => setNotice(message),
  });
  const updatedCommands = projectCommands.filter(
    (item) => item.label !== command.label
  );

  await writeProjectCustomCommands(updatedCommands);
  closePicker();
  resetInputBuffer();
  setNotice(`已删除自定义指令: ${command.label}`);
  rerender();
}

async function applyCustomCommandManagement(command) {
  const action = state.customCommandAction;

  if (action === "edit") {
    await editCustomCommand(command);
    return;
  }

  if (action === "delete") {
    await deleteCustomCommand(command);
  }
}

async function handleCustomCommandManagementInput(input) {
  if (input === "/add") {
    await addCustomCommand();
    return true;
  }

  if (input === "/edit") {
    resetInputBuffer();
    await openCustomCommandPicker("edit");
    rerender();
    return true;
  }

  if (input === "/delete") {
    resetInputBuffer();
    await openCustomCommandPicker("delete");
    rerender();
    return true;
  }

  return false;
}

async function submitCurrentInput() {
  const fullInput = `${state.commandPrefix}${state.inputBuffer}`;
  const trimmedInput = fullInput.trim();

  if (!trimmedInput) {
    return;
  }

  if (await handleCustomCommandManagementInput(trimmedInput)) {
    return;
  }

  if (trimmedInput === "exit" || trimmedInput === "quit") {
    logger.log("再见，欢迎下次使用 FRONTCODE AI 终端助手。", "cyan");
    safeClose();
    return;
  }

  state.isSubmitting = true;
  clearInputFrame();

  try {
    const builtMessage = await buildUserMessage({
      rawInput: trimmedInput,
      selectedContextFile: state.selectedContextFile,
    });

    if (builtMessage.truncated) {
      logger.log("文件过大，已截断后发送。", "yellow");
    }

    messages.push({
      role: "user",
      content: builtMessage.content,
    });

    const spinner = ora("AI 正在思考...").start();

    try {
      const aiMessage = await getAIResponse({
        openai,
        messages,
      });

      messages.push({
        role: aiMessage.role || "assistant",
        content: aiMessage.content || "",
      });

      spinner.stop();
      logger.log("", "white");
      logger.logMarkdown(aiMessage.content || "AI 暂未返回内容。");
      logger.log("", "white");
    } catch (error) {
      spinner.stop();

      const fallbackMessage = {
        role: "assistant",
        content: "处理本次请求时出现异常，请稍后重试。",
      };

      messages.push(fallbackMessage);
      logger.log(`请求处理失败: ${error.message}`, "red");
      logger.logMarkdown(fallbackMessage.content);
    }
  } catch (error) {
    logger.log(`构建本轮消息失败: ${error.message}`, "red");
  } finally {
    state.selectedContextFile = null;
    state.isSubmitting = false;
    clearNotice();
    closePicker();
    resetInputBuffer();
    rerender();
  }
}

function movePickerSelection(direction) {
  if (!state.picker.visible || !state.picker.items.length) {
    return;
  }

  const nextIndex =
    (state.picker.activeIndex + direction + state.picker.items.length) %
    state.picker.items.length;

  state.picker.activeIndex = nextIndex;
}

async function confirmPickerSelection() {
  if (!state.picker.visible || !state.picker.items.length) {
    return;
  }

  const selectedItem = state.picker.items[state.picker.activeIndex];

  if (state.picker.type === "slash") {
    applySlashSelection(selectedItem);
    return;
  }

  if (state.picker.type === "at") {
    applyAtSelection(selectedItem);
    return;
  }

  if (state.picker.type === "custom-command") {
    await applyCustomCommandManagement(selectedItem);
  }
}

async function handleTriggerCharacter(character) {
  const triggerIndex = state.cursorIndex - 1;

  if (character === "/" && state.inputBuffer === "/") {
    await openSlashPicker(triggerIndex);
    return;
  }

  if (character === "@") {
    await openAtPicker(triggerIndex);
  }
}

async function handleKeypress(str, key = {}) {
  if (isClosing || state.isSubmitting) {
    return;
  }

  clearNotice();

  if (key.ctrl && key.name === "c") {
    logger.log("\n检测到退出操作，正在保存对话记录...", "yellow");
    safeClose();
    return;
  }

  if (
    state.picker.visible &&
    state.picker.type === "slash" &&
    typeof str === "string" &&
    /[A-Za-z]/.test(str)
  ) {
    closePicker();
  }

  if (state.picker.visible) {
    if (key.name === "up") {
      movePickerSelection(-1);
      rerender();
      return;
    }

    if (key.name === "down") {
      movePickerSelection(1);
      rerender();
      return;
    }

    if (key.name === "return") {
      await confirmPickerSelection();
      rerender();
      return;
    }

    if (key.name === "escape") {
      closePicker();
      rerender();
      return;
    }
  }

  if (key.name === "left") {
    state.cursorIndex = Math.max(0, state.cursorIndex - 1);
    rerender();
    return;
  }

  if (key.name === "right") {
    state.cursorIndex = Math.min(state.inputBuffer.length, state.cursorIndex + 1);
    rerender();
    return;
  }

  if (key.name === "backspace") {
    removeCharacterBeforeCursor();
    rerender();
    return;
  }

  if (key.name === "return") {
    if (state.form.visible) {
      resolveCurrentForm();
      return;
    }

    await submitCurrentInput();
    return;
  }

  if (typeof str === "string" && str && !key.ctrl && !key.meta) {
    insertCharacter(str);

    if (!state.form.visible) {
      await handleTriggerCharacter(str);
    }

    rerender();
  }
}

function startInputLoop() {
  readline.emitKeypressEvents(process.stdin);

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  process.stdin.resume();
  process.stdin.on("keypress", handleKeypress);
  inputInitialized = true;
  rerender();
}

process.on("SIGINT", () => {
  logger.log("\n检测到退出操作，正在保存对话记录...", "yellow");
  safeClose();
});

process.on("uncaughtException", (error) => {
  cleanupInput();
  logger.log(`程序发生未捕获异常: ${error.message}`, "red");
  persistHistory();
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  cleanupInput();
  const message =
    reason instanceof Error ? reason.message : "发生未处理的 Promise 异常。";

  logger.log(`程序发生未处理异常: ${message}`, "red");
  persistHistory();
  process.exit(1);
});

welcomeLog();
startInputLoop();
