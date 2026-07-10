# Figma Batch AI

Figma Batch AI 是一个注重隐私的 Figma 插件，可通过自然语言完成批量编辑、图层清理和设计 QA。

第一个版本专注于处理已有的 Figma 文件，而不是从零生成完整 UI：

- 通过自然语言定位并批量编辑已有设计稿：文本、填充、圆角、透明度、尺寸和名称。
- 选中图层可作为第二交互方式，用于缩小编辑范围；选中 Frame/Group 时会继续向内检索可修改的子图层。
- 通过“先预览再执行”的安全流程清理图层名称。
- 对命名、空文本、颜色数量和字号数量进行轻量级设计 QA 检查。
- 使用你自己的 OpenAI 兼容模型端点和 API key。

## 设计目标

- **默认通用**：不绑定任何公司特定的服务、域名、模板或业务流程。
- **安全编辑**：破坏性操作和大范围操作都需要明确确认。
- **易于扩展的工具**：Figma 命令统一注册在一个命令注册表中。
- **注重隐私**：API key 存储在 `figma.clientStorage` 中；插件没有自有后端。

## 快速开始

1. 安装依赖并完成工程验证：
   ```sh
   npm install
   npm run verify
   ```
2. 打开 Figma 桌面版。
3. 前往 **Plugins -> Development -> Import plugin from manifest...**
4. 选择本文件夹中的 `manifest.json`。
5. 打开插件，并配置一个 OpenAI 兼容 API：
   - API key
   - 端点，例如 `https://api.openai.com/v1`
   - 模型，例如 `gpt-4o-mini`

## 项目结构

```text
FigmaBatchAI/
  manifest.json
  dist/
    main.js              # 生成的 Figma 主线程 bundle
    ui.html              # 生成的 Figma UI bundle
  src/
    shared/              # UI 与主线程共享的纯工具函数
    main/                # Figma 沙箱源码模块
      index.js
      command-dispatcher.js
      commands.js
      settings.js
      selection/         # 范围、遍历、显式目标与基础匹配
      targets/           # 语义锚点、背景、容器和文本角色
      tools/
    ui/                  # 插件 UI 源码模块
      index.html
      styles.css
      app.js
      figma-bridge.js
      model-client.js
      tool-loop.js
      settings-panel.js
  docs/
    architecture.md      # 架构、安全模型和扩展指南
    product-engineering-handbook.md
                         # 产品定位、匹配规则和工程守则
  scripts/
    build.mjs            # esbuild 双入口构建与 UI 内联
    check.mjs            # 校验生成的插件文件
  tests/                 # Vitest 单元与轻量集成测试
```

源码被拆成小型原生 JavaScript 模块。`src/shared/` 只放 UI 与主线程都能复用的纯函数，避免命令、安全和匹配逻辑漂移。esbuild 会从 UI 和主线程入口自动解析依赖，并生成 Figma 可加载的单文件产物到 `dist/`。

常用工程命令：

```sh
npm run dev          # 监听源码并重建 dist
npm test             # 运行 Vitest
npm run lint         # 运行 ESLint
npm run format:check # 检查 Prettier 格式
npm run verify       # 完整质量门禁
```

开发新能力前，先对照 `docs/product-engineering-handbook.md`，确保产品定位、匹配策略、安全边界和通用性没有跑偏。

## 第一个版本的范围

可以尝试这样的提示词：

- "把所有主按钮的背景色改成 #4BC430"
- "把所有 CTA 按钮文案改成“去使用”"
- "Round selected cards to 12px"
- "Rename similar layers using clear product UI names"
- "Check this design for QA issues"

## 安全说明

- 插件不会内置任何 API key。
- API 请求会直接从 Figma 插件 UI 发送到用户配置的端点。
- 工具执行仅限于 `src/main/commands.js` 中的命令允许列表；`npm run check` 会校验 UI 工具 schema 与主线程 allowlist 的一致性。
- 大范围编辑和复制类高影响操作会在执行前确认；未选中图层时默认面向当前页面，选中图层时可作为范围限制。
