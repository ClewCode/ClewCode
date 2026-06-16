/** PeerHelpTool — comprehensive guide to agent-to-agent tools and their correct usage */

export const PEER_HELP_TOOL_NAME = 'peer_help';

export const DESCRIPTION =
  'Complete guide to agent-to-agent tools. ' +
  'Shows the correct flow, which tool to use when, common mistakes, and best practices. ' +
  'Use this when unsure how to use peer tools or when a peer node workflow fails.';

const FLOW_DISCOVERY = `## Peer Discovery Flow
\`peer_share start\` → \`peer_discover\` → \`peer_info\` / \`peer_ping\`

1. **\`peer_share start\`** — เปิด share ก่อน ไม่งั้นคนอื่นหาเราไม่เจอ
   - ใช้แค่ตอนเริ่ม หรือตอนที่ต้องรับข้อความจาก peers
   - \`peer_share status\` เช็คว่า sharing อยู่รึเปล่า
   - จำ port ของตัวเองไว้ (เช่น :59428) ถ้าจะให้คนอื่นส่งหา

2. **\`peer_discover\`** — สแกนหา peers ใน LAN
   - \`peer_discover({ wait: true, minMeshs: 1 })\` รอจนเจอ peer แทนการเรียกซ้ำ
   - \`peer_discover({ wait: true, minMeshs: 3, waitTimeout: 60 })\` รอจนครบ 3 ตัว

3. **\`peer_info\`** — ดูรายละเอียด peer
   - \`peer_info({ worker: "hostname" })\`
   - \`peer_info({ worker: "hostname", wait: true })\` รอจนกว่า peer จะปรากฏ

4. **\`peer_ping\`** — เช็คว่า peer online หรือเปล่า
   - \`peer_ping({ peer: "hostname" })\`
   - \`peer_ping({ peer: "hostname", wait: true, timeout: 45 })\` รอจนกว่าจะ online`;

const FLOW_MESSAGING = `## Peer Messaging Flow
\`peer_send_message\` → \`peer_list_messages\`

1. **\`peer_send_message\`** — ส่งข้อความถึง peer
   - ต้องรู้จัก peer ก่อน (ผ่าน peer_discover หรือ peer_join)
   - \`peer_send_message({ peer: "hostname", message: "hello" })\`

2. **\`peer_list_messages\`** — อ่านข้อความที่ได้รับ
   - คืนข้อความที่ reassemble แล้ว (chunks ถูกรวมให้อัตโนมัติ)
   - \`peer_list_messages({ after: 1717000000000 })\` — เฉพาะข้อความใหม่`;

const FLOW_REQUEST_RESPONSE = `## Request-Response Flow (แนะนำ)
\`peer_send_message({ ..., waitResponse: true })\`

Flow ที่ถูกต้องที่สุดสำหรับถาม-ตอบ:

✅ ใช้ waitResponse (1 tool call):
\`\`\`
peer_send_message({
  peer: "agent-b",
  message: "research topic X on these 4 areas...",
  waitResponse: true,         // block รอจนกว่า agent-b ตอบ
  responseTimeout: 300        // รอได้สูงสุด 5 นาที
})
\`\`\`
→ response.text มีคำตอบครบ ไม่ต้องเรียก peer_list_messages ซ้ำ

✅ หรือให้ peer ตอบกลับมาเอง: new peer messages arrive as <system-reminder>
ใน conversation โดยอัตโนมัติ — ไม่ต้อง poll เลย`;

const FLOW_CHUNKING = `## Large Content Flow (Chunking)
\`peer_send_message({ ..., chunk: true })\`

เมื่อต้องส่ง content ยาวๆ (research report, code, docs):

❌ ไม่ควร:
\`\`\`
peer_send_message({ peer: "agent-b", message: "REPORT_LONG_5000_CHARS..." })
→ ถูก truncate เพราะ tool result ขนาดจำกัด
\`\`\`

✅ ใช้ chunk:
\`\`\`
peer_send_message({
  peer: "agent-b",
  message: "REPORT_LONG_5000_CHARS...",
  chunk: true,                // auto-split เป็น chunks
  chunkSize: 1000             // 1000 chars ต่อ chunk (default)
})
→ ✓ sent 5 chunks (5000 chars total)
\`\`\`

ฝั่งรับใช้ \`peer_list_messages\` เห็นข้อความที่รวม chunks แล้วทันที
ไม่ต้องมานั่งรวมเอง

✅ chunk + waitResponse:
\`\`\`
peer_send_message({
  peer: "agent-b",
  message: "REPORT_LONG_5000_CHARS...",
  chunk: true,
  waitResponse: true,
  responseTimeout: 300
})
→ ส่ง chunks ทั้งหมดก่อน แล้วค่อยรอ response
\`\`\``;

