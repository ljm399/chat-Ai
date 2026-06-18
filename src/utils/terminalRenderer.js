import chalk from "chalk";

const PICKER_WINDOW_SIZE = 8;
const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

let renderedLineCount = 0;
let renderedInputLineIndex = 0;

/**
 * 将文本按终端友好的方式拆分为多行。
 *
 * @param {string} text - 原始文本。
 * @returns {string[]} 行数组。
 */
function toLines(text) {
  return String(text ?? "").split(/\r?\n/);
}

/**
 * 计算选择器列表的可视窗口起点。
 *
 * @param {number} itemsCount - 候选项数量。
 * @param {number} activeIndex - 当前高亮项索引。
 * @returns {number} 可视窗口起始索引。
 */
function getWindowStart(itemsCount, activeIndex) {
  if (itemsCount <= PICKER_WINDOW_SIZE) {
    return 0;
  }

  const halfWindow = Math.floor(PICKER_WINDOW_SIZE / 2);
  const maxStart = itemsCount - PICKER_WINDOW_SIZE;
  return Math.max(0, Math.min(activeIndex - halfWindow, maxStart));
}

/**
 * 去掉 ANSI 颜色控制序列，便于计算显示宽度。
 *
 * @param {string} text - 含 ANSI 的文本。
 * @returns {string} 去掉 ANSI 的纯文本。
 */
function stripAnsi(text) {
  return String(text ?? "").replace(ANSI_PATTERN, "");
}

/**
 * 估算终端中一段文本的显示宽度。
 *
 * @param {string} text - 纯文本。
 * @returns {number} 显示列宽。
 */
function getDisplayWidth(text) {
  let width = 0;

  for (const character of String(text ?? "")) {
    const codePoint = character.codePointAt(0) ?? 0;

    if (
      codePoint >= 0x1100 &&
      (
        codePoint <= 0x115f ||
        codePoint === 0x2329 ||
        codePoint === 0x232a ||
        (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
        (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
        (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
        (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
        (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
        (codePoint >= 0xff00 && codePoint <= 0xff60) ||
        (codePoint >= 0xffe0 && codePoint <= 0xffe6)
      )
    ) {
      width += 2;
      continue;
    }

    width += 1;
  }

  return width;
}

/**
 * 清除上一次渲染的输入区域。
 *
 * @returns {void}
 */
export function clearInputFrame() {
  if (!renderedLineCount) {
    return;
  }

  process.stdout.write("\x1b[?25l");
  process.stdout.write("\r");

  if (renderedInputLineIndex > 0) {
    process.stdout.write(`\x1b[${renderedInputLineIndex}A`);
    process.stdout.write("\r");
  }

  for (let index = 0; index < renderedLineCount; index += 1) {
    process.stdout.write("\x1b[2K");

    if (index < renderedLineCount - 1) {
      process.stdout.write("\x1b[1B\r");
    }
  }

  for (let index = 0; index < renderedLineCount - 1; index += 1) {
    process.stdout.write("\x1b[1A\r");
  }

  process.stdout.write("\x1b[2K\r");
  process.stdout.write("\x1b[?25h");
  renderedLineCount = 0;
  renderedInputLineIndex = 0;
}

/**
 * 渲染输入框、上下文提示与选择器。
 *
 * @param {object} state - 当前输入状态。
 * @returns {void}
 */
export function renderInputFrame(state) {
  clearInputFrame();
  process.stdout.write("\x1b[6 q");

  const lines = [];

  if (state.commandPrefix) {
    lines.push(chalk.gray(`当前指令: ${state.commandPrefix.trim()}`));
  }

  if (state.selectedContextFile) {
    lines.push(chalk.gray(`当前上下文: ${state.selectedContextFile.relativePath}`));
  }

  if (state.notice) {
    lines.push(chalk.yellow(state.notice));
  }

  if (state.form?.visible) {
    lines.push(chalk.cyan(state.form.prompt));
  }

  const inputLineIndex = lines.length;
  lines.push(`${chalk.white("问：")}${chalk.gray(state.commandPrefix)}${state.inputBuffer}`);

  if (state.picker.visible) {
    const startIndex = getWindowStart(
      state.picker.items.length,
      state.picker.activeIndex
    );
    const visibleItems = state.picker.items.slice(
      startIndex,
      startIndex + PICKER_WINDOW_SIZE
    );

    lines.push(
      chalk.cyan(
        state.picker.type === "slash"
          ? "选择一个 / 指令："
          : state.picker.type === "custom-command"
            ? "选择一个项目自定义指令："
            : "选择一个 @ 文件上下文："
      )
    );

    visibleItems.forEach((item, offset) => {
      const itemIndex = startIndex + offset;
      const isActive = itemIndex === state.picker.activeIndex;
      const itemLabel =
        state.picker.type === "slash"
          ? `/${item.label} [${item.source}] - ${item.description}`
          : state.picker.type === "custom-command"
            ? `/${item.label} - ${item.description}`
            : `${item.relativePath} (${item.size} B)`;
      const prefix = isActive ? "> " : "  ";

      lines.push(
        isActive ? chalk.green(`${prefix}${itemLabel}`) : `${prefix}${itemLabel}`
      );
    });
  }

  const output = lines.flatMap(toLines).join("\n");
  process.stdout.write(output);

  renderedLineCount = lines.flatMap(toLines).length || 1;
  renderedInputLineIndex = inputLineIndex;

  const linesBelowInput = renderedLineCount - inputLineIndex - 1;

  if (linesBelowInput > 0) {
    process.stdout.write(`\x1b[${linesBelowInput}A`);
  }

  process.stdout.write("\r");

  const promptPrefix = "问：";
  const visibleCursorText =
    promptPrefix +
    state.commandPrefix +
    state.inputBuffer.slice(0, state.cursorIndex);
  const cursorColumn = getDisplayWidth(stripAnsi(visibleCursorText));
  process.stdout.write(`\x1b[${cursorColumn}C`);
  process.stdout.write("\x1b[?25h");
}

export default {
  renderInputFrame,
  clearInputFrame,
};
