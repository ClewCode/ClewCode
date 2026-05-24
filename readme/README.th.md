<p align="center">
  <img src="../assets/claude-logo-long.png" alt="Claude Code" width="480" />
</p>

<p align="center">
  <strong>ภาษา:</strong>
  <a href="../README.md">English</a> ·
  <a href="README_ZH.md">中文 (简体)</a> ·
  <a href="README_TH.md"><strong>ไทย</strong></a>
</p>

# Claude Code

Claude Code เป็นโปรเจ็กต์ **reverse-engineer / rebuild จากซอร์ส** ของ [Claude Code](https://claude.ai/code) CLI อย่างเป็นทางการของ Anthropic โดยมุ่งให้ได้เวอร์ชันที่ **รัน สร้าง (build) และดีบักได้** จากโค้ดจริง ไม่ใช่แค่ไบนารีปิดกล่อง พร้อมขยายด้วย multi-provider routing, adapters และเครื่องมือสำหรับวิศวกรรมซอฟต์แวร์

> **ข้อจำกัดความรับผิดชอบ:** โปรเจ็กต์นี้ไม่ได้รับการสนับสนุนหรือรับรองจาก Anthropic PBC ผลิตภัณฑ์ Claude Code ต้นฉบับเป็น proprietary — โปรเจ็กต์นี้ reconstruct และขยายพฤติกรรมเพื่อการวิจัยและการใช้งานแบบ self-hosted โปรดอ่าน [LICENSE.md](../LICENSE.md) ก่อนแจกจ่ายหรือนำไปใช้ในองค์กร

## จุดยืนของโปรเจ็กต์

| ด้าน | สิ่งที่ Claude Code มอบให้ |
| --- | --- |
| **ความใกล้เคียงต้นฉบับ** | CLI ที่ reconstruct ให้สอดคล้องกับ UX แบบเทอร์มินัล, tools และจุดขยายของ Claude Code |
| **Build & debug** | โค้ด Bun/TypeScript ที่ `bun run dev`, type-check, test และแก้ไขได้ในเครื่อง |
| **ฟีเจอร์ระดับ enterprise** | Bridge/เซสชันระยะไกล, MCP, plugins, skills, agents/supervisor, voice, session memory, LSP — โดยไม่บังคับให้ทุก workflow ผ่านบริการ hosted-only ของ Anthropic |
| **จุดต่างของเรา** | **Multi-provider** แบบ declarative (`providers.json`, `/model`), adapters และยูทิลิตี dev (`preload`, `codeindex`, `session`) |

> นี่คือการ rebuild โดยชุมชนสำหรับวิศวกรที่ต้องการความโปร่งใสและเลือก provider ได้ — ไม่ใช่การแจกจ่ายอย่างเป็นทางการจาก Anthropic

## ทำอะไรได้บ้าง

Claude Code คือผู้ช่วยเขียนโค้ดด้วย AI ในเทอร์มินัล อ่าน/แก้โค้ดเบสในเครื่อง รัน tools สลับ provider/model และประสานงาน workflow ยาวผ่าน commands, agents, plugins และ skills

จุดเด่น:

- **Multi-provider AI routing** — Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, GitHub Copilot และผู้ให้บริการที่เข้ากันได้กับ OpenAI
- **สลับโมเดลขณะรัน** ด้วย `/model` และการตั้งค่า provider
- **Workflow แบบ tool** — อ่าน/แก้/เขียน/ค้นหา, shell, LSP, เบราว์เซอร์, MCP
- **Plugin hooks** — ดัก prompt, คำสั่ง shell, การใช้ tool และการแก้ไฟล์
- **Skills** จากที่มาในตัวและ `.claude/skills/` ในโปรเจ็กต์
- **Agents และ supervisor** สำหรับงานวิจัย เขียนโค้ด และประสานงาน
- **Durable Agent Runtime & Orchestrator (PLAN I)** — รันไทม์ควบคุมเอเจนต์แบบทนทาน ทำงานออฟไลน์ได้ 100% มีระบบกู้คืน Checkpoint และขออนุมัติคำสั่งอันตรายแบบโต้ตอบ
- **Scheduled Tasks** — ตั้งเตือนแบบครั้งเดียวหรือทำซ้ำผ่านฟอร์ม interactive ของ `/task` พร้อมตัวเลือกเก็บถาวรใน `.claude/scheduled_tasks.json`
- **Session และ bridge** — บันทึก context, กู้คืนงาน และความร่วมมือระยะไกล

## เริ่มต้นอย่างรวดเร็ว

### ติดตั้งแบบ global

```bash
npm install -g claudecode
```

หรือ:

```bash
bun install -g claudecode
```

รันจากไดเรกทอรีโปรเจ็กต์ใดก็ได้:

```bash
claude
```

### รันจากซอร์ส

```bash
git clone https://github.com/JonusNattapong/claudecode.git
cd claudecode
bun install
bun run build
bun run start
```

## ความต้องการของระบบ

- [Bun](https://bun.sh) 1.3 ขึ้นไป สำหรับพัฒนาในเครื่อง
- API key อย่างน้อยหนึ่งตัว เช่น `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY` หรือ provider อื่นที่รองรับ
- Windows, macOS, Linux หรือ WSL2

## ตั้งค่า Provider

ตั้งค่าใน shell หรือไฟล์ `.env`:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
export OPENROUTER_API_KEY=sk-or-...
export OLLAMA_HOST=http://localhost:11434
```

ใน Claude Code สลับโมเดลหรือ provider:

```text
/model
/model list
/model openai/gpt-4o
/model google/gemini-2.5-pro
```

ภาพรวม provider: [docs/providers.html](../docs/providers.html)

## คำสั่งที่ใช้บ่อย

```text
/model      สลับโมเดลหรือ provider
/status     สถานะเซสชัน provider และ context
/doctor     วินิจฉัยระบบ
/context    ดูการใช้ context
/compact    บีบอัดบทสนทนา
/mcp        จัดการ MCP servers
/plugin     จัดการ plugins
/bridge     ตั้งค่า bridge mode
/agent      จัดการเอเจนต์เวิร์กโฟลว์ (run, status, trace, approvals, report)
/daemon     เปิด control panel แบบ interactive สำหรับ autonomous daemon
/task       สร้าง Scheduled Tasks หรือจัดการคิวงาน autonomous
```

พิมพ์ `/` ใน CLI เพื่อดูคำสั่งทั้งหมด

## Scheduled Tasks

ระบบ Scheduled Tasks ใช้ผ่านฟอร์ม interactive ของ `/task` ได้เลย ไม่ต้องจำ cron syntax เอง พิมพ์ `/task` แบบไม่มี argument แล้วกรอก name, schedule, prompt และ storage mode จากนั้นกดยืนยัน

| คุณทำ | Claude Code จะทำ |
| --- | --- |
| `/task` | เปิดฟอร์มสร้าง Scheduled Task |
| เลือก `Daily` เวลา `09:00` | สร้าง recurring task รายวัน |
| เลือก `Weekdays` เวลา `09:00` | สร้าง weekday cron เช่น `0 9 * * 1-5` |
| เลือก `In N minutes` ค่า `10` | สร้าง one-shot reminder สำหรับเวลาถัดไปตาม timezone เครื่อง |
| เลือก `Custom cron` | กรอก standard 5-field cron expression ได้เอง |
| `/task scheduled` | เปิดฟอร์มเดิมแบบระบุชัดเจน |
| `/task list` | แสดงรายการ autonomous queue tasks |

รายละเอียด:

- ใช้ standard 5-field cron ตาม timezone ของเครื่อง: `minute hour day-of-month month day-of-week`
- `Durable` เก็บใน `.claude/scheduled_tasks.json` และอยู่ข้าม session
- `Session-only` เก็บใน memory เฉพาะ session ปัจจุบัน
- recurring tasks auto-expire หลัง 30 วัน ยกเว้น task ถาวรที่ระบบสร้างเอง
- one-shot tasks auto-delete หลังจาก fire
- การตั้งเวลาด้วยภาษาธรรมชาติยังใช้ได้ผ่าน tools ด้านหลังอย่าง `CronCreate`, `CronList` และ `CronDelete` เมื่อโมเดลเลือกใช้

ตัวอย่าง:

```text
/task
Name: ตรวจสอบเซิร์ฟเวอร์
Schedule: Daily
Time: 20:00
Prompt: ตรวจสอบสถานะเซิร์ฟเวอร์
Storage: Durable

/task
Name: เตือน commit
Schedule: In N minutes
Delay: 10
Prompt: อย่าลืม commit โค้ด
Storage: Session-only
```

## การพัฒนา

```bash
bun run dev              # โหมด dev พร้อม watch
bun run start            # รัน CLI จากซอร์ส
bun run build            # build ไปที่ dist/
bun test                 # รันเทสต์
bun x tsc --noEmit       # type-check
bun run lint:check       # ตรวจ lint
bun run format:check     # ตรวจรูปแบบโค้ด
bun run check:ci         # Biome CI
```

ยูทิลิตีในโปรเจ็กต์:

```bash
bun run preload <module>     # โหลด context ก่อนแก้โมดูล
bun run session <command>    # บันทึก/แสดง/กู้คืน session
bun run codeindex <command>  # index และค้นหาโค้ดเบส
bun run codegraph            # กราฟ dependency ของโมดูล
bun run ast-grep -- <args>   # ค้นหา/แก้ไขแบบ AST
```

## โครงสร้างโปรเจ็กต์

```text
src/
├── main.tsx              Bootstrap และ runtime หลัก
├── query.ts              ประมวลผล query หลัก
├── QueryEngine.ts         orchestration ของ query
├── agentRuntime/         การจัดระเบียบเอเจนต์, บันทึกการรัน, และตรวจสอบสิทธิ์เครื่องมือ
├── commands/             slash commands
├── tools/                tools ในตัว
├── services/
│   ├── ai/               Provider manager, adapters, registry
│   ├── mcp/              MCP client
│   ├── plugins/          plugins และ hooks
│   ├── tools/            บริการรัน tool
│   ├── lsp/              LSP
│   ├── Supervisor/       ควบคุม agent
│   └── SessionMemory/    หน่วยความจำเซสชัน
├── skills/               โหลด skills
├── cli/                  UI แบบ Ink/React
├── components/           คอมโพเนนต์เทอร์มินัล
├── bridge/               ความร่วมมือระยะไกล
├── coordinator/          ประสานหลาย agent
├── keybindings/          ปุ่มลัด
├── state/                state แบบ reactive
└── vim/                  โหมด vim
```

## สถาปัตยกรรม

```text
Terminal UI
  -> ชั้นคำสั่งและ keybinding
  -> Provider manager และ adapters
  -> Query engine และ streaming loop
  -> Tool executor
  -> Plugin hooks, MCP, LSP, agents, memory, bridge
```

## เอกสาร

- [การติดตั้ง](../docs/installation.html)
- [เริ่มต้นอย่างรวดเร็ว](../docs/quick-start.html)
- [การตั้งค่า](../docs/configuration.html)
- [AI Providers](../docs/providers.html)
- [โมเดล](../docs/models.html)
- [คำสั่ง](../docs/commands.html)
- [Tools](../docs/tools.html)
- [Plugins](../docs/plugins.html)
- [Skills](../docs/skills.html)
- [สถาปัตยกรรม](../docs/architecture.html)
- [โมเดลสิทธิ์](../docs/permission-model.html)
- [Bridge Mode](../docs/features/bridge-mode.html)
- [SearXNG Search](../docs/features/searxng-search.html)
- [แก้ปัญหา](../docs/troubleshooting.html)
- [Evals](../docs/features/evals.html)

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

มี `ripgrep` สำหรับ Windows ที่ `src/utils/vendor/ripgrep/x64-win32/rg.exe`

## การมีส่วนร่วม

ดู [CONTRIBUTING.md](../CONTRIBUTING.md), [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) และ [SECURITY.md](../SECURITY.md)

## บันทึกการเปลี่ยนแปลง

[CHANGELOG.md](../CHANGELOG.md)

## ใบอนุญาต

[LICENSE.md](../LICENSE.md)
