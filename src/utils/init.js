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
  logger.log("┌──────────────────────────────────────────────┐", borderColor);
  logger.log("│                                              │", borderColor);
  logger.log("│      欢迎使用 FRONTCODE AI 终端助手         │", messageColor);
  logger.log("│                                              │", borderColor);
  logger.log("└──────────────────────────────────────────────┘", borderColor);
  logger.log("直接输入问题后按 Enter 发送。", hintColor);
  logger.log("输入 / 选择指令模板。", hintColor);
  logger.log("输入 @ 选择项目文件作为本轮上下文。", hintColor);
  logger.log("输入 'exit' 或 'quit' 退出程序。", hintColor);
  logger.log("", "white");
}

export default {
  welcomeLog,
};
