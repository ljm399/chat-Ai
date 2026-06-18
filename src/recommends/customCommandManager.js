import fs from "fs/promises";
import path from "path";
import {
  getCurrentWorkingDir,
  getUserHomeDir,
} from "../utils/pathUtils.js";

const COMMANDS_FILE_NAME = "commands.json";

/**
 * 获取全局自定义指令文件路径。
 *
 * @returns {string} 全局自定义指令文件路径。
 */
export function getGlobalCommandsFilePath() {
  return path.join(getUserHomeDir(), ".front", COMMANDS_FILE_NAME);
}

/**
 * 获取项目级自定义指令文件路径。
 *
 * @returns {string} 项目级自定义指令文件路径。
 */
export function getProjectCommandsFilePath() {
  return path.join(getCurrentWorkingDir(), ".front", COMMANDS_FILE_NAME);
}

/**
 * 标准化自定义指令字段，避免 JSON 中额外字段影响运行。
 *
 * @param {object} command - 原始指令对象。
 * @param {string} source - 指令来源。
 * @param {number} index - 指令索引。
 * @returns {object|null} 标准化后的指令。
 */
function normalizeCustomCommand(command, source, index) {
  if (!command || typeof command !== "object") {
    return null;
  }

  const label = String(command.label ?? "").trim();
  const description = String(command.description ?? "").trim();
  const content = String(command.content ?? "").trim();

  if (!label || !content) {
    return null;
  }

  return {
    id: `${source}:${label}:${index}`,
    label,
    description: description || "自定义指令",
    content,
    source,
  };
}

/**
 * 读取指定路径下的自定义指令。
 *
 * @param {string} filePath - commands.json 路径。
 * @param {string} source - 指令来源。
 * @param {object} [options] - 读取选项。
 * @param {(message: string) => void} [options.onError] - 读取失败回调。
 * @returns {Promise<Array<object>>} 自定义指令列表。
 */
export async function readCustomCommands(filePath, source, options = {}) {
  try {
    const content = await fs.readFile(filePath, "utf-8");

    if (!content.trim()) {
      return [];
    }

    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      options.onError?.(`${filePath} 必须是数组格式，已忽略。`);
      return [];
    }

    return parsed
      .map((command, index) => normalizeCustomCommand(command, source, index))
      .filter(Boolean);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }

    options.onError?.(`读取自定义指令失败: ${filePath}，原因: ${error.message}`);
    return [];
  }
}

/**
 * 读取所有全局和项目自定义指令。
 *
 * @param {object} [options] - 读取选项。
 * @param {(message: string) => void} [options.onError] - 读取失败回调。
 * @returns {Promise<Array<object>>} 自定义指令列表。
 */
export async function getCustomCommands(options = {}) {
  const globalCommands = await readCustomCommands(
    getGlobalCommandsFilePath(),
    "global-custom",
    options
  );
  const projectCommands = await readCustomCommands(
    getProjectCommandsFilePath(),
    "project-custom",
    options
  );

  return [...globalCommands, ...projectCommands];
}

/**
 * 读取项目级自定义指令。
 *
 * @param {object} [options] - 读取选项。
 * @returns {Promise<Array<object>>} 项目级自定义指令列表。
 */
export async function getProjectCustomCommands(options = {}) {
  return readCustomCommands(
    getProjectCommandsFilePath(),
    "project-custom",
    options
  );
}

/**
 * 写入项目级自定义指令。
 *
 * @param {Array<object>} commands - 需要写入的指令。
 * @returns {Promise<void>}
 */
export async function writeProjectCustomCommands(commands) {
  const filePath = getProjectCommandsFilePath();
  const serializableCommands = commands.map((command) => ({
    label: String(command.label ?? "").trim(),
    description: String(command.description ?? "").trim(),
    content: String(command.content ?? "").trim(),
  }));

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    `${JSON.stringify(serializableCommands, null, 2)}\n`,
    "utf-8"
  );
}

/**
 * 判断指令名是否与可见指令重名。
 *
 * @param {string} label - 待检查指令名。
 * @param {Array<object>} commands - 可见指令列表。
 * @param {object} [options] - 检查选项。
 * @param {string|null} [options.allowLabel] - 编辑自身时允许保留的旧名称。
 * @returns {boolean} 是否重名。
 */
export function hasCommandLabelConflict(label, commands, options = {}) {
  const targetLabel = String(label ?? "").trim();

  if (!targetLabel) {
    return false;
  }

  return commands.some((command) => {
    if (options.allowLabel && command.label === options.allowLabel) {
      return false;
    }

    return command.label === targetLabel;
  });
}

export default {
  getCustomCommands,
  getGlobalCommandsFilePath,
  getProjectCommandsFilePath,
  getProjectCustomCommands,
  hasCommandLabelConflict,
  readCustomCommands,
  writeProjectCustomCommands,
};
