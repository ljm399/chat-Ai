import logger from "./logger.js";

/**
 * 在终端输出欢迎使用信息和操作提示。
 *
 * @returns {void}
 */
export function welcomeLog() {
  const borderColor = "cyan";
  const messageColor = "green";
  const hintColor = "gray";

  logger.log("", "white");
  logger.log("╭──────────────────────────────────────────────╮", borderColor);
  logger.log("│                                              │", borderColor);
  logger.log("│       欢迎使用 FRONTCODE AI 终端助手         │", messageColor);
  logger.log("│                                              │", borderColor);
  logger.log("╰──────────────────────────────────────────────╯", borderColor);
  logger.log("输入您的问题，我会尽力帮助您！", hintColor);
  logger.log("输入 'exit' 或 'quit' 退出程序", hintColor);
  logger.log("", "white");
}

export default {
  welcomeLog,
};
