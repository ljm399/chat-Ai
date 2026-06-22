import fs from "fs";
import path from "path";
import OpenAI from "openai";
import logger from "../utils/logger.js";
import { excuteTool } from "../tool/index.js";
import { transformToOpenAi } from "../tool/util.js";
import {
  getCurrentWorkingDir,
  getUserHomeDir,
} from "../utils/pathUtils.js";

const DEFAULT_MODEL = "doubao-seed-2.0-code";

/**
 * 解析模型返回的 tool arguments。
 * 当模型返回的 arguments 不是合法 JSON 时，不中断整轮对话，
 * 而是抛出更明确的错误给上层转成 tool 结果回填。
 *
 * @param {string|undefined} rawArguments 模型返回的原始参数字符串
 * @returns {Record<string, any>} 解析后的参数对象
 */
function parseToolArguments(rawArguments) {
  const normalizedArguments = rawArguments || "{}";

  try {
    const parsedArguments = JSON.parse(normalizedArguments);

    if (
      parsedArguments === null ||
      Array.isArray(parsedArguments) ||
      typeof parsedArguments !== "object"
    ) {
      throw new Error("工具参数必须是 JSON 对象。");
    }

    return parsedArguments;
  } catch (error) {
    throw new Error(
      `工具参数不是合法 JSON: ${error.message}。原始内容: ${normalizedArguments}`
    );
  }
}

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
 * @param {Array<object>} [questionObj.contextMessageList] - 固定上下文消息数组。
 * @param {Array<object>} questionObj.messages - 对话消息数组。
 * @param {string} [questionObj.model] - 指定模型名称。
 * @param {{tools?: object[], toolNameMap?: Record<string, {callTool: Function}>}} [questionObj.toolRuntime] - 统一工具运行时。
 * @param {(toolInfo: {name: string, args: Record<string, any>}) => (void|Promise<void>)} [questionObj.onToolCall] - 工具调用前的终端回调。
 * @param {(toolInfo: {name: string, result: string}) => (void|Promise<void>)} [questionObj.onToolResult] - 工具调用后的终端回调。
 * @returns {Promise<Array<object>>} 包含完整 tool use 过程的消息数组。
 */
export async function getAIResponse(questionObj) {
  const config = readConfig();
  const {
    openai,
    contextMessageList = [],
    messages = [],
    model,
    toolRuntime,
    onToolCall,
    onToolResult,
  } = questionObj ?? {};
  const targetModel = model || config.model || DEFAULT_MODEL;
  const requestMessages = [...contextMessageList, ...messages];

  if (!openai) {
    return [
      ...messages,
      {
        role: "assistant",
        content:
          "当前未成功初始化 OpenAI 客户端，请检查 .front/settings.json 中的 apiKey 和 baseURL 配置。",
      },
    ];
  }

  try {
    const completionOptions = {
      model: targetModel,
      messages: requestMessages,
      temperature: 0.7,
    };

    if (toolRuntime?.tools?.length) {
      completionOptions.tools = transformToOpenAi(toolRuntime.tools);
    }

    const completion = await openai.chat.completions.create(completionOptions);

    const message = completion?.choices?.[0]?.message;

    if (!message) {
      return [
        ...messages,
        {
          role: "assistant",
          content: "模型未返回有效内容，请稍后重试。",
        },
      ];
    }

    messages.push(message);

    if (message.tool_calls?.length) {
      for (const toolCall of message.tool_calls) {
        const functionName = toolCall.function.name;
        let toolResultContent = "";

        try {
          const functionArgs = parseToolArguments(toolCall.function.arguments);

          await onToolCall?.({
            name: functionName,
            args: functionArgs,
          });

          toolResultContent = await excuteTool(
            toolRuntime,
            functionName,
            functionArgs
          );

          await onToolResult?.({
            name: functionName,
            result: toolResultContent,
          });
        } catch (error) {
          toolResultContent = `工具执行失败: ${error.message}`;

          await onToolResult?.({
            name: functionName,
            result: toolResultContent,
          });
        }

        messages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content: toolResultContent,
        });
      }

      return getAIResponse({
        openai,
        contextMessageList,
        messages,
        model,
        toolRuntime,
        onToolCall,
        onToolResult,
      });
    }

    return messages;
  } catch (error) {
    logger.log(`请求大模型失败: ${error.message}`, "red");

    return [
      ...messages,
      {
        role: "assistant",
        content:
          "请求 AI 服务时出现异常，请检查网络连接、模型名称或接口配置后重试。",
      },
    ];
  }
}

export default {
  createOpenAIClient,
  getAIResponse,
};
