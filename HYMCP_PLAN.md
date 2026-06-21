## 四。function tool体系(6-5)

这一节承接上一节的结论。

`6-4` 里我们已经把 `skill` 按需加载进上下文了，但课件也明确说了：**skill 还只是说明书，不是真正的执行能力。**

真正让 agent 能“做事”的，是 `function tool` 体系。

### 这一节要解决的核心问题

PPT 里一上来讲的是“本地和 MCP 归一”。

因为真实项目里的工具来源一般有两种：

- 本地 tool
- MCP 提供的 tool

它们在三个地方都有差异：

1. 定义格式不一样
2. 获取方式不一样
3. 调用方式不一样

所以这节课的目标不是单纯“加个工具”，而是把这两种工具统一成一套可用的工具体系。

### 一。为什么先要做归一

如果不归一，你后面的请求层就会很麻烦：

- 本地工具要单独维护一套定义
- MCP 工具又要单独维护一套定义
- 调用时还要区分“这是本地工具还是 MCP 工具”
- 模型返回 `tool_calls` 后，执行层会越来越乱

所以这里的思路很像做接口适配层：

- 不管工具来自哪里
- 最终都整理成统一的数据结构
- 最终都走统一的执行入口

### 二。定义格式归一

PPT 里提到，MCP 的工具天然是 MCP 标准格式，而 OpenAI 请求 `tools` 时又是另一套格式。

这个项目先做的第一步是：

- **本地工具也按 MCP 风格来定义**

```js
{
  define: {
    // 按 mcp 标准格式定义 tool 的名字、描述、入参
  },
  handle(arg) {
    // 工具执行逻辑
  }
}
```

在代码里，本地工具 `skill` 就是这么写的，位置在 `code/src/tools/local/skill.js`：

```js
export default {
  define: {
    name: "skill",
    description: "加载skill的详情时使用",
    inputSchema: {
      type: "object",
      properties: {
        skillpath: {
          type: "string",
          description: "要加载的skill的路径"
        }
      },
      required: ["skillpath"]
    }
  },
  handle({ skillpath }) {
    const content = fs.readFileSync(path.resolve(skillpath), 'utf-8');
    return `skill的内容为:${content}`;
  }
};
```

- required: ["skillpath"]解释：
  - **`skillpath` 这个参数是必填项，调用时必须传入，不能省略**。

你要注意这里已经不是上一节那种简单 `toolList + toolMap` 了，而是把：

- 工具描述
- 输入参数 schema
- 执行逻辑

都包到一个对象里。

### 三。调用和获取方式归一

PPT 第二步讲的是“调用和获取方式归一”。

因为：

- 本地工具平时往往是代码里直接 `import`
- 调用时也是自己找函数名去执行

而 MCP 工具则是：

- 通过 `client.listTools()` 获取
- 通过 `client.callTool()` 调用

为了抹平这层差异，项目里专门做了一个 `LocalClient`，位置在 `code/src/tools/local/LocalClient.js`。

这个类故意模仿 MCP 客户端，提供了三个核心方法：

- `registerTool`
- `listTools`
- `callTool`

这样一来，本地工具在使用方式上就和 MCP 工具接近了。

### 四。LocalClient 是怎么模拟 MCP 的

`LocalClient` 内部用一个 `Map` 存本地工具：

- `registerTool(tool)`：注册本地工具
- `listTools()`：返回所有工具的 `define`
- `callTool({ name, arguments })`：按名字找到工具并执行 `handle`

最关键的是它返回值也故意模仿了 MCP 的 `callTool` 结果格式：

```js
{
  content: [
    {
      type: 'text',
      text: content
    }
  ]
}
```

如果出错，也返回统一的错误结构：

```js
{
  content: [
    {
      type: 'text',
      text: `Error: ${error.message}`
    }
  ],
  isError: true
}
```

这一步非常重要，因为后面执行工具时，就可以不关心“这是本地还是 MCP”，只管拿结果里的 `content[0].text`。

### 五。本地工具如何注册成统一格式

`code/src/tools/local/index.js` 里做了本地工具的统一整理。

