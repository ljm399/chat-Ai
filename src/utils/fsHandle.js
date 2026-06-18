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
    // 当写入用户目录才使用
    // const homeDir = os.homedir();
    // const historyRootDir = path.join(homeDir, ".codex", ".front", "history");
    // const currentWorkingDir = process.cwd();    
    // const projectName = path.basename(currentWorkingDir);
    // const projectHistoryDir = path.join(currentWorkingDir, projectName);

    // 自己直接创建到项目本地，方便调试
    const currentWorkingDir = process.cwd();    
    const projectHistoryDir = path.join(currentWorkingDir, '.front','history');    

    // 没有就会自己创建
    fs.mkdirSync(projectHistoryDir, { recursive: true });

    // 用字符串，因为只有当用户取消对话才会写入，而不是问一句就写入
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
