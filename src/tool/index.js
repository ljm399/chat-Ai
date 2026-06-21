import { getLocalTool } from "./local/index.js";
import { linkMcpAndListTool } from "./mcp/index.js";

let toolRuntimePromise = null;

/**
 * 构建统一工具运行时，合并本地工具与 MCP 工具。
 *
 * @returns {Promise<{tools: object[], toolNameMap: Record<string, {callTool: Function}>}>} 统一工具运行时
 */
export async function getToolRuntime() {
  if (!toolRuntimePromise) {
    toolRuntimePromise = (async () => {
      const { tools: localTools, nameMap: localMap } = getLocalTool();
      const tools = [...localTools];
      const toolNameMap = { ...localMap };

      await linkMcpAndListTool(tools, toolNameMap);

      return {
        tools,
        toolNameMap,
      };
    })();
  }

  return toolRuntimePromise;
}

/**
 * 统一执行工具，不关心工具来自本地还是 MCP。
 *
 * @param {{toolNameMap: Record<string, {callTool: Function}>}} toolRuntime 工具运行时
 * @param {string} name 工具名称
 * @param {Record<string, any>} args 工具参数
 * @returns {Promise<string>} 工具文本结果
 */
export async function excuteTool(toolRuntime, name, args) {
  const client = toolRuntime?.toolNameMap?.[name];

  if (!client) {
    throw new Error(`未找到名为 ${name} 的工具`);
  }

  const result = await client.callTool({
    name,
    arguments: args,
  });
  const firstContent = result?.content?.[0];

  if (!firstContent) {
    return "";
  }

  if (firstContent.type === "text") {
    return firstContent.text;
  }

  return JSON.stringify(firstContent);
}

export default {
  getToolRuntime,
  excuteTool,
};
