/**
 * 用本地实现模拟 MCP client 的基础能力，统一本地工具与 MCP 工具的调用接口。
 */
export default class LocalClient {
  constructor() {
    this.toolMap = new Map();
  }

  /**
   * 注册一个本地工具定义。
   *
   * @param {{define: object, handle: Function}} tool 工具对象
   * @returns {void}
   */
  registerTool(tool) {
    if (!tool?.define?.name || typeof tool?.handle !== "function") {
      throw new Error("本地工具缺少合法的 define.name 或 handle 实现。");
    }

    this.toolMap.set(tool.define.name, tool);
  }

  /**
   * 返回 MCP 风格的工具定义列表。
   *
   * @returns {{tools: object[]}} 工具定义
   */
  listTools() {
    return {
      tools: [...this.toolMap.values()].map((tool) => tool.define),
    };
  }

  /**
   * 按 MCP callTool 风格执行本地工具。
   *
   * @param {{name: string, arguments?: Record<string, any>}} param0 调用参数
   * @returns {Promise<{content: Array<{type: string, text: string}>, isError?: boolean}>} 执行结果
   */
  async callTool({ name, arguments: args = {} }) {
    const tool = this.toolMap.get(name);

    if (!tool) {
      return {
        content: [
          {
            type: "text",
            text: `Error: 未找到名为 ${name} 的本地工具`,
          },
        ],
        isError: true,
      };
    }

    try {
      const content = await tool.handle(args);

      return {
        content: [
          {
            type: "text",
            text: typeof content === "string" ? content : JSON.stringify(content),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
}