流程是：

1. new 一个 `LocalClient`
2. 用 `registerTool()` 注册本地工具
3. 用 `listTools()` 拿到本地工具列表
4. 再额外做一个“工具名 -> client”的映射表

代码核心是：

```js
const localClient = new LocalClient();
localClient.registerTool(skill);

const localTools = localClient.listTools();
const localMap = {};
localTools.tools.forEach((tool) => {
  localMap[tool.name] = localClient;
});
```

这样项目就得到了两份东西：

- `localTools`：给模型看的工具定义数组
- `localMap`：执行时按工具名找到对应 client

### 六。MCP 工具怎么接进来

`code/src/tools/mcp/index.js` 负责读取 MCP 配置、连接 MCP 服务、收集 MCP 工具。

它主要做了这几步：

1. 读取用户目录和项目目录下 `.front/settings.json`
2. 合并其中的 `mcpServer` 配置
3. 按不同类型建立 transport
4. 调用 `client.connect()`
5. 调用 `client.listTools()`
6. 给工具名加上服务名前缀
7. 记录“工具名 -> mcp client”的映射

这里支持几种 MCP 连接类型：

- `stdio`
- `sse`
- `http` / `streamablehttp`

### 七。为什么 MCP 工具名要加服务名前缀

因为不同 MCP 服务里，可能会有同名工具。

比如：

- `serverA` 有个 `search`
- `serverB` 也有个 `search`

如果直接合并，一定冲突。

所以项目里把工具名处理成：

```js
${服务名}__${原工具名}
```

例如：

- `github__search_repositories`
- `browser__navigate`

这样既避免重名，也能反查这个工具属于哪个 client。

### 八。MCP 连接后的最终结果是什么

本质上最终要得到两份数据：

```js
{
  tools: [],
  nameMap: {
    "某个工具名": 对应客户端
  }
}
```

这正对应了 `code/src/tools/index.js` 的设计思路。

它先拿本地工具：

```js
const { localTools, localMap } = getLocalTool();
const tools = [...localTools];
const toolNameMap = { ...localMap };
```

然后再把 MCP 工具继续追加进这两个容器里：

```js
linkMcpAndListTool(tools, toolNameMap)
```

所以这里的总目标非常明确：

- `tools`：统一后的工具定义列表
- `toolNameMap`：统一后的工具执行路由表

### 九。OpenAI 和 MCP 的工具格式还不一样，所以还要再转一层

虽然本地工具先按 MCP 风格定义了，但发给 OpenAI 时，格式还是要转成 OpenAI 的 `tools` 协议。

这一步在 `code/src/tools/util.js` 里完成：

```js
export function transformToOpenAi(tools) {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }
  }))
}
```

也就是说，项目内部统一偏向 MCP 风格，但真正请求 OpenAI 时，再做一次协议转换。

这样做的好处是：

- 内部只维护一套工具描述结构
- 对外请求哪个模型协议，就临时转成哪个协议

### 十。app.js 这一节最大的变化是什么

`6-5` 的 `app.js` 和上一节相比，最大的变化不是多了一个 import，而是**请求方式改了**。

它引入了：

```js
import toolResult from "./tools/index.js"
```

然后在请求时把工具体系一起传给请求层：

```js
const nowMessage = await getAIResponse({
  openai,
  toolResult,
  contextMessageList: [systemMessage, userContextMessage, userSkillMessage],
  messages: messages
});
```

也就是说：

- `app.js` 不再自己直接拿一次 assistant 文本回复就结束
- 而是把“上下文 + 工具体系 + 当前消息历史”统一交给请求层处理

因为真正的工具调用循环，已经下沉到 `request/index.js` 了。

### 十一。真正的 function tool 调用链在哪里

核心逻辑在 `code/src/request/index.js`。

完整流程可以拆成下面几步：

1. 调用 OpenAI 接口
2. 把统一后的 tools 一起传进去
3. 拿到模型回复
4. 检查是否有 `tool_calls`
5. 如果有，就逐个执行工具
6. 把工具执行结果以 `role: "tool"` 追加到消息里
7. 再次调用模型
8. 直到没有新的工具调用为止

