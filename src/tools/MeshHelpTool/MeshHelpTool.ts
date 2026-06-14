import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, MESH_HELP_TOOL_NAME } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    topic: z
      .enum([
        'overview',
        'discovery',
        'messaging',
        'request-response',
        'chunking',
        'waiting',
        'broadcast',
        'roles',
        'mistakes',
      ])
      .optional()
      .default('overview')
      .describe(
        'Topic to show help for. ' +
          '"overview" shows everything. ' +
          'Use a specific topic when you need focused guidance on one area.',
      ),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    content: z.string(),
    topic: z.string(),
  }),
);

const TOPICS: Record<string, string> = {
  overview: `
# ════════════════════════════════════════
# PEER-TO-PEER COMPLETE FLOW GUIDE
# ════════════════════════════════════════

## Quick Start
1. mesh_share start → เปิดให้คนอื่นส่งหา
2. mesh_discover() → หา peers
3. mesh_send_message({ peer, message, waitResponse: true }) → ส่ง+รอตอบ
4. 🆕 Mesh replies arrive as <system-reminder> automatically — NO POLLING!

## Main Flows
- discovery     — ค้นหา peers
- messaging     — ส่ง/รับข้อความ (รับอัตโนมัติ!)
- request-response — ถาม-ตอบ (แนะนำ)
- chunking      — ส่ง content ยาว
- waiting       — รับข้อความอัตโนมัติ (Event-Driven, ไม่ต้อง poll)
- broadcast     — ส่งงานให้ทุกคน
- roles         — จัดการชื่อ/บทบาท
- mistakes      — ข้อผิดพลาดที่พบบ่อย

## Tool Summary
╔══════════════════════╤═══════════════════════════════════════╗
║ Tool                │ ใช้เมื่อ                              ║
╠══════════════════════╪═══════════════════════════════════════╣
║ mesh_share          │ เปิด/ปิด/เช็คสถานะ share             ║
║ mesh_discover       │ ค้นหา peers ใน LAN                   ║
║ mesh_join           │ เชื่อมต่อ peer แบบ persistent        ║
║ mesh_send_message   │ ส่งข้อความ + waitResponse ได้         ║
║ mesh_list_messages  │ อ่านข้อความที่ได้รับ (reassemble แล้ว)║
║ mesh_ping           │ เช็ค peer online                      ║
║ mesh_info           │ ดูรายละเอียด peer                     ║
║ mesh_broadcast      │ ส่งงานให้ทุกคน                        ║
║ mesh_list_roles     │ ดู roles + ชื่อ peers                 ║
║ mesh_set_name       │ ตั้งชื่อ peer                          ║
║ mesh_set_role       │ ตั้ง role peer                         ║
║ mesh_disconnect     │ ตัดการเชื่อมต่อ                       ║
║ mesh_run            │ รัน command บน peer                   ║
║ mesh_spawn          │ สร้าง peer instance ใหม่              ║
║ mesh_help           │ คู่มือนี้                               ║
╚══════════════════════╧═══════════════════════════════════════╝

ดู topic-specific details โดยเรียก mesh_help({ topic: "ชื่อหัวข้อ" })`,

  discovery: `
## Mesh Discovery Flow
mesh_share start → mesh_discover → mesh_info / mesh_ping

1. mesh_share start
   - เปิด share ก่อน ไม่งั้นคนอื่นหาเราไม่เจอ
   - ใช้ mesh_share status เช็คว่า sharing อยู่รึเปล่า
   - จำ port ของตัวเองไว้

2. mesh_discover
   - mesh_discover() — สแกนครั้งเดียว
   - mesh_discover({ wait: true, minMeshs: 1 }) — รอจนเจอ peer
   - mesh_discover({ wait: true, minMeshs: 3, waitTimeout: 60 }) — รอ 3 ตัว

3. mesh_info
   - mesh_info({ worker: "hostname" })
   - mesh_info({ worker: "hostname", wait: true }) — รอ peer

4. mesh_ping
   - mesh_ping({ peer: "hostname" })
   - mesh_ping({ peer: "hostname", wait: true, timeout: 45 })`,

  messaging: `
## Mesh Messaging Flow
mesh_send_message → mesh_list_messages

1. mesh_send_message — ส่งข้อความ
   - ต้องรู้จัก peer ก่อน (ผ่าน mesh_discover หรือ mesh_join)
   - mesh_send_message({ peer: "hostname", message: "hello" })

2. mesh_list_messages — อ่านข้อความ
   - คืนข้อความที่ reassemble แล้ว (chunks ถูกรวมให้)
   - mesh_list_messages({ after: 1717000000000 }) — เฉพาะข้อความใหม่
   - mesh_list_messages({ after, wait: true, timeout: 60 }) — long-poll`,

  'request-response': `
## Request-Response Flow (แนะนำที่สุด)
mesh_send_message({ ..., waitResponse: true })

แบบเดิม (❌ 20+ tool calls):
  mesh_send_message → mesh_list_messages(empty) → mesh_list_messages(empty)
  → mesh_list_messages(got truncated) → mesh_send_message("ส่งอีกที") → ...

แบบใหม่ (✅ 1 tool call):
  mesh_send_message({
    peer: "agent-b",
    message: "research topic X on 4 areas...",
    waitResponse: true,
    responseTimeout: 300   // รอสูงสุด 5 นาที
  })
  → response.text มีคำตอบครบ ไม่ต้องเรียก mesh_list_messages ซ้ำ`,

  chunking: `
## Large Content Flow (Chunking)
mesh_send_message({ ..., chunk: true })

❌ ไม่ควร: ส่ง长篇ตรงๆ → ถูก truncate
✅ ใช้ chunk:
  mesh_send_message({
    peer: "agent-b",
    message: "REPORT_5000_CHARS...",
    chunk: true,
    chunkSize: 1000
  })
  → ✓ sent 5 chunks (5000 chars total)

ฝั่งรับใช้ mesh_list_messages เห็นข้อความที่รวม chunks แล้ว
ไม่ต้องมานั่งรวมเอง

✅ chunk + waitResponse:
  mesh_send_message({
    peer: "agent-b",
    message: "LONG_TEXT...",
    chunk: true,
    waitResponse: true,
    responseTimeout: 300
  })`,

  waiting: `
## Receiving Messages (Event-Driven — No Polling!)

✅ New peer messages arrive as <system-reminder> automatically.
You do NOT need to poll — mesh_list_messages is for history only.

❌ ไม่ควร (busy polling):
  mesh_list_messages → empty → empty → empty... 10+ รอบ

✅ ใช้ wait:
  mesh_list_messages({
    after: TIMESTAMP_ล่าสุด,
    wait: true,
    timeout: 60
  })

หรือดีกว่า: ใช้ mesh_send_message + waitResponse แทน`,

  broadcast: `
## Broadcast Flow
mesh_broadcast({ task })

ส่งงานให้ทุก peers พร้อมกัน:
  mesh_broadcast({ task: "search topic X" })
  → ✓ broadcast 3/3

ข้อควรระวัง:
- broadcast ส่งเป็น todo ไม่ใช่ chat message
- ฝั่งรับต้องรอให้ peer แจ้งผลกลับมาผ่าน mesh_send_message
- mesh_list_messages ไม่เห็น broadcast`,

  roles: `
## Mesh Management Flow
mesh_set_name / mesh_set_role / mesh_list_roles

ตั้งชื่อ + role ให้ตัวเองก่อน (สำคัญ!):
  # หา peer ID ของตัวเอง
  mesh_info({ worker: "ตัวเอง" })
  # ตั้งชื่อและ role
  mesh_set_name({ worker: "MESH_ID", name: "clew-main" })
  mesh_set_role({ worker: "MESH_ID", role: "orchestrator" })

ตั้งชื่อ + role ให้ peers อื่น:
  mesh_set_name({ worker: "hostname", name: "builder-1" })
  mesh_set_role({ worker: "hostname", role: "researcher" })

ดู peers:
  mesh_list_roles()                          # ดูทั้งหมด
  mesh_list_roles({ wait: true, minMeshs: 2 }) # รอจนครบ 2 ตัว

ข้อดี: เวลา mesh_send_message ส่งหา peer อื่น มันจะส่ง role และ port
ไปด้วยในข้อความ (senderRole, senderPort) ทำให้อีกฝั่งรู้ทันทีว่า
ใครส่งมา และส่งกลับไปที่ port ไหน`,

  mistakes: `
## Common Mistakes & How to Avoid

1. ส่ง message โดยยังไม่รู้จัก peer
   → เรียก mesh_discover() ก่อน หรือใช้ mesh_join

2. Polling mesh_list_messages ใน loop
   → ไม่ต้อง poll! ข้อความใหม่เข้า <system-reminder> อัตโนมัติ
   → หรือใช้ mesh_send_message + waitResponse

3. ข้อความยาวถูกตัด
   → ใช้ chunk: true สำหรับ content > 1000 chars

4. ไม่ได้ mesh_share start
   → เช็ค mesh_share status ก่อน

5. ส่ง message แล้วโทร mesh_list_messages ทันที
   → ใช้ waitResponse: true ใน mesh_send_message เดียว

6. ใช้ mesh_send_message ส่งงานแทน broadcast
   → ใช้ mesh_broadcast สำหรับส่งงานให้ทุกคน

7. ไม่รู้ port ของตัวเอง
   → mesh_share status หรือ mesh_share start ดู port

8. สร้าง spawn peer แต่ไม่บอกว่าตัวเองคือใคร
   → ใช้ mesh_set_name + mesh_set_role ตั้งชื่อตัวเองก่อน spawn
   → mesh_send_message จะส่ง role + port ไปให้อัตโนมัติ
   → หรือบอกใน message โดยตรง: "ฉันคือ clew-main (port 59428)"`,
};

export const MeshHelpTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  name: MESH_HELP_TOOL_NAME,
  searchHint: 'agent-to-agent tool usage guide',
  maxResultSizeChars: 20_000,
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    return DESCRIPTION;
  },
  get inputSchema() {
    return inputSchema();
  },
  get outputSchema() {
    return outputSchema();
  },
  getPath() {
    return getCwd();
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: output.content.slice(0, 500) + '\n\n(See full output for complete guide)',
    };
  },
  async call(input: { topic?: string }) {
    const topic = input.topic ?? 'overview';
    const content = TOPICS[topic] ?? TOPICS.overview!;
    return {
      data: { content, topic },
    };
  },
});
