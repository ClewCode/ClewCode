<p align="center">
  <img src="../assets/ceph-logo-long.png" alt="Ceph Code" width="480" />
</p>

<p align="center">
  <strong>语言：</strong>
  <a href="../README.md">English</a> ·
  <a href="README_ZH.md"><strong>中文 (简体)</strong></a> ·
  <a href="README_TH.md">ไทย</a>
</p>

# Ceph Code

Ceph Code 是对 Anthropic 官方 [Claude Code](https://claude.ai/code) CLI 的独立、研究导向的 **逆向工程重建** 项目。目标是从源码获得 **可运行、可构建、可调试** 的终端工作流，而不是只能使用闭源二进制；并在此基础上扩展多供应商路由、适配器与工程化工具。

> **免责声明：** 本项目与 Anthropic PBC 无隶属、背书或赞助关系。上游 Claude Code 为专有软件；本项目为研究与自托管用途重建并扩展行为。分发或部署前请阅读 [LICENSE.md](../LICENSE.md)。

## 项目定位

| 方面 | Ceph Code 提供的内容 |
| --- | --- |
| **源码级还原** | 重建与 Claude Code 终端体验、工具与扩展点一致的 CLI |
| **构建与调试** | 可使用 `bun run dev`、类型检查、测试并在本地修改的 Bun/TypeScript 代码树 |
| **企业级能力面** | Bridge/远程会话、MCP、插件、Skills、Agent/Supervisor、语音、会话记忆、LSP 等——无需所有工作流都依赖 Anthropic 托管独占功能 |
| **我们的差异** | 声明式 **多供应商** 路由（`providers.json`、`/model`）、供应商适配器及开发工具（`preload`、`codeindex`、`session`） |

> 这是面向需要透明度与供应商选择的工程师的社区重建，**不是** Anthropic 官方发行版。

## Ceph Code vs Claude Code — 客观对比

从用户实际使用角度出发的对比。Ceph Code 是 **研究导向的分支** — 以部分精致性换取供应商自由。

| 能力 | Claude Code (Anthropic) | Ceph Code |
|---|---|---|
| **AI 供应商** | 仅 Anthropic Claude | **15+** — Anthropic, OpenAI, Google, DeepSeek, OpenRouter, Ollama, xAI, Mistral, Groq, Copilot |
| **运行时切换模型** | ❌ | ✅ `/model`, `/provider` |
| **插件系统** | MCP + skills | **完整系统** — pre/post hooks, agents, skills, MCP, LSP |
| **Computer Use** | ✅ 仅 macOS | ✅ **macOS + Windows + Linux** 已准备 |
| **Chrome 控制** | Claude in Chrome | 支持 Chrome, Brave, Edge, Opera, Vivaldi |
| **自建搜索引擎** | ❌ 无 | ✅ SearXNG Docker + `/searxng` 命令 |
| **远程桥接** | ❌ 无 | ✅ WebSocket 远程控制 |
| **权限模式** | Default / Plan / YOLO | **6 种** — Auto, YOLO Lite, YOLO MAX |
| **上下文压缩** | 调用 API | **KiloCompact** — 本地执行，无需 API |
| **开源** | 可读源码 | **完全开源** |
| **生态系统** | 庞大，官方 Anthropic | 较小 — 社区驱动 |
| **稳定性** | 高 — 团队 + CI | 中等 — 单人开发 |
| **离线/隔离环境** | ❌ 需连接 claude.ai | ✅ 可使用 Ollama + SearXNG + 本地模型 |

**总结：** 需要企业支持和单一稳定供应商请用 Claude Code。重视供应商选择自由、自托管和深度定制能力请用 Ceph Code。

## 功能概览

Ceph Code 是在终端中运行的 AI 编程助手，可检查与编辑本地代码库、执行工具、切换模型供应商，并通过命令、Agent、插件与项目 Skills 协调较长的工作流。

亮点：

- **多供应商 AI 路由**：Anthropic、OpenAI、Google Gemini、OpenRouter、Ollama、GitHub Copilot 及其他 OpenAI 兼容服务
- **运行时切换模型**：`/model` 与供应商配置
- **基于工具的编码工作流**：读写搜、Shell、LSP、浏览、MCP
- **插件钩子**：拦截提示词、Shell、工具调用与文件编辑
- **Skills**：内置与项目级 `.claude/skills/`
- **Agent 与 Supervisor**：研究、编码与协调任务
- **会话与 Bridge**：保存上下文、恢复工作、远程协作

## 快速开始

### 全局安装

```bash
npm install -g cephcode
```

或：

```bash
bun install -g cephcode
```

在任意项目目录运行：

```bash
ceph
```

### 从源码运行

```bash
git clone https://github.com/CephCore/cephcode.git
cd claudecode
bun install
bun run build
bun run start
```

## 环境要求

- 本地开发需要 [Bun](https://bun.sh) 1.3 或更高版本
- 至少一个供应商凭据，如 `ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、`GOOGLE_API_KEY` 等
- 支持 Windows、macOS、Linux 或 WSL2

## 供应商配置

在 Shell 或 `.env` 中设置：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
export OPENROUTER_API_KEY=sk-or-...
export OLLAMA_HOST=http://localhost:11434
```

在 Ceph Code 内切换模型或供应商：

```text
/model
/model list
/model openai/gpt-4o
/model google/gemini-2.5-pro
```

供应商概览见 [docs/providers.html](../docs/providers.html)。

## 常用命令

```text
/model      切换模型或供应商
/status     会话、供应商与上下文状态
/doctor     运行诊断
/context    查看上下文占用
/compact    压缩对话上下文
/mcp        管理 MCP 服务器
/plugin     管理插件
/bridge     配置 Bridge 模式
```

在 CLI 中输入 `/` 可发现全部命令。

## 开发

```bash
bun run dev              # 开发模式（watch）
bun run start            # 从源码运行 CLI
bun run build            # 构建到 dist/
bun test                 # 运行测试
bun x tsc --noEmit       # 仅类型检查
bun run lint:check       # Lint 检查
bun run format:check     # 格式检查
bun run check:ci         # Biome CI
```

项目工具：

```bash
bun run preload <module>     # 编辑前预加载模块上下文
bun run session <command>    # 保存/列出/恢复会话
bun run codeindex <command>  # 索引与搜索代码库
bun run codegraph            # 生成模块依赖图
bun run ast-grep -- <args>   # 基于 AST 的搜索或改写
```

## 项目结构

```text
src/
├── main.tsx              CLI 引导与主运行时
├── query.ts              核心查询处理
├── QueryEngine.ts        查询编排
├── commands/             斜杠命令实现
├── tools/                内置工具
├── services/
│   ├── ai/               供应商管理、适配器、模型注册表
│   ├── mcp/              MCP 客户端
│   ├── plugins/          插件生命周期与钩子
│   ├── tools/            工具执行服务
│   ├── lsp/              LSP 集成
│   ├── Supervisor/       Agent 监督
│   └── SessionMemory/    持久会话记忆
├── skills/               Skills 加载
├── cli/                  Ink/React 终端 UI
├── components/           终端 UI 组件
├── bridge/               远程协作 Bridge
├── coordinator/          多 Agent 协调
├── keybindings/          自定义快捷键
├── state/                轻量响应式存储
└── vim/                  Vim 编辑模式
```

## 架构

```text
终端 UI
  -> 命令与快捷键层
  -> 供应商管理与适配器
  -> 查询引擎与流式循环
  -> 工具执行器
  -> 插件钩子、MCP、LSP、Agent、记忆、Bridge
```

供应商 SDK 由适配器封装，运行时以统一接口处理流式响应、工具调用、用量元数据与内容块。

## 文档

- [安装](../docs/installation.html)
- [快速开始](../docs/quick-start.html)
- [配置](../docs/configuration.html)
- [AI 供应商](../docs/providers.html)
- [模型](../docs/models.html)
- [命令](../docs/commands.html)
- [工具](../docs/tools.html)
- [插件](../docs/plugins.html)
- [Skills](../docs/skills.html)
- [架构](../docs/architecture.html)
- [权限模型](../docs/permission-model.html)
- [Bridge 模式](../docs/features/bridge-mode.html)
- [SearXNG 搜索](../docs/features/searxng-search.html)
- [故障排除](../docs/troubleshooting.html)
- [Evals](../docs/features/evals.html)

## 调试

```bash
DEBUG=1 bun run src/main.tsx
DEBUG=provider:anthropic bun run src/main.tsx
```

## 平台说明

### Windows

```powershell
Remove-Item -Recurse -Force node_modules
bun install
bun run dev
```

Windows 版 `ripgrep` 位于 `src/utils/vendor/ripgrep/x64-win32/rg.exe`。

### 生产构建

生产构建会将 Electron、Chromium BiDi、Anthropic 平台 SDK 变体、AWS SDK、Google 认证库、Sharp、音频采集包及 React DevTools 等设为 external。

## 贡献

欢迎 Issue 与 Pull Request。提交 PR 前请运行：

```bash
bun test
bun run lint:check
bun run format:check
bun x tsc --noEmit
```

请参阅 [CONTRIBUTING.md](../CONTRIBUTING.md)、[CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) 与 [SECURITY.md](../SECURITY.md)。

## 更新日志

[CHANGELOG.md](../CHANGELOG.md)

## 许可证

[LICENSE.md](../LICENSE.md)
