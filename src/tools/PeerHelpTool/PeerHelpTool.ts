import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, PEER_HELP_TOOL_NAME } from './prompt.js';

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
1. peer_share start → เปิดให้คนอื่นส่งหา
2. peer_discover() → หา peers
3. peer_send_message({ peer, message, waitResponse: true }) → ส่ง+รอตอบ
4. 🆕 Peer replies arrive as <system-reminder> automatically — NO POLLING!

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
║ peer_share          │ เปิด/ปิด/เช็คสถานะ share             ║
║ peer_discover       │ ค้นหา peers ใน LAN                   ║
║ peer_join           │ เชื่อมต่อ peer แบบ persistent        ║
║ peer_send_message   │ ส่งข้อความ + waitResponse ได้         ║
║ peer_list_messages  │ อ่านข้อความที่ได้รับ (reassemble แล้ว)║
║ peer_ping           │ เช็ค peer online                      ║
║ peer_info           │ ดูรายละเอียด peer                     ║
║ peer_broadcast      │ ส่งงานให้ทุกคน                        ║
║ peer_list_roles     │ ดู roles + ชื่อ peers                 ║
║ peer_set_name       │ ตั้งชื่อ peer                          ║
║ peer_set_role       │ ตั้ง role peer                         ║
║ peer_disconnect     │ ตัดการเชื่อมต่อ                       ║
║ peer_run            │ รัน command บน peer                   ║
║ peer_spawn          │ สร้าง peer instance ใหม่              ║
║ peer_help           │ คู่มือนี้                               ║
╚══════════════════════╧═══════════════════════════════════════╝

ดู topic-specific details โดยเรียก peer_help({ topic: "ชื่อหัวข้อ" })`,

  discovery: `
## Peer Discovery Flow
peer_share start → peer_discover → peer_info / peer_ping

1. peer_share start
   - เปิด share ก่อน ไม่งั้นคนอื่นหาเราไม่เจอ
   - ใช้ peer_share status เช็คว่า sharing อยู่รึเปล่า
   - จำ port ของตัวเองไว้

2. peer_discover
   - peer_discover() — สแกนครั้งเดียว
   - peer_discover({ wait: true, minPeers: 1 }) — รอจนเจอ peer
   - peer_discover({ wait: true, minPeers: 3, waitTimeout: 60 }) — รอ 3 ตัว

3. peer_info
   - peer_info({ worker: "hostname" })
   - peer_info({ worker: "hostname", wait: true }) — รอ peer

4. peer_ping
   - peer_ping({ peer: "hostname" })
   - peer_ping({ peer: "hostname", wait: true, timeout: 45 })`,

  messaging: `
## Peer Messaging Flow
peer_send_message → peer_list_messages

1. peer_send_message — ส่งข้อความ
   - ต้องรู้จัก peer ก่อน (ผ่าน peer_discover หรือ peer_join)
   - peer_send_message({ peer: "hostname", message: "hello" })

2. peer_list_messages — อ่านข้อความ
   - คืนข้อความที่ reassemble แล้ว (chunks ถูกรวมให้)
   - peer_list_messages({ after: 1717000000000 }) — เฉพาะข้อความใหม่
   - peer_list_messages({ after, wait: true, timeout: 60 }) — long-poll`,

  'request-response': `
## Request-Response Flow (แนะนำที่สุด)
peer_send_message({ ..., waitResponse: true })

แบบเดิม (❌ 20+ tool calls):
  peer_send_message → peer_list_messages(empty) → peer_list_messages(empty)
  → peer_list_messages(got truncated) → peer_send_message("ส่งอีกที") → ...

แบบใหม่ (✅ 1 tool call):
  peer_send_message({
    peer: "agent-b",
    message: "research topic X on 4 areas...",
    waitResponse: true,
    responseTimeout: 300   // รอสูงสุด 5 นาที
  })
  → response.text มีคำตอบครบ ไม่ต้องเรียก peer_list_messages ซ้ำ`,

  chunking: `
## Large Content Flow (Chunking)
peer_send_message({ ..., chunk: true })

