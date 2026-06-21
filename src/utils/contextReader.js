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
const SKILL_TEMPLATE_DOC_PATH = path.join(DOCS_DIR, "skillTemplate.md");
const PROJECT_FRONT_MD_PATH = path.join(PROJECT_ROOT, ".front.md");
const PROJECT_RULES_DIR = path.join(PROJECT_ROOT, ".front", "rules");
const PROJECT_SKILLS_DIR = path.join(PROJECT_ROOT, ".front", "skills");
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
 * 读取项目根目录和用户根目录下的 skills 文件头信息，并替换到 skill 模板中。
 * 仅提取 frontmatter 里的 name 和 description。
 *
 * @returns {Promise<string>} 替换完成后的 skill 上下文
 */
export async function getSkillHeaders() {
  const template = await fs.readFile(SKILL_TEMPLATE_DOC_PATH, "utf-8");
  const skillHeaders = await readSkillHeaders();
  const skillContent = skillHeaders.join("\n\n");

  return template.replaceAll("${skillcontent}", skillContent);
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
 * 读取项目与用户目录下的 skills 文件头信息。
 *
 * @returns {Promise<string[]>} skill 头信息字符串列表
 */
async function readSkillHeaders() {
  const userSkillsDir = path.join(os.homedir(), ".front", "skills");
  const skillFiles = await Promise.all([
    readSkillHeaderFiles(PROJECT_SKILLS_DIR),
    readSkillHeaderFiles(userSkillsDir),
  ]);

  return skillFiles
    .flat()
    .sort((firstSkill, secondSkill) =>
      firstSkill.source.localeCompare(secondSkill.source, "zh-CN") ||
      firstSkill.fileName.localeCompare(secondSkill.fileName, "zh-CN")
    )
    .map(
      (skillHeader) =>
        `skill[${skillHeader.fileName}](${skillHeader.filePath})\nname: ${skillHeader.name}\ndescription: ${skillHeader.description}`
    );
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
 * 读取指定目录下的 skill 文件，并提取 name 与 description。
 *
 * @param {string} skillsDir skill 目录
 * @returns {Promise<Array<{source: string, fileName: string, name: string, description: string}>>} skill 头信息列表
 */
async function readSkillHeaderFiles(skillsDir) {
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    const skillHeaders = await Promise.all(entries.map((entry) => readSkillHeaderEntry(skillsDir, entry)));

    return skillHeaders.filter(Boolean);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

/**
 * 读取单个 skill 条目，兼容“文件”与“目录/SKILL.md”两种结构。
 *
 * @param {string} skillsDir skill 根目录
 * @param {import("fs").Dirent} entry 目录项
 * @returns {Promise<{source: string, fileName: string, name: string, description: string}|null>} skill 头信息
 */
async function readSkillHeaderEntry(skillsDir, entry) {
  let fileName = entry.name;
  let targetFilePath = path.join(skillsDir, entry.name);

  if (entry.isDirectory()) {
    fileName = entry.name;
    targetFilePath = path.join(skillsDir, entry.name, "SKILL.md");
  } else if (!entry.isFile()) {
    return null;
  }

  try {
    const rawContent = await fs.readFile(targetFilePath, "utf-8");
    const skillHeader = parseSkillHeader(rawContent);

    if (!skillHeader) {
      return null;
    }

    return {
      source: skillsDir,
      fileName,
      filePath: targetFilePath,
      name: skillHeader.name,
      description: skillHeader.description,
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
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
  const normalizedContent = stripBom(rawContent);
  const matchedFrontmatter = normalizedContent.match(FRONTMATTER_PATTERN);

  if (!matchedFrontmatter) {
    return {
      paths: [],
      content: normalizedContent,
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
 * 从 skill 文件的 frontmatter 中提取 name 和 description。
 *
 * @param {string} rawContent skill 文件原始内容
 * @returns {{name: string, description: string}|null} skill 头信息
 */
function parseSkillHeader(rawContent) {
  const normalizedContent = stripBom(rawContent);
  const matchedFrontmatter = normalizedContent.match(FRONTMATTER_PATTERN);

  if (!matchedFrontmatter) {
    return null;
  }

  const [, frontmatterContent] = matchedFrontmatter;
  let name = "";
  let description = "";

  for (const line of frontmatterContent.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("name:")) {
      name = trimmedLine.slice("name:".length).trim();
      continue;
    }

    if (trimmedLine.startsWith("description:")) {
      description = trimmedLine.slice("description:".length).trim();
    }
  }

  if (!name || !description) {
    return null;
  }

  return {
    name,
    description,
  };
}

/**
 * 去掉文件内容开头可能存在的 UTF-8 BOM，避免 frontmatter 无法匹配。
 *
 * @param {string} content 文件内容
 * @returns {string} 去除 BOM 后的内容
 */
function stripBom(content) {
  return content.replace(/^\uFEFF/, "");
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
  getSkillHeaders,
};
