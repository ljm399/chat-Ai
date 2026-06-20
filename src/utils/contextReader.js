import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DOCS_DIR = path.resolve(__dirname, "../docs");
const SYSTEM_DOC_PATH = path.join(DOCS_DIR, "systemDoc.md");
const USER_CONTEXT_DOC_PATH = path.join(DOCS_DIR, "userContext.md");
const PROJECT_FRONT_MD_PATH = path.join(PROJECT_ROOT, ".front.md");
const PROJECT_RULES_DIR = path.join(PROJECT_ROOT, ".front", "rules");
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * 读取系统文档模板，并将占位符替换为当前运行环境信息。
 *
 * @returns {Promise<string>} 替换后的系统上下文内容
 */
export async function readSystemContext() {
  const template = await fs.readFile(SYSTEM_DOC_PATH, "utf-8");
  const systemInfo = getSystemInfo();

  return template
    .replaceAll("${systemInfo}", systemInfo)
    .replaceAll("${workPath}", PROJECT_ROOT);
}

/**
 * 获取当前用户操作系统信息。
 *
 * @returns {string} 操作系统信息字符串
 */
export function getSystemInfo() {
  return `${os.platform()} ${os.release()} (${os.arch()})`;
}

/**
 * 读取用户上下文模板，并注入用户目录与项目目录中的 .front.md 内容。
 * 文件不存在时，对应内容替换为空字符串。
 *
 * @returns {Promise<string>} 替换后的用户上下文内容
 */
export async function getUserContext() {
  const template = await fs.readFile(USER_CONTEXT_DOC_PATH, "utf-8");
  const userPath = os.homedir();
  const userContent = await readOptionalFile(
    path.join(userPath, ".front", ".front.md")
  );
  const projectContent = await readOptionalFile(PROJECT_FRONT_MD_PATH);

  return template
    .replaceAll("${userPath}", userPath)
    .replaceAll("${userContent}", userContent)
    .replaceAll("${projectPath}", PROJECT_ROOT)
    .replaceAll("${projectContent}", projectContent);
}

/**
 * 根据选中的上下文文件，读取并匹配项目下的规则文件内容。
 * 仅当 selectedContextFile 命中 rules frontmatter 中的 paths 规则时返回内容。
 *
 * @param {{relativePath?: string, path?: string}|null} selectedContextFile 选中的上下文文件
 * @returns {Promise<string>} 命中的规则内容，未命中时返回空字符串
 */
export async function getRulesContext(selectedContextFile) {
  const targetRelativePath = normalizeSelectedRelativePath(selectedContextFile);

  if (!targetRelativePath) {
    return "";
  }

  const ruleFiles = await readRuleFiles();
  const matchedRules = ruleFiles
    .filter((ruleFile) =>
      ruleFile.paths.some((rulePath) => matchGlob(rulePath, targetRelativePath))
    )
    .sort((firstRule, secondRule) =>
      firstRule.name.localeCompare(secondRule.name, "zh-CN")
    );

  if (!matchedRules.length) {
    return "";
  }

  return matchedRules.map((ruleFile) => ruleFile.content.trim()).join("\n\n");
}

/**
 * 安全读取可选文件，不存在时返回空字符串。
 *
 * @param {string} filePath 文件绝对路径
 * @returns {Promise<string>} 文件内容或空字符串
 */
async function readOptionalFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

/**
 * 读取并解析项目根目录下的 rules 文件。
 *
 * @returns {Promise<Array<{name: string, paths: string[], content: string}>>} 规则文件列表
 */
async function readRuleFiles() {
  try {
    const entries = await fs.readdir(PROJECT_RULES_DIR, { withFileTypes: true });
    const ruleFiles = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map(async (entry) => {
          const fullPath = path.join(PROJECT_RULES_DIR, entry.name);
          const rawContent = await fs.readFile(fullPath, "utf-8");
          const parsedRule = parseRuleFile(rawContent);

          return {
            name: entry.name,
            paths: parsedRule.paths,
            content: parsedRule.content,
          };
        })
    );

    return ruleFiles.filter(
      (ruleFile) => ruleFile.paths.length && ruleFile.content.trim()
    );
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

/**
 * 解析规则文件 frontmatter 中的 paths 和正文内容。
 *
 * @param {string} rawContent 规则文件原始内容
 * @returns {{paths: string[], content: string}} 解析结果
 */
function parseRuleFile(rawContent) {
  const matchedFrontmatter = rawContent.match(FRONTMATTER_PATTERN);

  if (!matchedFrontmatter) {
    return {
      paths: [],
      content: rawContent,
    };
  }

  const [, frontmatterContent, bodyContent] = matchedFrontmatter;
  const paths = [];
  let isReadingPaths = false;

  for (const line of frontmatterContent.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      continue;
    }

    if (trimmedLine === "paths:") {
      isReadingPaths = true;
      continue;
    }

    if (isReadingPaths && trimmedLine.startsWith("- ")) {
      paths.push(stripQuotes(trimmedLine.slice(2).trim()));
      continue;
    }

    if (!line.startsWith(" ") && !line.startsWith("\t")) {
      isReadingPaths = false;
    }
  }

  return {
    paths,
    content: bodyContent,
  };
}

/**
 * 将选中文件解析为相对于项目根目录的标准路径。
 *
 * @param {{relativePath?: string, path?: string}|null} selectedContextFile 选中文件
 * @returns {string} 项目相对路径
 */
function normalizeSelectedRelativePath(selectedContextFile) {
  if (!selectedContextFile) {
    return "";
  }

  if (selectedContextFile.relativePath) {
    return selectedContextFile.relativePath.replace(/\\/g, "/");
  }

  if (selectedContextFile.path) {
    return path.relative(PROJECT_ROOT, selectedContextFile.path).replace(/\\/g, "/");
  }

  return "";
}

/**
 * 用最小 glob 规则匹配相对路径，仅支持当前 rules 需要的 * 和 **。
 *
 * @param {string} pattern glob 规则
 * @param {string} targetPath 目标相对路径
 * @returns {boolean} 是否命中
 */
function matchGlob(pattern, targetPath) {
  const normalizedPattern = pattern.replace(/\\/g, "/");
  const normalizedTargetPath = targetPath.replace(/\\/g, "/");
  const regexPattern = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "___DOUBLE_STAR___")
    .replace(/\*/g, "[^/]*")
    .replace(/___DOUBLE_STAR___/g, ".*");

  return new RegExp(`^${regexPattern}$`).test(normalizedTargetPath);
}

/**
 * 去掉字符串首尾的单引号或双引号。
 *
 * @param {string} value 原始字符串
 * @returns {string} 去引号后的字符串
 */
function stripQuotes(value) {
  return value.replace(/^['"]|['"]$/g, "");
}

export default {
  readSystemContext,
  getSystemInfo,
  getUserContext,
  getRulesContext,
};