❌ ไม่ควร: ส่ง长篇ตรงๆ → ถูก truncate
✅ ใช้ chunk:
  peer_send_message({
    peer: "agent-b",
    message: "REPORT_5000_CHARS...",
    chunk: true,
    chunkSize: 1000
  })
  → ✓ sent 5 chunks (5000 chars total)

ฝั่งรับใช้ peer_list_messages เห็นข้อความที่รวม chunks แล้ว
ไม่ต้องมานั่งรวมเอง

✅ chunk + waitResponse:
  peer_send_message({
    peer: "agent-b",
    message: "LONG_TEXT...",
    chunk: true,
    waitResponse: true,
    responseTimeout: 300
  })`,

  waiting: `
## Receiving Messages (Event-Driven — No Polling!)

✅ New peer messages arrive as <system-reminder> automatically.
You do NOT need to poll — peer_list_messages is for history only.

❌ ไม่ควร (busy polling):
  peer_list_messages → empty → empty → empty... 10+ รอบ

✅ ใช้ wait:
  peer_list_messages({
    after: TIMESTAMP_ล่าสุด,
    wait: true,
    timeout: 60
  })

หรือดีกว่า: ใช้ peer_send_message + waitResponse แทน`,

  broadcast: `
## Broadcast Flow
peer_broadcast({ task })

ส่งงานให้ทุก peers พร้อมกัน:
  peer_broadcast({ task: "search topic X" })
  → ✓ broadcast 3/3

ข้อควรระวัง:
- broadcast ส่งเป็น todo ไม่ใช่ chat message
- ฝั่งรับต้องรอให้ peer แจ้งผลกลับมาผ่าน peer_send_message
- peer_list_messages ไม่เห็น broadcast`,

  roles: `
## Peer Management Flow
peer_set_name / peer_set_role / peer_list_roles

ตั้งชื่อ + role ให้ตัวเองก่อน (สำคัญ!):
  # หา peer ID ของตัวเอง
  peer_info({ worker: "ตัวเอง" })
  # ตั้งชื่อและ role
  peer_set_name({ worker: "PEER_ID", name: "clew-main" })
  peer_set_role({ worker: "PEER_ID", role: "orchestrator" })

ตั้งชื่อ + role ให้ peers อื่น:
  peer_set_name({ worker: "hostname", name: "builder-1" })
  peer_set_role({ worker: "hostname", role: "researcher" })

ดู peers:
  peer_list_roles()                          # ดูทั้งหมด
  peer_list_roles({ wait: true, minPeers: 2 }) # รอจนครบ 2 ตัว

ข้อดี: เวลา peer_send_message ส่งหา peer อื่น มันจะส่ง role และ port
ไปด้วยในข้อความ (senderRole, senderPort) ทำให้อีกฝั่งรู้ทันทีว่า
ใครส่งมา และส่งกลับไปที่ port ไหน`,

  mistakes: `
## Common Mistakes & How to Avoid

1. ส่ง message โดยยังไม่รู้จัก peer
   → เรียก peer_discover() ก่อน หรือใช้ peer_join

2. Polling peer_list_messages ใน loop
   → ไม่ต้อง poll! ข้อความใหม่เข้า <system-reminder> อัตโนมัติ
   → หรือใช้ peer_send_message + waitResponse

3. ข้อความยาวถูกตัด
   → ใช้ chunk: true สำหรับ content > 1000 chars

4. ไม่ได้ peer_share start
   → เช็ค peer_share status ก่อน

5. ส่ง message แล้วโทร peer_list_messages ทันที
   → ใช้ waitResponse: true ใน peer_send_message เดียว

6. ใช้ peer_send_message ส่งงานแทน broadcast
   → ใช้ peer_broadcast สำหรับส่งงานให้ทุกคน

7. ไม่รู้ port ของตัวเอง
   → peer_share status หรือ peer_share start ดู port

8. สร้าง spawn peer แต่ไม่บอกว่าตัวเองคือใคร
   → ใช้ peer_set_name + peer_set_role ตั้งชื่อตัวเองก่อน spawn
   → peer_send_message จะส่ง role + port ไปให้อัตโนมัติ
   → หรือบอกใน message โดยตรง: "ฉันคือ clew-main (port 59428)"`,
};

export const PeerHelpTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  name: PEER_HELP_TOOL_NAME,
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