const FLOW_WAITING = `## Receiving Messages (Event-Driven — No Polling Needed!)
New messages from peers arrive automatically as <system-reminder> in your conversation.
You DO NOT need to poll or wait — just read incoming messages in the conversation stream.

\`peer_list_messages\` is only for looking up message HISTORY, not for checking new messages.`;

const FLOW_BROADCAST = `## Broadcast Flow
\`peer_broadcast({ task })\`

ส่งงานให้ทุก peers พร้อมกัน:
\`\`\`
peer_broadcast({ task: "ค้นหา WC3 patch notes ล่าสุด" })
→ ✓ broadcast 3/3
\`\`\`

ข้อควรระวัง: broadcast ส่งเป็น todo ไม่ใช่ chat message.
ฝั่งรับต้องใช้ \`peer_list_messages\` ไม่ได้ ต้องรอให้ peer
แจ้งผลกลับมาผ่าน \`peer_send_message\``;

const FLOW_ROLES = `## Peer Management Flow
\`peer_set_name\` / \`peer_set_role\` / \`peer_list_roles\`

\`\`\`
peer_set_name({ worker: "hostname", name: "builder-1" })
peer_set_role({ worker: "hostname", role: "builder" })
peer_list_roles({ wait: true, minMeshs: 2 })
\`\`\`

ใช้ \`peer_list_roles\` แทน \`peer_discover\` เมื่อต้องการดู tags + roles`;

const COMMON_MISTAKES = `## Common Mistakes & How to Avoid

1. **❌ ส่งข้อความโดยยังไม่ discover peer**
   → ✅ เรียก \`peer_discover()\` ก่อน หรือใช้ \`peer_join\`

2. **❌ Polling \`peer_list_messages\` ใน loop**
   → ✅ ไม่ต้อง poll! ข้อความใหม่มาเป็น <system-reminder> อัตโนมัติ
   → ✅ หรือใช้ \`peer_send_message + waitResponse\`

3. **❌ ข้อความยาวๆ ถูกตัด**
   → ✅ ใช้ \`chunk: true\` สำหรับ content > 1000 chars
   → ✅ receiver รวม chunks ให้อัตโนมัติ

4. **❌ ไม่ได้ \`peer_share start\` แล้วงงว่าทำไมไม่มีคนส่งหามา**
   → ✅ เช็ค \`peer_share status\` ก่อน หรือ \`peer_share start\`

5. **❌ ส่ง message แล้วรีบเช็ค peer_list_messages ทันที**
   → ✅ ข้อความใหม่เข้า <system-reminder> อัตโนมัติ
   → ✅ หรือใช้ \`waitResponse: true\` ใน \`peer_send_message\` เดียว`;

const COMMON_MISTAKES_REST = `
6. **❌ ใช้ \`peer_send_message\` ส่งงาน (ควรเป็น broadcast)**
   → ✅ ใช้ \`peer_broadcast\` สำหรับส่งงานให้ทุกคน

7. **❌ ไม่รู้ว่า peer ตัวเองคือ port อะไร**
   → ✅ \`peer_share status\` หรือ \`peer_share start\` ดู port`;

const FLOW_COMPLETE = `# ════════════════════════════════════════
# PEER-TO-PEER COMPLETE FLOW GUIDE
# ════════════════════════════════════════

## 1. ก่อนเริ่ม: เช็คสถานะ
   peer_share status
   ถ้าไม่ share → peer_share start

## 2. ค้นหา peers
   peer_discover()

## 3. เลือกวิธีสื่อสาร

   ┌─ ส่งข้อความสั้นๆ ──────────────────────┐
   │ peer_send_message({                    │
   │   peer: "hostname",                   │
   │   message: "hello"                    │
   │ })                                     │
   └────────────────────────────────────────┘

   ┌─ ถาม-ตอบ (แนะนำ) ─────────────────────┐
   │ peer_send_message({                    │
   │   peer: "hostname",                   │
   │   message: "question?",               │
   │   waitResponse: true,                 │
   │   responseTimeout: 120                │
   │ })                                     │
   └────────────────────────────────────────┘

   ┌─ ส่ง content ยาว ─────────────────────┐
   │ peer_send_message({                    │
   │   peer: "hostname",                   │
   │   message: "LONG_TEXT...",            │
   │   chunk: true,                         │
   │   waitResponse: true                   │
   │ })                                     │
   └────────────────────────────────────────┘

   ┌─ Broadcast ───────────────────────────┐
   │ peer_broadcast({ task: "do X" })      │
   └────────────────────────────────────────┘

## 4. อ่านข้อความ (เมื่อจำเป็น)
   peer_list_messages({
     after: TIMESTAMP_ล่าสุด,
     wait: true,
     timeout: 60
   })

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
╚══════════════════════╧═══════════════════════════════════════╝`;
