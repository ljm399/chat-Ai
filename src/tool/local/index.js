import LocalClient from "./LocalClient.js";
import bash from "./bash.js";
import confirm from "./confirm.js";
import glob from "./glob.js";
import grep from "./grep.js";
import readFile from "./read_file.js";
import select from "./select.js";
import skill from "./skill.js";
import writeFile from "./write_file.js";

/**
 * 初始化本地工具 client，并输出统一后的工具定义与路由映射。
 *
 * @returns {{tools: object[], nameMap: Record<string, LocalClient>}} 本地工具结果
 */
export function getLocalTool() {
  const localClient = new LocalClient();
  localClient.registerTool(bash);
  localClient.registerTool(confirm);
  localClient.registerTool(glob);
  localClient.registerTool(grep);
  localClient.registerTool(readFile);
  localClient.registerTool(select);
  localClient.registerTool(skill);
  localClient.registerTool(writeFile);

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
