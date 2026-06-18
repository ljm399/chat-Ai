import fs from "fs/promises";
import path from "path";
import { getCurrentWorkingDir } from "../utils/pathUtils.js";
import { getCustomCommands } from "./customCommandManager.js";

const BUILTIN_COMMANDS = [
  {
    id: "builtin:explain",
    label: "explain",
    description: "解释代码或问题",
    content: "请解释下面的代码或问题，并给出关键点：",
    source: "builtin",
  },
  {
    id: "builtin:fix",
    label: "fix",
    description: "定位并修复问题",
    content: "请帮我定位问题原因，并给出修复方案和修改建议：",
    source: "builtin",
  },
  {
    id: "builtin:refactor",
    label: "refactor",
    description: "重构代码并说明收益",
    content: "请对下面的代码进行重构，并说明重构收益：",
    source: "builtin",
  },
  {
    id: "builtin:summary",
    label: "summary",
    description: "总结重点内容",
    content: "请总结下面内容的重点，并给出简短结论：",
    source: "builtin",
  },
];

const TEXT_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".txt",
  ".yaml",
  ".yml",
  ".html",
  ".css",
  ".scss",
  ".less",
  ".xml",
  ".csv",
  ".tsv",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".sh",
  ".ps1",
  ".sql",
]);

/**
 * 判断文件扩展名是否属于可直接读取的文本模板。
 *
 * @param {string} filePath - 文件绝对路径。
 * @returns {boolean} 是否为文本模板文件。
 */
function isTextTemplate(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (TEXT_EXTENSIONS.has(extension)) {
    return true;
  }

  return extension === "";
}

/**
 * 读取 `src/docs` 下的模板命令。
 *
 * @returns {Promise<Array<object>>} docs 模板命令列表。
 */
async function getDocsCommands() {
  const docsDir = path.join(getCurrentWorkingDir(), "src", "docs");

  try {
    const entries = await fs.readdir(docsDir, { withFileTypes: true });
    const fileEntries = entries.filter(
      (entry) => entry.isFile() && isTextTemplate(entry.name)
    );

    const commands = await Promise.all(
      fileEntries.map(async (entry) => {
        const filePath = path.join(docsDir, entry.name);
        const content = await fs.readFile(filePath, "utf-8");
        const label = path.parse(entry.name).name;

        return {
          id: `docs:${entry.name}`,
          label,
          description: `来自 src/docs/${entry.name} 的模板`,
          content: content.trim(),
          source: "docs",
        };
      })
    );

    return commands.filter((command) => command.content);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

/**
 * 获取内置指令。
 *
 * @returns {Array<object>} 内置指令列表。
 */
export function getBuiltinCommands() {
  return [...BUILTIN_COMMANDS];
}

/**
 * 获取 `/` 触发时展示的命令列表。
 *
 * @param {object} [options] - 读取选项。
 * @param {(message: string) => void} [options.onError] - 读取失败回调。
 * @returns {Promise<Array<object>>} 命令列表。
 */
export async function getSlashCommands(options = {}) {
  const docsCommands = await getDocsCommands();
  const customCommands = await getCustomCommands(options);

  return [...BUILTIN_COMMANDS, ...docsCommands, ...customCommands];
}

export default {
  getBuiltinCommands,
  getSlashCommands,
};
