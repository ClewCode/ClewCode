<p align="center">
  <img src="../assets/claude-logo-long.png" alt="Clew" width="480" />
</p>

<p align="center">
  <strong>ภาษา:</strong>
  <a href="../README.md">English</a> ·
  <a href="README_ZH.md">中文 (简体)</a> ·
  <a href="README_TH.md"><strong>ไทย</strong></a>
</p>

# Clew

Clew เป็น CLI สำหรับช่วยพัฒนาซอฟต์แวร์ด้วย AI แบบไม่เป็นทางการ

โปรเจกต์นี้เป็นงาน rebuild และ extension จากซอร์ส เพื่อการวิจัย การพัฒนาในเครื่อง การดีบัก การใช้งานแบบ self-hosted และการเลือก provider ได้หลายแบบ

โปรเจกต์นี้ไม่ใช่ผลิตภัณฑ์ทางการของ Anthropic ไม่ใช่ distribution ที่ได้รับอนุญาต และไม่ได้รับการสนับสนุน รับรอง หรืออนุมัติจาก Anthropic PBC

> **ข้อจำกัดความรับผิดชอบ:** Anthropic, Claude และ Claude Code เป็นเครื่องหมายการค้าของเจ้าของที่เกี่ยวข้อง ผลิตภัณฑ์ Claude Code ทางการเป็นซอฟต์แวร์ proprietary โปรดอ่าน [LICENSE.md](../LICENSE.md) ก่อนใช้งาน แก้ไข แจกจ่าย หรือนำโปรเจกต์นี้ไป deploy

## สิ่งที่โปรเจกต์นี้มอบให้

| ด้าน                   | รายละเอียด                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Source-built CLI       | แอปเทอร์มินัล Bun/TypeScript ที่ build, test, inspect และแก้ไขในเครื่องได้                                    |
| Multi-provider routing | รองรับหลาย AI provider ผ่าน adapter และคำสั่งเลือกโมเดล                                                       |
| Developer tooling      | มีคำสั่งสำหรับ context, code review, simplify, research, plugins, MCP, LSP, sessions และ background workflows |
| Local extensibility    | รองรับ plugins, hooks, skills, custom tools, scheduled tasks และ config ระดับโปรเจกต์                         |
| Research use           | ใช้ศึกษา architecture ของ AI coding agent, terminal UX, provider routing และ tool execution                   |

## ทำอะไรได้บ้าง

Clew ทำงานในเทอร์มินัลโดยตรง สามารถอ่านและแก้ codebase ในเครื่อง รัน shell commands ตามสิทธิ์ที่กำหนด สลับ provider/model และจัดการ workflow ยาวผ่าน agents, plugins, skills และ scheduled tasks

จุดเด่น:

* **Multi-provider AI routing** — รองรับ Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot และ endpoint ที่เข้ากันได้กับ OpenAI
* **สลับโมเดลขณะรัน** — ใช้ `/model` เพื่อเลือก provider หรือ model ระหว่าง session
* **Tool-driven workflows** — อ่าน ค้นหา แก้ไข เขียนไฟล์ รัน shell commands ใช้ LSP ใช้ MCP tools และเชื่อม browser automation
* **Plugin hooks** — hook prompt, shell execution, tool calls, message display, session start และ file editing actions
* **Dynamic skills** — โหลด skills จากในตัวโปรเจกต์และ `.claude/skills/`
* **Code review tools** — ใช้ `/code-review --fix` เพื่อตรวจโค้ดที่เปลี่ยนและ apply fix ใช้ `/simplify` เพื่อ cleanup โค้ด
* **Model picker** — เลือก model เป็นค่า global หรือ session-only
* **Plugin marketplace support** — รองรับ `skipLfs` สำหรับ plugin sources
* **Local research workflow** — ใช้ `/research <query>` สำหรับ workflow ค้นคว้าและ scrape เว็บในเครื่อง เมื่อมีการตั้งค่าที่รองรับ
* **Agents และ supervisor** — จัดการ background agents, multi-step workflows, summaries, task status, approvals และ session state
* **Background shell commands** — รันคำสั่งยาวด้วย `!bg <command>`
* **Scheduled tasks** — สร้าง one-shot หรือ recurring tasks ผ่าน `/task`
* **Sessions และ bridge mode** — บันทึก กู้คืน และเชื่อม session สำหรับ workflow ระยะไกล

## เริ่มต้นอย่างรวดเร็ว

### ติดตั้งแบบ global

```bash
npm install -g @jonusnattapong/claudecode
```

หรือ:

```bash
bun install -g @jonusnattapong/claudecode
```

รัน CLI ในไดเรกทอรีโปรเจกต์:

```bash
clew
```

> global launcher ต้องมี Bun ติดตั้งอยู่ในเครื่อง

ถ้าตั้ง alias ไว้ใน `package.json` จะรันได้อีกชื่อด้วย:

```bash
clewcode
```

### รันจากซอร์ส

```bash
git clone https://github.com/JonusNattapong/ClewCode.git
cd claudecode

bun install
bun run build
bun run start
```

สำหรับโหมดพัฒนา:

```bash
bun run dev
```

## ความต้องการของระบบ

* Bun 1.3 ขึ้นไป
* Node.js 18 ขึ้นไป
* Git
* Windows, macOS, Linux หรือ WSL2
* API key จาก provider ที่รองรับอย่างน้อยหนึ่งตัว เว้นแต่ใช้ local provider เช่น Ollama

## ตั้งค่า Provider

