import readline from "readline";
import ora from "ora";
import { createOpenAIClient, getAIResponse } from "./request/index.js";
import logger from "./utils/logger.js";
import { welcomeLog } from "./utils/init.js";
import { writeHistoryToFrontFile } from "./utils/fsHandle.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const openai = createOpenAIClient();
const messages = [];

let hasSavedHistory = false;
let isClosing = false;

/**
 * 安全写入历史记录，避免重复落盘。
 *
 * @returns {string|null} 历史文件路径，若未写入成功则返回 null。
 */
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

/**
 * 安全关闭 readline，避免重复关闭导致异常。
 *
 * @returns {void}
 */
function safeClose() {
  if (isClosing) {
    return;
  }

  isClosing = true;
  rl.close();
}

/**
 * 递归等待用户输入并处理对话。
 *
 * @returns {void}
 */
function promptUser() {
  rl.question("问：", async (input) => {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      promptUser();
      return;
    }

    if (trimmedInput === "exit" || trimmedInput === "quit") {
      logger.log("再见，欢迎下次使用 FRONTCODE AI 终端助手。", "cyan");
      safeClose();
      return;
    }

    messages.push({
      role: "user",
      content: trimmedInput,
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

    promptUser();
  });
}

rl.on("close", () => {
  const historyFilePath = persistHistory();

  if (historyFilePath) {
    logger.log(`本次对话已保存至: ${historyFilePath}`, "gray");
  }

  process.exit(0);
});

process.on("SIGINT", () => {
  logger.log("\n检测到退出操作，正在保存对话记录...", "yellow");
  safeClose();
});

process.on("uncaughtException", (error) => {
  logger.log(`程序发生未捕获异常: ${error.message}`, "red");
  persistHistory();
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const message =
    reason instanceof Error ? reason.message : "发生未处理的 Promise 异常。";

  logger.log(`程序发生未处理异常: ${message}`, "red");
  persistHistory();
  process.exit(1);
});

welcomeLog();
promptUser();
