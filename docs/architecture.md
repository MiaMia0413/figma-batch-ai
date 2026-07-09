# 架构

Figma Batch AI 被划分为两个严格隔离的执行区域。

## UI 线程

`src/ui/` 负责：

- 聊天 UI 和设置。
- OpenAI 兼容的聊天补全请求。
- 工具调用循环和自然语言编排。
- 对大范围或破坏性编辑进行用户确认。

UI 线程不能直接修改 Figma 画布。它只能向主线程请求执行命令。

## 主线程

`src/main/` 负责：

- 访问 Figma Plugin API。
- 命令允许列表和参数校验。
- 以当前选区优先的画布修改。
- 模型设置的客户端存储。

主线程不会调用外部 LLM API，也不会存储任何内置 API key。

## 消息流

```text
用户提示词
  -> UI 向已配置的模型发送聊天补全请求
  -> 模型返回 tool_calls
  -> UI 请求主线程执行允许列表中的命令
  -> 主线程修改选中的 Figma 节点
  -> UI 将工具结果返回给模型
  -> 模型总结已完成的工作
```

## 安全模型

- 不内置 API key。
- 没有插件自有后端。
- 默认优先编辑当前选区。
- `src/main/commands.js` 中的命令注册表作为允许列表。
- 高影响命令会在 UI 工具 schema 中标记，并且执行前需要确认。
- 主线程会限制大范围节点遍历，避免意外修改整个文档。

## 构建产物

Figma 从 `dist/` 加载生成文件：

- `dist/main.js` 由 `src/main/` 构建而来。
- `dist/ui.html` 由 `src/ui/` 构建而来，并内联 CSS 与 JavaScript。

构建脚本保持轻量且无运行时依赖。源码模块便于审查和扩展，生成产物则保持与 Figma 插件 manifest 兼容。

## 扩展指南

添加工具时：

1. 在 `src/main/commands.js` 的 `COMMANDS` 中添加 Figma 命令处理器。
2. 在 `src/ui/tools.js` 的 `TOOLS` 中添加匹配的工具 schema。
3. 如果工具可能修改大量节点，请添加确认元数据。
4. 保持命令通用。不要把公司特定的业务规则加入核心工具。
5. 运行 `npm run build && npm run check`。