ตั้งค่า provider keys ใน shell หรือไฟล์ `.env`

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
export OPENROUTER_API_KEY=sk-or-...
export OLLAMA_HOST=http://localhost:11434
```

สลับ model หรือ provider ระหว่าง session:

```text
/model
/model list
/model openai/gpt-4o
/model google/gemini-2.5-pro
```

เอกสาร provider:

```text
../docs/providers.html
```

## คำสั่งที่ใช้บ่อย

```text
/model        สลับ model หรือ provider
/status       ดูสถานะ provider, session และ context
/doctor       รัน diagnostics
/context      ตรวจการใช้ context
/compact      บีบอัด conversation history
/mcp          จัดการ MCP servers
/code-review  ตรวจโค้ดที่เปลี่ยน
/simplify     cleanup-focused review
/plugin       จัดการ plugins และ hooks
/bridge       ตั้งค่า bridge mode
/agent        จัดการ background agent workflows
/daemon       เปิด autonomous daemon dashboard
/task         สร้างหรือจัดการ scheduled tasks
```

พิมพ์ `/` ใน CLI เพื่อดูรายการคำสั่งทั้งหมด

## Scheduled Tasks

ระบบ scheduled task ใช้ผ่าน `/task`

```text
/task
```

ตัวอย่าง:

```text
/task
Name: ตรวจสอบเซิร์ฟเวอร์
Schedule: Daily
Time: 20:00
Prompt: ตรวจสอบสถานะเซิร์ฟเวอร์
Storage: Durable
```

```text
/task
Name: เตือน commit
Schedule: In N minutes
Delay: 10
Prompt: เตือนให้ commit โค้ด
Storage: Session-only
```

พฤติกรรมของ task:

* Durable tasks ถูกบันทึกที่ `.claude/scheduled_tasks.json`
* Session-only tasks ทำงานเฉพาะ session ปัจจุบัน
* Recurring tasks ใช้ cron syntax แบบ 5 fields
* One-shot tasks ถูกลบหลังจากรันเสร็จ
* ใช้ timezone ของเครื่องสำหรับการรันตามเวลา

## การพัฒนา

```bash
bun run dev              # โหมด dev พร้อม watch
bun run start            # รัน CLI จากซอร์ส
bun run build            # build ไปที่ dist/
bun test                 # รัน tests
bun x tsc --noEmit       # type check
bun run lint:check       # ตรวจ Biome lint
bun run format:check     # ตรวจ Biome formatting
bun run check:ci         # รัน Biome CI validation
```

Developer utilities:

```bash
bun run preload <module>     # preload module context
bun run session <command>    # save, list หรือ restore session context
bun run codeindex <command>  # index และค้นหา codebase
bun run codegraph            # สร้าง module dependency graph
bun run ast-grep -- <args>   # ค้นหาหรือ rewrite ด้วย AST
```

## โครงสร้างโปรเจกต์

```text
src/
├── main.tsx              # Terminal UI bootstrap และ main loop
├── query.ts              # Query processing และ system prompt logic
├── QueryEngine.ts        # Query orchestration, caching, dedupe และ rate limits
├── agentRuntime/         # Agent orchestration และ persistent run stores
├── commands/             # Slash command implementations
├── tools/                # Built-in developer tools
├── services/
│   ├── ai/               # Provider manager, adapters, normalizers และ providers.json
│   ├── mcp/              # Model Context Protocol clients
│   ├── plugins/          # Plugin lifecycle hooks และ interceptors
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

## สถาปัตยกรรม

```text
Terminal UI
  -> Command registry และ keybindings
  -> Provider manager และ AI adapters
  -> Query engine และ streaming loops
  -> Tool executor service
  -> Plugins, MCP, LSP, agents, session memory และ bridge
```

## เอกสาร

* [การติดตั้ง](../docs/installation.html)
* [เริ่มต้นอย่างรวดเร็ว](../docs/quick-start.html)
* [การตั้งค่า](../docs/configuration.html)
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

## การดีบัก

```bash
DEBUG=1 bun run src/main.tsx
DEBUG=provider:anthropic bun run src/main.tsx
```

## หมายเหตุแพลตฟอร์ม

### Windows

```powershell
Remove-Item -Recurse -Force node_modules
bun install
bun run dev
```

อาจมี `ripgrep` สำหรับ Windows อยู่ที่:

```text
src/utils/vendor/ripgrep/x64-win32/rg.exe
```

## การมีส่วนร่วม

อ่านไฟล์เหล่านี้ก่อน contribute:

* [CONTRIBUTING.md](../CONTRIBUTING.md)
* [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)
* [SECURITY.md](../SECURITY.md)
* [LICENSE.md](../LICENSE.md)

ห้ามส่ง proprietary code, copied source, leaked material, credentials, private keys หรือเนื้อหาที่คุณไม่มีสิทธิ์ license

## Security

ห้ามเปิด public issue สำหรับช่องโหว่ความปลอดภัย

ให้ใช้ขั้นตอน private reporting ตาม [SECURITY.md](../SECURITY.md)

## บันทึกการเปลี่ยนแปลง

ดู [CHANGELOG.md](../CHANGELOG.md)

## ใบอนุญาต

ดู [LICENSE.md](../LICENSE.md)

เฉพาะ modifications และ original additions ที่ contributor เขียนเองเท่านั้นที่อยู่ภายใต้ license ตามที่ระบุใน `LICENSE.md` repository นี้ไม่ได้ให้สิทธิ์ใน proprietary software, services, models, trademarks หรือ protected materials ของ Anthropic