import fs from "fs/promises";
import path from "path";
import { getCurrentWorkingDir } from "./pathUtils.js";

const EXCLUDED_DIRECTORIES = new Set(["node_modules", ".git"]);
const MAX_SCAN_FILE_SIZE = 200 * 1024;
const MAX_CONTEXT_CHARACTERS = 12000;
const NULL_BYTE = 0;
const SAMPLE_SIZE = 1024;
const ANY_LINE_ENDING = /\r\n?|\n/g;

/**
 * 判断目录是否应该被跳过。
 *
 * @param {string} parentRelativePath - 父级相对路径。
 * @param {string} entryName - 当前目录名。
 * @returns {boolean} 是否跳过。
 */
function shouldSkipDirectory(parentRelativePath, entryName) {
  if (EXCLUDED_DIRECTORIES.has(entryName)) {
    return true;
  }

  const normalizedRelativePath = parentRelativePath
    ? `${parentRelativePath}/${entryName}`
    : entryName;

  return normalizedRelativePath === ".front/history";
}

/**
 * 通过内容采样判断是否为文本文件。
 *
 * @param {string} filePath - 文件绝对路径。
 * @returns {Promise<boolean>} 是否为文本文件。
 */
async function isTextFile(filePath) {
  try {
    const handle = await fs.open(filePath, "r");

    try {
      const buffer = Buffer.alloc(SAMPLE_SIZE);
      const { bytesRead } = await handle.read(buffer, 0, SAMPLE_SIZE, 0);

      if (!bytesRead) {
        return true;
      }

      for (let index = 0; index < bytesRead; index += 1) {
        if (buffer[index] === NULL_BYTE) {
          return false;
        }
      }

      return true;
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

/**
 * 递归扫描项目中的可读文本文件。
 *
 * @param {string} rootDir - 当前扫描根目录。
 * @param {string} relativeDir - 相对于项目根目录的路径。
 * @returns {Promise<Array<object>>} 文件列表。
 */
async function walkProjectFiles(rootDir, relativeDir = "") {
  const directoryPath = path.join(rootDir, relativeDir);
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const entryRelativePath = relativeDir
      ? path.posix.join(relativeDir, entry.name)
      : entry.name;
    const entryAbsolutePath = path.join(rootDir, entryRelativePath);

    if (entry.isDirectory()) {
      if (shouldSkipDirectory(relativeDir, entry.name)) {
        continue;
      }

      const nestedResults = await walkProjectFiles(rootDir, entryRelativePath);
      results.push(...nestedResults);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stats = await fs.stat(entryAbsolutePath);

    if (stats.size > MAX_SCAN_FILE_SIZE) {
      continue;
    }

    if (!(await isTextFile(entryAbsolutePath))) {
      continue;
    }

    results.push({
      path: entryAbsolutePath,
      relativePath: entryRelativePath,
      size: stats.size,
    });
  }

  return results;
}

/**
 * 获取当前项目下可用于 `@` 选择的文件列表。
 *
 * @returns {Promise<Array<{path: string, relativePath: string, size: number}>>} 项目文件列表。
 */
export async function getProjectFiles() {
  const rootDir = getCurrentWorkingDir();
  const files = await walkProjectFiles(rootDir);

  return files.sort((firstFile, secondFile) =>
    firstFile.relativePath.localeCompare(secondFile.relativePath, "zh-CN")
  );
}

/**
 * 读取选中文件内容，并在超限时截断。
 *
 * @param {string} filePath - 文件绝对路径。
 * @returns {Promise<{relativePath: string, content: string, truncated: boolean}>} 上下文文件内容。
 */
export async function readContextFile(filePath) {
  const rootDir = getCurrentWorkingDir();
  const relativePath = path.relative(rootDir, filePath).replace(/\\/g, "/");
  // 统一所有换行符，避免历史 JSON 中混入 `\r\n`、`\r` 等不同形态。
  const fullContent = (await fs.readFile(filePath, "utf-8")).replace(
    ANY_LINE_ENDING,
    "\n"
  );
  const truncated = fullContent.length > MAX_CONTEXT_CHARACTERS;
  const content = truncated
    ? `${fullContent.slice(0, MAX_CONTEXT_CHARACTERS)}\n\n[内容已截断]`
    : fullContent;

  return {
    relativePath,
    content,
    truncated,
  };
}

export default {
  getProjectFiles,
  readContextFile,
};
