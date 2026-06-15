import chalk from "chalk";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";

marked.setOptions({
  renderer: new TerminalRenderer({
    code: chalk.yellow,
    codespan: chalk.yellow,
    heading: chalk.cyanBright.bold,
    firstHeading: chalk.cyan.bold.underline,
    strong: chalk.bold,
    em: chalk.italic,
    blockquote: chalk.gray.italic,
    link: chalk.blue.underline,
    html: chalk.gray,
  }),
});

/**
 * 按指定颜色输出普通终端文本。
 *
 * @param {string} text - 需要输出的文本内容。
 * @param {string} [color="white"] - `chalk` 支持的颜色名，不支持时回退为白色。
 * @returns {void}
 */
function log(text, color = "white") {
  const colorRenderer =
    typeof chalk[color] === "function" ? chalk[color] : chalk.white;

  console.log(colorRenderer(String(text ?? "")));
}

/**
 * 将 Markdown 文本渲染为终端友好的格式并输出。
 *
 * @param {string} markdownText - 需要渲染的 Markdown 文本。
 * @returns {void}
 */
function logMarkdown(markdownText) {
  if (!markdownText) {
    return;
  }

  try {
    const rendered = marked.parse(String(markdownText));
    console.log(rendered);
  } catch {
    log(markdownText, "white");
  }
}

export default {
  log,
  logMarkdown,
};
