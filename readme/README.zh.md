<p align="center">
  <img src="../assets/claude-logo-long.png" alt="Clew" width="480" />
</p>

<p align="center">
  <strong>语言：</strong>
  <a href="../README.md">English</a> ·
  <a href="README_ZH.md"><strong>中文 (简体)</strong></a> ·
  <a href="README_TH.md">ไทย</a>
</p>

# Clew

Clew 是一个非官方的 AI 辅助软件开发 CLI。

本项目是一个源码级 rebuild 与 extension 项目，面向研究、本地开发、调试、自托管工作流和多供应商选择。

本项目不是 Anthropic 的官方产品、发行版、合作项目或受支持实现。

> **免责声明：** Anthropic、Claude 和 Claude Code 是其各自所有者的商标。Anthropic 的官方 Claude Code 产品是专有软件。本项目与 Anthropic PBC 无隶属、背书、赞助或批准关系。使用、修改、分发或部署本仓库前，请阅读 [LICENSE.md](../LICENSE.md)。

## 本项目提供什么

| 方面               | 说明                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------- |
| Source-built CLI | 一个 Bun/TypeScript 终端应用，可在本地构建、测试、检查和修改                                              |
| 多供应商路由           | 通过 provider adapters 和模型选择命令支持多个 AI provider                                        |
| 开发者工具            | 支持 context inspection、code review、simplify、research、plugins、MCP、LSP、sessions 和后台工作流 |
| 本地扩展能力           | 支持 plugins、hooks、skills、custom tools、scheduled tasks 和项目级配置                         |
| 研究用途             | 可用于研究 AI coding agent 架构、terminal UX、provider routing 和 tool execution              |

## 功能概览

Clew 直接在终端中运行。它可以检查和编辑本地代码库，在权限控制下执行 shell commands，切换 provider/model，并通过 agents、plugins、skills 和 scheduled tasks 协调较长的工作流。

亮点：

* **多供应商 AI 路由**：支持 Anthropic、OpenAI、Google Gemini、OpenRouter、Ollama、GitHub Copilot 以及 OpenAI-compatible endpoints
* **运行时模型切换**：使用 `/model` 在 session 中切换 provider 或 model
* **Tool-driven workflows**：读取、搜索、编辑、写入文件；执行 shell commands；查询 LSP；运行 MCP tools；连接 browser automation
* **Plugin hooks**：hook prompts、shell execution、tool calls、message display、session start 和 file editing actions
* **Dynamic skills**：从内置目录和项目级 `.claude/skills/` 加载 skills
* **Code review tools**：使用 `/code-review --fix` 检查变更代码并应用修复；使用 `/simplify` 做 cleanup-focused review
* **Model picker**：选择全局或 session-only 模型默认值
* **Plugin marketplace support**：下载 plugin sources 时支持 `skipLfs`
* **Local research workflow**：配置后可用 `/research <query>` 执行本地优先的研究与网页抓取工作流
* **Agents 和 supervisor**：管理后台 agents、multi-step workflows、summaries、task status、approvals 和 session state
* **后台 shell commands**：使用 `!bg <command>` 运行长时间命令
* **Scheduled tasks**：通过 `/task` 创建一次性或循环任务
* **Sessions 和 bridge mode**：保存、恢复并协调开发 session

## 快速开始

### 全局安装

```bash id="8rzhsy"
npm install -g @jonusnattapong/claudecode
```

或：

```bash id="soh0em"
bun install -g @jonusnattapong/claudecode
```

在项目目录中运行 CLI：

```bash id="6f1a3n"
clew
```

> global launcher 需要本机已安装 Bun。

如果 `package.json` 中配置了 alias，也可以运行：

```bash id="h0514a"
clewcode
```

### 从源码运行

```bash id="1hwbnw"
git clone https://github.com/JonusNattapong/ClewCode.git
cd claudecode

bun install
bun run build
bun run start
```

开发模式：

```bash id="cd78qq"
bun run dev
```

## 环境要求

* Bun 1.3 或更高版本
* Node.js 18 或更高版本
* Git
* Windows、macOS、Linux 或 WSL2
* 至少一个受支持 provider 的 API key；如果使用 Ollama 等本地 provider，则可不需要远程 provider key

## Provider 配置

在 shell 或本地 `.env` 文件中设置 provider keys。

```bash id="egj1oz"
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
export OPENROUTER_API_KEY=sk-or-...
export OLLAMA_HOST=http://localhost:11434
```

在 session 中切换 model 或 provider：

```text id="12rs65"
/model
/model list
/model openai/gpt-4o
/model google/gemini-2.5-pro
```

Provider 文档：

```text id="w7gdzb"
../docs/providers.html
```

## 常用命令

```text id="89gxr6"
/model        切换 model 或 provider
/taste        打开 taste 偏好学习菜单
/status       查看 provider、session 和 context 状态
/doctor       运行 diagnostics
/context      检查 context 使用情况
/compact      压缩 conversation history
/mcp          管理 MCP servers
/code-review  检查变更代码
/simplify     cleanup-focused review
/plugin       管理 plugins 和 hooks
/bridge       配置 bridge mode
/agent        管理 background agent workflows
/daemon       打开 autonomous daemon dashboard
/task         创建或管理 scheduled tasks
```

在 CLI 中输入 `/` 查看全部命令。

## Taste — 偏好学习

Taste 是一个本地优先的偏好学习运行时。它从接受、拒绝、编辑、测试、lint 和手动规则中学习。结合符号规则、语义偏好评分和 contextual bandit 优化来适应用户的编码风格。**不会 fine-tune 基础 LLM。**