### 十二。第一次请求时是怎么把工具交给模型的

在 `getAIResponse()` 里，请求写法是：

```js
response = await openai.chat.completions.create({
  model: model || config.model || 'doubao-seed-2.0-code',
  messages: [...contextMessageList, ...messages],
  temperature: 0.7,
  tools: transformToOpenAi(toolResult.tools)
});
```

这里你要特别记住两点：

1. 传给模型的上下文，还是 `[固定上下文, 会话历史]`
2. 但现在额外多传了一个 `tools`

也就是说，模型此时不仅能“看上下文回答”，还知道“自己可以调用哪些函数工具”。

### 十三。模型一旦返回 tool_calls，程序怎么处理

在 `request/index.js` 里，先拿到：

```js
let aiMessage = response.choices[0].message;
messages.push(aiMessage);
```

然后检查：

```js
if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
```

如果模型发起了工具调用，就遍历每一个 `toolCall`：

```js
for (const toolCall of aiMessage.tool_calls) {
  const functionName = toolCall.function.name;
  const functionArgs = JSON.parse(toolCall.function.arguments);
  const excuteResult = await excuteTool(functionName, functionArgs);

  messages.push({
    tool_call_id: toolCall.id,
    role: "tool",
    content: excuteResult
  });
}
```

这里就是标准的 tool use 回填流程：

- assistant 先说“我要调哪个工具”
- 程序真正去执行工具
- 执行结果以 `tool` 消息身份放回消息数组
- 再继续问模型

### 十四。统一执行入口 excuteTool 做了什么

`code/src/tools/index.js` 里提供了统一执行函数：

```js
export async function excuteTool(name, args) {
  const result = await toolNameMap[name].callTool({
    name: name,
    arguments: args
  });
  return result.content[0].text
}
```

这段代码很关键，因为它完全不在乎工具是本地的还是 MCP 的。

它只做两件事：

1. 根据 `toolNameMap[name]` 找到对应 client
2. 调用这个 client 的 `callTool`

由于本地 `LocalClient` 和 MCP client 都已经被整理成相似接口，所以这里可以真正做到统一执行。

### 十五。为什么 getAIResponse 里要递归再调一次自己

工具执行完以后，代码里不是直接返回，而是：

```js
await getAIResponse(questionObj);
```

原因很简单：

- 模型第一次回复，可能只是为了发起工具调用
- 工具结果回填后，模型还要再看一次结果，才能给出最终答复
- 而且一次工具调用后，模型还有可能继续发起下一轮工具调用

所以这个递归调用的本质是：

- 只要模型还在要工具
- 就继续“请求模型 -> 执行工具 -> 回填结果 -> 再请求模型”

直到模型最终只返回普通 assistant 内容，不再请求工具为止。

### 十六。app.js 最后为什么是取最后一个 assistant 消息

因为现在 `messages` 里不再只有用户和 assistant，还会多出：

- assistant 的 tool call 消息
- tool 的执行结果消息
- 再次生成的 assistant 消息

所以 `app.js` 不能像之前那样简单打印单条回复，而是改成：

```js
const lastAssistantMessage = [...nowMessage].reverse().find(msg => msg.role === 'assistant');
```

然后把最后一个 assistant 消息内容展示出来。

这说明从 `6-5` 开始，消息数组已经变成了真正的“多角色协作记录”，而不是简单聊天记录。

### 十七。MCP 为什么要做成异步、非阻塞

PPT 最后一页讲的是优化点。

因为 MCP 往往连接的是第三方服务，它们可能：

- 连接失败
- 启动很慢
- 长时间无响应

所以对于 MCP 工具，设计上应该尽量：

- 异步连接
- 单个服务失败不影响整体
- 不要因为一个 MCP 服务卡住整个应用

代码里也已经体现了这个思路：

- `linkMcpAndListTool()` 是 `async`
- 每个服务都包在 `try/catch` 里
- 单个服务连不上时直接跳过，不中断其他服务