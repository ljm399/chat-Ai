# 自定义指令功能实现计划

## Summary

在当前项目的 `/` 指令体系上增加自定义指令能力：

- 指令来源扩展为内置指令、`src/docs` 模板、全局自定义、项目自定义。
- 全局自定义指令读取用户主目录 `.front/commands.json`。
- 项目自定义指令读取当前项目 `.front/commands.json`。
- 终端内 `/add`、`/edit`、`/delete` 只修改项目级 `.front/commands.json`。
- 用户也可以手动编辑 JSON 文件维护自定义指令。
- 禁止自定义指令与当前可见指令同名。

## Key Changes

- 在 `src/recommends` 下新增自定义指令管理模块，负责读取、校验和写入自定义指令。
- 扩展 `getSlashCommands()`，按内置、`src/docs`、全局自定义、项目自定义顺序合并。
- 自定义指令 JSON 使用数组结构：

```json
[
  {
    "label": "review",
    "description": "进行代码审查",
    "content": "请以代码审查视角检查下面内容，优先指出 bug、风险和缺失测试。"
  }
]
```

- `/add`、`/edit`、`/delete` 在用户按 Enter 后拦截处理，不发送给模型。
- 普通 `/` 菜单继续选择指令，并展示来源信息。

## Behavior Details

- `label` 是唯一标识，使用大小写敏感的精确匹配。
- JSON 文件不存在时视为空数组。
- JSON 解析失败时提示错误并忽略该文件，程序继续运行。
- `/add` 依次收集 `label`、`description`、`content`，校验无重名后写入项目配置。
- `/edit` 只列出项目级自定义指令，留空表示保留原值。
- `/delete` 只删除项目级自定义指令。
- 全局自定义指令只读取，不通过终端管理命令写入。

## Test Plan

- `node --check src/app.js`
- `node --check src/recommends/commandManager.js`
- `node --check src/recommends/customCommandManager.js`
- 验证无配置文件时 `/` 仍展示内置指令。
- 验证项目 `.front/commands.json` 中的指令可展示。
- 验证用户主目录 `.front/commands.json` 中的指令可展示。
- 验证 `/add`、`/edit`、`/delete` 会更新项目级配置。
- 验证重名指令被拒绝。
- 验证损坏 JSON 不会导致程序崩溃。

## Assumptions

- 自定义指令属于 `/` 推荐体系，代码放在 `src/recommends` 下。
- 终端内管理只操作当前项目 `.front/commands.json`。
- 当前版本不做复杂多行编辑，长模板可以手动编辑 JSON。
- `src/docs` 模板仍为只读来源。
