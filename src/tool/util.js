/**
 * 将内部统一的 MCP 风格工具定义转换成 OpenAI tools 协议。
 *
 * @param {Array<{name: string, description?: string, inputSchema?: object}>} tools 工具定义
 * @returns {object[]} OpenAI tools 数组
 */
export function transformToOpenAi(tools) {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters: tool.inputSchema || {
        type: "object",
        properties: {},
      },
    },
  }));
}

export default {
  transformToOpenAi,
};
