import fs from "fs";
import path from "path";
import os from "os";
import logger from "./logger.js";

/**
 * 将对话历史序列化后写入用户主目录下的 `.front/history` 中。
 *
 * @param {Array<object>} data - 需要保存的对话历史数组。
 * @returns {string|null} 写入成功后的 JSON 文件绝对路径，失败时返回 `null`。
 */
export function writeHistoryToFrontFile(data) {
  try {
    const homeDir = os.homedir();
    const historyRootDir = path.join(homeDir, ".front", "history");
    const currentWorkingDir = process.cwd();
    const projectName = path.basename(currentWorkingDir);
    const projectHistoryDir = path.join(historyRootDir, projectName);

    fs.mkdirSync(projectHistoryDir, { recursive: true });

    const fileName = `${Date.now()}.json`;
    const filePath = path.join(projectHistoryDir, fileName);
    const serializedData = JSON.stringify(data, null, 2);

    fs.writeFileSync(filePath, serializedData, "utf-8");

    return filePath;
  } catch (error) {
    const errorMessage = `写入对话历史失败: ${error.message}`;

    try {
      logger.log(errorMessage, "red");
    } catch {
      console.error(errorMessage);
    }

    return null;
  }
}

export default {
  writeHistoryToFrontFile,
};
