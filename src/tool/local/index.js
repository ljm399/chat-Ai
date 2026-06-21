import LocalClient from "./LocalClient.js";
import skill from "./skill.js";

/**
 * 初始化本地工具 client，并输出统一后的工具定义与路由映射。
 *
 * @returns {{tools: object[], nameMap: Record<string, LocalClient>}} 本地工具结果
 */
export function getLocalTool() {
  const localClient = new LocalClient();
  localClient.registerTool(skill);

  const localTools = localClient.listTools().tools;
  const localMap = {};

  for (const tool of localTools) {
    localMap[tool.name] = localClient;
  }

  return {
    tools: localTools,
    nameMap: localMap,
  };
}

export default {
  getLocalTool,
};