```text
/taste                打开交互菜单
/taste learn <rule>   添加手动规则
/taste forget <id>    删除规则
/taste profile        显示所有规则
/taste events         显示最近事件
/taste decay          应用置信度衰减
/taste eval           运行自我评估
/taste export         导出高置信度规则
/taste import <file>  从文件导入规则
/taste on             启用 taste
/taste off            禁用 taste
```

主要功能：

- **交互菜单** — 方向键导航的 Dialog，11 个操作，Spinner 加载状态
- **编辑验证** — 在权限请求期间扫描编辑内容，警告违反学习规则的操作
- **配置热重载** — 通过 `subscribeToSettingsChanges()` 订阅 `settings.json` 变更
- **状态行** — 在 PromptInputFooter 中显示 `ⓘ taste: N 条规则`
- **提示注入** — 在系统提示中注入 `<clew_taste>` XML 区块，最多 8 条相关规则

详见 [docs/taste.html](../docs/taste.html)。

## Scheduled Tasks

Scheduled task 系统通过 `/task` 使用。

```text id="4a7zqj"
/task
```

示例：

```text id="3lm95i"
/task
Name: 服务器检查
Schedule: Daily
Time: 20:00
Prompt: 检查本地服务器状态
Storage: Durable
```

```text id="7mizgu"
/task
Name: 提醒提交
Schedule: In N minutes
Delay: 10
Prompt: 提醒我提交代码
Storage: Session-only
```

任务行为：

* Durable tasks 保存到 `.claude/scheduled_tasks.json`
* Session-only tasks 只在当前 session 中运行
* Recurring tasks 使用 5-field cron syntax
* One-shot tasks 运行后删除
* 按本机 timezone 执行

## 开发

```bash id="0qwpym"
bun run dev              # 开发模式
bun run start            # 从源码运行 CLI
bun run build            # 构建到 dist/
bun test                 # 运行 tests
bun x tsc --noEmit       # type check
bun run lint:check       # 检查 Biome lint
bun run format:check     # 检查 Biome formatting
bun run check:ci         # 运行 Biome CI validation
```

开发者工具：

```bash id="zljj16"
bun run preload <module>     # preload module context
bun run session <command>    # save、list 或 restore session context
bun run codeindex <command>  # index 并搜索 codebase
bun run codegraph            # 生成 module dependency graph
bun run ast-grep -- <args>   # 使用 AST 搜索或 rewrite
```

## 项目结构

```text id="k0g51v"
src/
├── main.tsx              # Terminal UI bootstrap 和 main loop
├── query.ts              # Query processing 和 system prompt logic
├── QueryEngine.ts        # Query orchestration、caching、dedupe 和 rate limits
├── agentRuntime/         # Agent orchestration 和 persistent run stores
├── commands/             # Slash command implementations
├── tools/                # Built-in developer tools
├── services/
│   ├── ai/               # Provider manager、adapters、normalizers 和 providers.json
│   ├── mcp/              # Model Context Protocol clients
│   ├── plugins/          # Plugin lifecycle hooks 和 interceptors
│   ├── tools/            # Tool execution service
│   ├── lsp/              # Language Server Protocol integration
│   ├── Supervisor/       # Background agent supervisor
│   └── SessionMemory/    # Persistent session memory
├── skills/               # Dynamic skill loader
├── cli/                  # Terminal UI contexts
├── components/           # Terminal UI components
├── bridge/               # WebSocket bridge
├── coordinator/          # Multi-agent coordinator
├── keybindings/          # Keyboard shortcut mappings
├── state/                # Reactive stores
└── vim/                  # Vim-like navigation mode
```

## 架构

```text id="r3lj72"
Terminal UI
  -> Command registry 和 keybindings
  -> Provider manager 和 AI adapters
  -> Query engine 和 streaming loops
  -> Tool executor service
  -> Plugins、MCP、LSP、agents、session memory 和 bridge
```

## 文档

* [安装](../docs/installation.html)
* [快速开始](../docs/quick-start.html)
* [配置](../docs/configuration.html)
* [AI Providers](../docs/providers.html)
* [Models](../docs/models.html)
* [Commands](../docs/commands.html)
* [Tools](../docs/tools.html)
* [Plugins](../docs/plugins.html)
* [Skills](../docs/skills.html)
* [Architecture](../docs/architecture.html)
* [Permission Model](../docs/permission-model.html)
* [Bridge Mode](../docs/features/bridge-mode.html)
* [SearXNG Search](../docs/features/searxng-search.html)
* [Troubleshooting](../docs/troubleshooting.html)
* [Evals](../docs/features/evals.html)
* [Taste](../docs/taste.html)

## 调试

```bash id="gonie3"
DEBUG=1 bun run src/main.tsx
DEBUG=provider:anthropic bun run src/main.tsx
```

## 平台说明

### Windows

```powershell id="zjay2e"
Remove-Item -Recurse -Force node_modules
bun install
bun run dev
```

Windows 版 `ripgrep` 可能位于：

```text id="qkyt7k"
src/utils/vendor/ripgrep/x64-win32/rg.exe
```

## 贡献

贡献前请阅读：

* [CONTRIBUTING.md](../CONTRIBUTING.md)
* [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)
* [SECURITY.md](../SECURITY.md)
* [LICENSE.md](../LICENSE.md)

请勿提交 proprietary code、copied source、leaked material、credentials、private keys，或任何你无权许可的内容。

## Security

请勿为安全漏洞创建 public issue。

请按照 [SECURITY.md](../SECURITY.md) 中的 private reporting 流程提交。

## 更新日志

见 [CHANGELOG.md](../CHANGELOG.md)。

## 许可证

见 [LICENSE.md](../LICENSE.md)。

只有 contributor-authored modifications 和 original additions 按 `LICENSE.md` 中说明的方式授权。本仓库不授予 Anthropic proprietary software、services、models、trademarks 或其他 protected materials 的任何权利。