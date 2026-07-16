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
- 命令允许列表、串行调度和参数校验。
- 以当前选区优先的画布修改。
- 模型设置的客户端存储。

主线程不会调用外部 LLM API，也不会存储任何内置 API key。

主线程命令由 `command-dispatcher.js` 严格串行执行。UI 取消或超时时会按 request id 发送 `cancel` 消息；大范围遍历会异步分片，预览和批量修改在协作检查点停止后续操作。若取消到达时最终写入已经完成，命令会返回实际成功结果，避免把已发生的修改误报为取消。

## 共享工具

`src/shared/` 只放不依赖 DOM、Figma Plugin API 或模型请求的纯辅助函数：

- `target-utils.js`：目标短语归一化与通用匹配。
- `tool-registry.js`：LLM 工具 schema、确认要求和预览策略的单一元数据源。
- `command-protocol.js`：模型参数与 UI 内部执行字段的运行时校验。
- `errors.js`：跨线程稳定错误码和序列化协议。

UI 和主线程共同遵守这些规则，避免自然语言规划、预览和最终执行出现不同结果。

## 目标解析

- `src/main/selection/` 提供范围选择、节点遍历、显式 `nodeIds` 解析和基础匹配。
- `src/main/targets/` 提供语义锚点、背景层推断、容器关系、文本角色和几何计算。
- `src/main/selection.js` 与 `src/main/semantic-targets.js` 仅保留兼容门面。
- 普通编辑、语义编辑和复制共用目标归一化与显式目标解析，不允许各自维护一套基础规则。

## 消息流

```text
用户提示词
  -> UI 向已配置的模型发送聊天补全请求
  -> 模型返回 tool_calls
  -> UI 预览并确认高影响工具
  -> UI 请求主线程执行允许列表中的命令
  -> 主线程串行调度并检查取消状态
  -> 主线程修改选中的 Figma 节点
  -> UI 将工具结果返回给模型
  -> 模型总结已完成的工作
```

## 安全模型

- 不内置 API key。
- 没有插件自有后端。
- 默认优先编辑当前选区。
- `src/main/commands.js` 中的命令注册表作为允许列表。
- 高影响命令由 `src/shared/tool-registry.js` 声明确认和预览策略；批量编辑和复制都会先预览，再应用到确认过的节点。
- 主线程会限制大范围节点遍历，避免意外修改整个文档。
- 参数错误、安全拒绝和用户取消通过稳定错误码跨线程传递。
- 预览确认后的 `nodeIds` 必须按原顺序完整解析；目标缺失、跨页或类型变化时会拒绝执行并要求重新预览。
- 批量写入会汇总单节点失败；单个锁定或不可编辑节点不会拖垮整批。
- 工具注册表会显式标记画布写入工具；确认后实际产生修改的命令会调用 `figma.commitUndo()` 提交独立撤销边界，只读命令和零修改结果不会提交。

## 构建产物

Figma 从 `dist/` 加载生成文件：

- `dist/main.js` 由 `src/main/` 构建而来。
- `dist/ui.html` 由 `src/ui/` 构建而来，并内联 CSS 与 JavaScript。

构建脚本使用 esbuild 从 `src/main/index.js` 和 `src/ui/app.js` 自动解析依赖，避免手工维护文件顺序。UI JavaScript 与 CSS 会被内联到 `dist/ui.html`。

## 质量门禁

`npm run verify` 依次运行：

1. Prettier 格式检查。
2. ESLint 静态检查。
3. Vitest 自动化测试。
4. esbuild 生成 `dist/`。
5. 项目结构、生成产物、工具注册和禁用域名校验。

GitHub Actions 在 pull request 和主分支 push 时执行同一套流程，并检查提交的 `dist/` 是否与源码同步。

## 扩展指南

添加工具时：

1. 在 `src/shared/tool-registry.js` 添加 schema、确认要求和预览策略。
2. 在 `src/main/commands.js` 绑定 Figma 命令处理器；需要新预览策略时同时注册 preview handler。
3. 修改目标解析时优先扩展 `src/shared/target-utils.js` 和 `src/main/targets/`，不要在具体工具中重写基础匹配。
4. 使用 `ValidationError`、`SafetyError` 等稳定错误类型，不要通过文案判断错误类别。
5. 新增画布写入工具时必须在工具注册元数据中声明 `mutates`，并复用统一的撤销边界处理。
6. 保持命令通用，不要把公司特定的业务规则加入核心工具。
7. 添加相应测试并运行 `npm run verify`。
