import fs from "fs";
import path from "path";

export default {
  define: {
    name: "skill",
    description: "加载指定 skill 文件的完整内容，便于模型查看技能说明。",
    inputSchema: {
      type: "object",
      properties: {
        skillpath: {
          type: "string",
          description: "需要读取的 skill 文件路径。",
        },
      },
      required: ["skillpath"],
    },
  },

  /**
   * 读取本地 skill 文件内容。
   *
   * @param {{skillpath: string}} param0 工具入参
   * @returns {string} skill 文件文本
   */
  handle({ skillpath }) {
    const targetPath = path.resolve(skillpath);
    const content = fs.readFileSync(targetPath, "utf-8");

    return `skill 的内容如下：\n${content}`;
  },
};
