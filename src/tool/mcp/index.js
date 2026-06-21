import fs from "fs";
import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import logger from "../../utils/logger.js";
import {
  getCurrentWorkingDir,
  getUserHomeDir,
} from "../../utils/pathUtils.js";

/**
 * 读取用户级与项目级 settings.json，并合并其中的 mcpServer 配置。
 *
 * @returns {Record<string, any>} MCP server 配置对象
 */
function readMergedMcpServerConfig() {
  const settingsPaths = [
    path.join(getUserHomeDir(), ".front", "settings.json"),
    path.join(getCurrentWorkingDir(), ".front", "settings.json"),
  ];
  const mergedMcpServer = {};

  for (const settingsPath of settingsPaths) {
    try {
      if (!fs.existsSync(settingsPath)) {
        continue;
      }

      const rawContent = fs.readFileSync(settingsPath, "utf-8");

      if (!rawContent.trim()) {
        continue;
      }

      const parsedConfig = JSON.parse(rawContent);
      Object.assign(mergedMcpServer, parsedConfig.mcpServer || {});
    } catch (error) {
      logger.log(`读取 MCP 配置失败: ${settingsPath}`, "yellow");
      logger.log(`原因: ${error.message}`, "yellow");
    }
  }

  return mergedMcpServer;
}

/**
 * 根据 MCP 服务配置创建 transport。
 *
 * @param {Record<string, any>} serverConfig 服务配置
 * @returns {import("@modelcontextprotocol/sdk/shared/transport.js").Transport} transport 实例
 */
function createTransport(serverConfig) {
  const type = String(serverConfig?.type || "stdio").toLowerCase();

  if (type === "stdio") {
    return new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args || [],
      env: serverConfig.env,
      cwd: serverConfig.cwd,
      stderr: serverConfig.stderr || "inherit",
    });
  }

  if (type === "sse") {
    return new SSEClientTransport(new URL(serverConfig.url), {
      requestInit: {
        headers: serverConfig.headers || {},
      },
    });
  }

  if (type === "http" || type === "streamablehttp") {
    return new StreamableHTTPClientTransport(new URL(serverConfig.url), {
      requestInit: {
        headers: serverConfig.headers || {},
      },
    });
  }

  throw new Error(`暂不支持的 MCP transport 类型: ${type}`);
}

/**
 * 连接 MCP 服务并将工具列表合并到统一工具容器中。
 *
 * @param {object[]} tools 统一工具数组
 * @param {Record<string, {callTool: Function}>} toolNameMap 工具名到 client 的映射
 * @returns {Promise<void>}
 */
export async function linkMcpAndListTool(tools, toolNameMap) {
  const mcpServerConfig = readMergedMcpServerConfig();
  const serverEntries = Object.entries(mcpServerConfig);

  for (const [serverName, serverConfig] of serverEntries) {
    try {
      const client = new Client({
        name: "frontcode-ai-project",
        version: "1.0.0",
      });
      const transport = createTransport(serverConfig);

      await client.connect(transport);

      const mcpToolResult = await client.listTools();

      for (const tool of mcpToolResult.tools || []) {
        const prefixedName = `${serverName}__${tool.name}`;

        tools.push({
          ...tool,
          name: prefixedName,
        });

        toolNameMap[prefixedName] = {
          callTool: ({ name, arguments: args }) =>
            client.callTool({
              name: name.replace(`${serverName}__`, ""),
              arguments: args,
            }),
        };
      }
    } catch (error) {
      logger.log(`连接 MCP 服务失败，已跳过: ${serverName}`, "yellow");
      logger.log(`原因: ${error.message}`, "yellow");
    }
  }
}

export default {
  linkMcpAndListTool,
};
