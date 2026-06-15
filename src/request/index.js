import fs from "fs";
import path from "path";
import OpenAI from "openai";
import logger from "../utils/logger.js";
import {
  getCurrentWorkingDir,
  getUserHomeDir,
} from "../utils/pathUtils.js";

const DEFAULT_MODEL = "doubao-seed-2.0-code";

/**
 * 读取项目级或全局级配置文件。
 *
 * @returns {Record<string, any>} 解析后的配置对象，读取失败时返回空对象。
 */
function readConfig() {
  const configPaths = [
    path.join(getCurrentWorkingDir(), ".front", "settings.json"),
    path.join(getUserHomeDir(), ".front", "settings.json"),
  ];

  for (const configPath of configPaths) {
    try {
      if (!fs.existsSync(configPath)) {
        continue;
      }

      const fileContent = fs.readFileSync(configPath, "utf-8");

      if (!fileContent.trim()) {
        logger.log(`配置文件为空，已跳过: ${configPath}`, "yellow");
        continue;
      }

      return JSON.parse(fileContent);
    } catch (error) {
      logger.log(`读取配置文件失败: ${configPath}`, "yellow");
      logger.log(`原因: ${error.message}`, "yellow");
    }
  }

  logger.log(
    "未找到可用的 settings.json 配置，将使用默认配置继续执行。",
    "yellow"
  );

  return {};
}

/**
 * 根据配置创建 OpenAI 客户端实例。
 *
 * @returns {OpenAI|null} OpenAI 客户端实例，创建失败时返回 null。
 */
export function createOpenAIClient() {
  const config = readConfig();
  const { apiKey, baseURL } = config;

  if (!apiKey) {
    logger.log(
      "未检测到 API Key，请在项目目录或用户主目录的 .front/settings.json 中配置 apiKey。",
      "yellow"
    );
    return null;
  }

  try {
    const clientOptions = {
      apiKey,
    };

    if (baseURL) {
      clientOptions.baseURL = baseURL;
    }

    return new OpenAI(clientOptions);
  } catch (error) {
    logger.log(`创建 OpenAI 客户端失败: ${error.message}`, "red");
    return null;
  }
}

/**
 * 获取大模型回复消息。
 *
 * @param {object} questionObj - 请求参数对象。
 * @param {OpenAI|null} questionObj.openai - OpenAI 客户端实例。
 * @param {Array<object>} questionObj.messages - 对话消息数组。
 * @param {string} [questionObj.model] - 指定模型名称。
 * @returns {Promise<{role: string, content: string}>} AI 返回的消息对象。
 */
export async function getAIResponse(questionObj) {
  const config = readConfig();
  const { openai, messages = [], model } = questionObj ?? {};
  const targetModel = model || config.model || DEFAULT_MODEL;

  if (!openai) {
    return {
      role: "assistant",
      content:
        "当前未成功初始化 OpenAI 客户端，请检查 .front/settings.json 中的 apiKey 和 baseURL 配置。",
    };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: targetModel,
      messages,
      temperature: 0.7,
    });

    const message = completion?.choices?.[0]?.message;

    if (!message) {
      return {
        role: "assistant",
        content: "模型未返回有效内容，请稍后重试。",
      };
    }

    return {
      role: message.role || "assistant",
      content: message.content || "",
    };
  } catch (error) {
    logger.log(`请求大模型失败: ${error.message}`, "red");

    return {
      role: "assistant",
      content:
        "请求 AI 服务时出现异常，请检查网络连接、模型名称或接口配置后重试。",
    };
  }
}

export default {
  createOpenAIClient,
  getAIResponse,
};
