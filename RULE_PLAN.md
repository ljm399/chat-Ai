# 规则上下文接入方案

## Summary
为 `contextReader.js` 增加通用的 `getRulesContext()`，按 `.front/rules/*.md` 中 frontmatter 的 `paths` 规则进行匹配；只有当用户通过 `@文件` 选中了某个上下文文件，且该文件路径命中规则时，才把对应规则内容注入请求。规则消息使用 `role: "user"`，并作为一条独立上下文消息插入到现有 `systemMessage`、`userContextMessage` 和会话消息之间。

## Key Changes
- 在 `src/utils/contextReader.js` 中补充通用 rules 读取能力。
  - 基于当前项目根目录固定读取 `.front/rules`，不要依赖 `process.cwd()` 作为规则目录推断依据。
  - 扫描 `.front/rules/*.md`。
  - 解析每个规则文件开头的 frontmatter，只支持当前需要的最小格式：
    - `--- ... ---`
    - `paths:` 下的 glob 列表，如 `**/*.css`
  - 将 frontmatter 后面的正文作为规则内容。
  - 暴露 `getRulesContext(selectedContextFile)`：
    - 未传 `selectedContextFile` 时返回空字符串。
    - 传入后，使用其项目相对路径与各规则的 `paths` 做匹配。
    - 命中多个规则时，按文件名排序后稳定拼接，避免上下文顺序漂移。
    - 返回值直接是拼好的 rules 文本，不额外依赖 `src/docs` 新模板。
  - 同时清理这个文件里现有的调试残留：
    - 删除顶层 `console.log`
    - 删除顶层 `getUserContext().then(...)`
    - 统一把“项目根目录”改为基于当前模块位置推导，避免从 `src/utils` 启动时读错 `.front.md`

- 在 `src/app.js` 中接入 rules 上下文。
  - 新增 `rulesContextMessage` 的局部构建逻辑，不做启动时全局初始化。
  - 在 `submitCurrentInput()` 中，先根据 `state.selectedContextFile` 调用 `getRulesContext(...)`。
  - 只有返回非空文本时才构造：
    - `role: "user"`
    - `content: rulesContext`
  - 请求消息顺序固定为：
    1. `systemMessage`
    2. `userContextMessage`
    3. `rulesContextMessage`（若有）
    4. `messages`
  - 历史记录保存逻辑同步改为保存这条 rules 消息，保证 `.front/history/*.json` 里看到的内容与真实请求一致。

## Public Interface / Behavior
- `contextReader.js` 新增导出：
  - `getRulesContext(selectedContextFile)`
- 规则行为定义：
  - 仅在用户显式 `@` 了文件时参与匹配。
  - 仅注入命中的规则文件内容。
  - 当前 `css.md` 这类 frontmatter `paths` 规则文件即开即用，无需额外注册。
- 不新增新的命令行交互，不改现有 `@文件` 选择方式。

## Test Plan
- 静态与语法检查：
  - `node --check src/utils/contextReader.js`
  - `node --check src/app.js`
- 规则读取验证：
  - 传入一个相对路径为 `src/styles/a.css` 的模拟 `selectedContextFile`，应命中 `.front/rules/css.md`
  - 传入 `src/app.js`，不应命中 `css.md`
  - 未传 `selectedContextFile` 时返回空字符串
- 运行时场景：
  - 用户未使用 `@文件`：请求中不应出现 rules 消息
  - 用户 `@某个 .css/.less 文件`：请求中应出现一条 `role: "user"` 的 rules 消息
  - 退出后生成的 `.front/history/*.json` 中，应包含这条 rules 消息
- 路径稳定性：
  - 从项目根目录启动
  - 从 `src/utils` 等子目录直接执行模块调试
  - 两种情况下都应能读到项目根 `.front/rules` 和项目根 `.front.md`

## Assumptions
- 规则文件先按 `.md` 处理，v1 不扩展到子目录外的其他后缀。
- frontmatter 只实现当前所需最小能力：`paths` 数组；不做完整 YAML 解析器能力。
- 不新增第三方依赖，优先用轻量本地解析完成该能力。
- rules 内容直接使用规则文件正文，不再新增 `rulesContext.md` 模板；如果后续需要统一包装，再单独补模板层。
