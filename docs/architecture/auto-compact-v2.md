# Auto-Compact v2 — ออกแบบใหม่ทั้งระบบ

สถานะ: **implement ครบทุกเฟส (0–5) แล้ว** — v2 เป็น default, เส้นทางเดิมถูกลบทิ้ง
โค้ด: `src/services/compact/v2/` + `src/tools/ContextRestoreTool/`
ขอบเขต: แทนที่ทุกกลไกที่ลดขนาด context ใน `src/services/compact/*` + จุดเรียกใน `src/query.ts`

---

## 1. ระบบปัจจุบันทำงานยังไง

ใน `query.ts` หนึ่งรอบ turn จะมี **6 กลไกอิสระ** ที่ลด context เรียงต่อกัน:

| # | กลไก | ไฟล์ | ทริกเกอร์ | สภาพ |
|---|------|------|-----------|------|
| 1 | tool-result budget | `utils/attachments` + `applyToolResultBudget` | per-message char cap | ตัดตอน write |
| 2 | snip | `snipCompact.ts` | feature `HISTORY_SNIP` | ลบ message จริง |
| 3 | time-based microcompact | `microCompact.ts` | gap > N นาที | เคลียร์ content ของ tool_result เก่า |
| 4 | duplicate microcompact | `microCompact.ts` | signature ซ้ำ | เคลียร์ตัวเก่า |
| 5 | session-memory compact | `sessionMemoryCompact.ts` | ถึง threshold + flag | สรุปแล้วเก็บหาง |
| 6 | full compact (+background) | `compact.ts` / `autoCompact.ts` | ถึง threshold | LLM สรุปทั้งหมด |

### ปัญหาที่เจอจริงจากโค้ด

1. **ไม่มีเจ้าของเดียว** — `orchestrator.ts:44` `runCompactionPipeline()` ถูกเขียนไว้เพื่อรวมทุกอย่าง แต่ `query.ts:359,383` เรียก `deps.microcompact` กับ `deps.autocompact` แยกกันเอง orchestrator จึงเป็นเส้นทางที่ divergent อยู่ข้าง ๆ ระบบจริง

2. **บัญชี token ต้องเดินสายด้วยมือ** — `snipTokensFreed` ถูกส่งผ่าน 5 ชั้นฟังก์ชัน (`query.ts:395` → `autoCompactIfNeeded` → `shouldAutoCompact` → `getCompactionStrategy`) เพราะ `tokenCountWithEstimation()` อ่าน usage จาก assistant message ท้ายสุดซึ่งยังสะท้อนค่าก่อน snip ทุกกลไกใหม่ที่ลด token จะต้องเพิ่ม parameter แบบนี้อีกตัว

3. **threshold แตกเป็น 6 ตัวเลขที่พึ่งพากันเอง** — `getAutoCompactThreshold`, `getAutoCompactHardThreshold`, `getBackgroundAutoCompactThreshold`, warning, error, blocking limit บวก env override 3 ที่ (`CLEW_CODE_AUTO_COMPACT_WINDOW`, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`, `CLEW_CODE_BLOCKING_LIMIT_OVERRIDE`) และคอมเมนต์ที่ `autoCompact.ts:73-77` ก็เตือนไว้เองว่าค่าคงที่พวกนี้พังกันได้ถ้าปรับผิดลำดับ

4. **state เป็น module global** — `regretState` (`autoCompact.ts:191`) และ `backgroundAutoCompactJob` (`autoCompact.ts:350`) เป็น singleton ทั้งที่ระบบรัน multi-agent (`toolUseContext.agentId` ถูกใช้เป็น scope key แบบ manual แล้ว) → agent สองตัวใช้ regret counter ร่วมกัน และ test ก็เปื้อนข้ามไฟล์

5. **compaction เป็น all-or-nothing และกู้คืนไม่ได้** — พอถึง threshold ทุกอย่างถูกแทนด้วยสรุปก้อนเดียว ระบบ *วัด* ความเสียหายได้ (`checkCompactRegret`) แต่แก้ได้แค่ขยับ buffer ทีละ 5k token ข้อมูลที่ถูกทิ้งไม่มีทางกลับมา โมเดลต้องไปอ่านไฟล์ใหม่

6. **cooldown / circuit breaker คือพลาสเตอร์ปิดแผลเดิม** — `MIN_TURNS_BETWEEN_COMPACTS = 3` และ `MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3` มีอยู่เพราะหลัง compact แล้ว context ยังใกล้ threshold เดิม กล่าวคือ compaction ไม่รับประกันว่าจะปลดปล่อยพื้นที่ได้เท่าไหร่

---

## 2. หลักการของ v2

1. **บัญชีเดียว** — มี `ContextLedger` ตัวเดียวเป็นแหล่งความจริงของ "ตอนนี้ใช้ไปกี่ token" ไม่มีการลบด้วยมือระหว่างทาง
2. **หนึ่ง interface สำหรับทุกวิธีลด** — ทุกกลไกกลายเป็น `Reducer` ที่รูปร่างเหมือนกัน planner ตัวเดียวเลือกใช้
3. **สั่งงานด้วยเป้าหมาย ไม่ใช่ด้วย threshold** — planner รับ "ต้องปล่อยพื้นที่ X token" แล้วเลือก reducer จนพอ ไม่ใช่ "ถึงเส้นแล้วยิงกลไกที่ผูกไว้"
4. **เสียหายแล้วกู้คืนได้** — ทุกอย่างที่ถูกถอดออกไปเก็บใน store พร้อม handle โมเดลดึงกลับได้ผ่าน tool → การถอดของออกกลายเป็นการตัดสินใจที่ราคาถูก
5. **state ผูกกับ session/agent** — ไม่มี module-level mutable state

---

## 3. สถาปัตยกรรม

```
                     ┌──────────────────┐
   messages ───────► │  ContextLedger   │  ← usage จาก API + delta estimation
                     └────────┬─────────┘
                              │ pressure: { used, limit, deficit }
                              ▼
                     ┌──────────────────┐
                     │  CompactPlanner  │ ── เลือกแผนจากตาราง reducer
                     └────────┬─────────┘
                              │ CompactPlan (ordered steps + expected yield)
                              ▼
        ┌───────────┬─────────┴─────────┬──────────────┐
        ▼           ▼                   ▼              ▼
   DedupeReducer  StaleToolReducer  SummarizeReducer  DropReducer
        └───────────┴─────────┬─────────┴──────────────┘
                              │ evicted blocks
                              ▼
                     ┌──────────────────┐
                     │   EvictionStore  │ ← content-addressed, กู้คืนได้
                     └──────────────────┘
                              ▲
                              │ context_restore(handle)
                         (โมเดลเรียกเอง)
```

### 3.1 ContextLedger

```ts
// src/services/compact/v2/ledger.ts
export interface ContextPressure {
  /** token ที่ prompt ถัดไปจะใช้จริง (รวม system + tools + messages) */
  used: number;
  /** เพดานที่ใช้ได้ = context window − reserved output − safety */
  limit: number;
  /** used − softTarget; > 0 แปลว่าต้องปล่อยพื้นที่ */
  deficit: number;
  /** used / limit */
  ratio: number;
  /** ที่มาของตัวเลข — สำหรับ debug/analytics */
  basis: 'api_usage' | 'estimated' | 'mixed';
}

export interface ContextLedger {
  measure(messages: Message[], model: string): ContextPressure;
  /** reducer แจ้งกลับว่าปล่อยไปเท่าไหร่ — แทนการเดินสาย snipTokensFreed */
  applyDelta(tokens: number): void;
}
```

จุดสำคัญ: `measure()` คำนวณจาก **usage จริงของ assistant ล่าสุด + estimation ของทุกอย่างที่ต่อท้ายมาหลังจากนั้น + delta ที่ reducer แจ้งเข้ามา** ทำให้ `snipTokensFreed` และพี่น้องมันหายไปจาก signature ทุกตัว (แก้ปัญหา #2)

เพดานคำนวณครั้งเดียวใน `computeLimits(model)` คืน struct เดียว แทนฟังก์ชัน threshold 6 ตัว (แก้ปัญหา #3):

```ts
export interface ContextLimits {
  window: number;        // context window ของโมเดล
  reserved: number;      // output tokens สำรอง
  limit: number;         // window − reserved
  softTarget: number;    // เป้าหลัง compact — ไม่ใช่ "เส้นที่ยิง"
  actNow: number;        // ต้องลงมือ ณ boundary
  actForce: number;      // ต้องลงมือแม้กลาง tool chain
  warn: number;          // UI เหลือง
  critical: number;      // UI แดง
}
```
ทุกค่า derive จาก `window` + สัดส่วนเดียว ไม่ให้แก้ทีละตัวแล้วชนกัน — และ **softTarget เป็นเป้าหมาย ไม่ใช่ทริกเกอร์** นี่คือสิ่งที่ทำให้ cooldown ไม่จำเป็นอีกต่อไป (แก้ปัญหา #6): planner ต้องปล่อยพื้นที่ให้ถึง `softTarget` เท่านั้น ถ้าปล่อยไม่ถึงคือแผนล้มเหลว ต้อง escalate ทันที ไม่ใช่รอ 3 turn

### 3.2 Reducer — interface เดียวสำหรับทุกวิธี

```ts
export interface Reducer {
  name: 'dedupe' | 'stale-tool' | 'snip' | 'summarize' | 'drop';
  /** ระดับความเสียหายต่อ context 0..1 — ใช้จัดลำดับ */
  readonly loss: number;
  /** ต้องเรียก LLM ไหม (มีต้นทุน latency/เงิน) */
  readonly costly: boolean;
  /** ประเมินว่าจะปล่อยได้กี่ token โดยไม่ลงมือจริง — ต้องเร็ว, pure */
  estimate(ctx: ReduceContext): number;
  /** ลงมือจริง */
  apply(ctx: ReduceContext): Promise<ReduceOutcome>;
}

export interface ReduceOutcome {
  messages: Message[];
  tokensFreed: number;
  /** ทุกอย่างที่ถอดออก พร้อม handle สำหรับกู้คืน */
  evicted: EvictionRecord[];
  /** marker ที่ต้อง yield เข้า transcript (เช่น compact boundary) */
  boundary?: Message;
}
```

reducer ที่มีในระบบใหม่ เรียงตาม `loss` จากน้อยไปมาก:

| reducer | loss | costly | มาจากของเดิม |
|---------|------|--------|--------------|
| `dedupe` | 0.05 | ไม่ | duplicate microcompact (#4) |
| `stale-tool` | 0.20 | ไม่ | time-based microcompact (#3) + tool-result budget (#1) |
| `snip` | 0.35 | ไม่ | snip (#2) |
| `summarize` | 0.60 | **ใช่** | session-memory + full compact (#5,#6) |
| `drop` | 0.95 | ไม่ | ทางออกสุดท้าย เมื่อ summarize ล้มเหลว |

`drop` คือสิ่งที่ระบบเดิมไม่มี — ตอนนี้เมื่อ compact ล้มเหลวติดกัน 3 ครั้ง circuit breaker จะยอมแพ้แล้วปล่อยให้ API ตอบ `prompt_too_long` v2 จะตัดหัวประวัติทิ้งแบบกำหนดเองพร้อมทิ้ง handle ไว้ให้กู้ — เซสชันไม่ตาย

### 3.3 CompactPlanner

```ts
export interface CompactPlan {
  steps: Reducer[];
  expectedYield: number;
  /** ทำไมถึงเลือกแผนนี้ — เข้า analytics + /context ตรง ๆ */
  rationale: string;
}

export function planCompaction(
  pressure: ContextPressure,
  messages: Message[],
  opts: { atBoundary: boolean; allowCostly: boolean },
): CompactPlan;
```

อัลกอริทึม (deterministic, ทดสอบได้โดยไม่ต้องแตะ LLM):

1. ถ้า `pressure.deficit <= 0` → แผนว่าง
2. เรียก `estimate()` ของทุก reducer (เร็ว, pure)
3. เรียงตาม `loss` แล้วสะสมไปเรื่อย ๆ จนกว่า `Σ estimate ≥ deficit`
4. `summarize` ถูกหยิบก็ต่อเมื่อของถูกกว่ารวมกันแล้วยังไม่พอ — ผลคือ **session ที่ tool-heavy จะไม่โดน LLM summarize เลย** เพราะ dedupe + stale-tool ก็เอาอยู่ ซึ่งเป็นเคสที่ระบบเดิมยิง full compact ทิ้งทุกอย่างทั้งที่ไม่จำเป็น
5. ถ้ารวมทุก reducer แล้วยัง `< deficit` → เติม `drop` เข้าไป

`allowCostly=false` ตอนอยู่กลาง tool chain → planner เลือกเฉพาะ reducer ที่ไม่ต้องเรียก LLM ได้ทันที ไม่ต้องรอ boundary ไม่ต้องมี background job แข่งกัน (แทนที่ `isAtNaturalBoundary` + `startBackgroundAutoCompact` + `mergeBackgroundAutoCompactDelta` ทั้งชุด)

### 3.4 EvictionStore — จุดที่เปลี่ยนเกมจริง

```ts
export interface EvictionRecord {
  handle: string;          // 'ev_<hash8>' — สั้นพอที่โมเดลพิมพ์ได้
  kind: 'tool_result' | 'message_range' | 'summary_source';
  label: string;           // 'Read src/query.ts', 'Bash: bun test'
  tokens: number;
  reducer: Reducer['name'];
  turn: number;
}
```

- ของที่ถูกถอดไปเขียนลงไฟล์ในโฟลเดอร์ session (ไม่กินพื้นที่ context)
- ตรงที่ถอดออก จะเหลือ **stub บรรทัดเดียว**: `[evicted: Read src/query.ts — 4.2k tokens — restore with ev_a91f]`
- เพิ่ม tool `ContextRestore(handle)` ให้โมเดลดึงกลับเองเมื่อยังต้องใช้

ผลกระทบต่อดีไซน์ทั้งระบบ: การถอดของออกไม่ใช่การตัดสินใจแบบ irreversible อีกต่อไป → planner กล้าถอดเร็วและถอดเยอะ → ไม่ต้องรอจนใกล้เต็มแล้วค่อย summarize ทีเดียวยกเข่ง และ `regretState` ทั้งชุด (150 บรรทัด + global mutable) ถูกลบทิ้งได้ เพราะ "regret" กลายเป็นสิ่งที่ระบบ *แก้ได้* ไม่ใช่แค่ *นับ* — ตัวชี้วัดใหม่คือ restore rate ซึ่งมีความหมายตรงกว่ามาก

### 3.5 State ต่อ session

```ts
export interface CompactSessionState {
  agentId?: string;
  turn: number;
  lastPlan?: CompactPlan;
  evictions: EvictionStore;
  failures: number;
}
```
เก็บใน `toolUseContext` ไม่ใช่ module scope (แก้ปัญหา #4) — multi-agent ถูกต้อง และ test ไม่เปื้อนข้ามไฟล์

### 3.6 จุดเรียกใน query.ts — เหลือจุดเดียว

```ts
// แทนที่ query.ts:332-397 ทั้งบล็อก (~65 บรรทัด → ~10)
queryCheckpoint('query_compact_start');
const compaction = await runCompaction(messagesForQuery, toolUseContext, cacheSafeParams, {
  querySource,
  atBoundary: isAtNaturalBoundary(messagesForQuery),
});
messagesForQuery = compaction.messages;
if (compaction.boundary) yield compaction.boundary;
queryCheckpoint('query_compact_end');
```

---

## 4. เทียบของเก่า → ของใหม่

| ของเดิม | ชะตากรรม |
|---------|----------|
| `applyToolResultBudget` | → `stale-tool` reducer |
| `snipCompactIfNeeded` | → `snip` reducer (คงตรรกะ ย้าย interface) |
| `maybeTimeBasedMicrocompact` | → `stale-tool` reducer (gap เป็น input ของ `estimate()`) |
| `maybeDuplicateToolResultMicrocompact` | → `dedupe` reducer |
| `trySessionMemoryCompaction` | → `summarize` reducer โหมด keep-tail |
| `compactConversation` | → `summarize` reducer โหมดเต็ม (เก็บ prompt engineering เดิมไว้ทั้งหมด) |
| `getAutoCompactThreshold` × 3 ตัว | → `computeLimits()` |
| `snipTokensFreed` plumbing | → `ledger.applyDelta()` |
| `regretState` + 8 ฟังก์ชัน | **ลบ** → restore rate |
| background compact + merge delta | **ลบ** → planner ทำ non-costly reducer ได้ทันทีกลาง chain |
| cooldown + circuit breaker | **ลบ** → เป้าหมาย `softTarget` + `drop` reducer รับประกันว่าปล่อยพื้นที่ได้เสมอ |
| `orchestrator.ts` | **ลบ** → `planner.ts` |

ประเมินคร่าว ๆ: ~6,300 บรรทัดใน `services/compact/` → ~2,000 โดยที่ prompt/summarize logic (ส่วนที่มีค่าที่สุด) ย้ายมาเกือบทั้งดุ้น

---

## 5. แผน migration (ไม่ big-bang)

| เฟส | ทำอะไร | สถานะ |
|-----|--------|-------|
| 0 | `v2/limits.ts` + `v2/ledger.ts` แล้วให้โค้ดเดิม delegate มา | ✅ threshold ทุกตัวเรียก `computeLimits()` — test เดิม 41 ตัวเขียวโดยไม่แก้ |
| 1 | ห่อทุกกลไกเป็น `Reducer` | ✅ `v2/reducers/*.ts` |
| 2 | `EvictionStore` + stub + `ContextRestore` tool | ✅ ไฟล์ต่อ handle ใต้ session dir, จำกัดการดึงกลับ 25k token/turn |
| 3 | `planner` + จุดเรียกเดียวใน `query.ts` | ✅ `v2/planner.ts` |
| 4 | สลับ default เป็น v2, ลบ orchestrator/regret/background | ✅ ดูรายการที่ลบด้านล่าง |
| 5 | ลบเส้นทางเดิมออกจาก `query.ts` และ `autoCompact.ts` | ✅ `autoCompact.ts` เหลือแต่คณิตศาสตร์ของ threshold |

### สิ่งที่ถูกลบจริงในเฟส 4–5

| ของเดิม | เหตุผลที่ลบได้ |
|---------|----------------|
| `autoCompactIfNeeded` / `shouldAutoCompact` / `shouldStartBackgroundAutoCompact` | `runCompaction` แทนทั้งหมด — วางแผนจาก deficit ไม่ใช่ยิงตาม threshold |
| background compact + `mergeBackgroundAutoCompactDelta` | ไม่ต้องมีแล้ว เพราะ reducer ที่ไม่เรียก LLM รันกลาง tool chain ได้ทันที ซึ่งเป็นปัญหาที่ background job ถูกสร้างมาแก้ |
| regret loop ทั้งชุด (~150 บรรทัด + global mutable) | มันได้แค่ *วัด* ความเสียหาย เพราะของหายไปแล้ว v2 ถอดของไปที่ store ที่กู้คืนได้ สัญญาณใหม่คือ restore rate ซึ่งโมเดลแก้เองได้ |
| cooldown 3 turn + circuit breaker 3 ครั้ง | ทั้งคู่มีอยู่เพราะ compaction ไม่รับประกันว่าจะปล่อยพื้นที่เท่าไหร่ v2 ระบุเป้าเป็น token (`softTarget`) และมี `drop` ที่ไปถึงได้เสมอ |
| `orchestrator.ts` | dead code — ไม่มีใคร import (query.ts เรียก microcompact/autocompact เองมาตลอด) |
| snip/microcompact/autocompact ใน `query.ts` (~130 บรรทัด) | เหลือ `runCompaction()` จุดเดียว |
| `snipTokensFreed` plumbing 5 ชั้น | `ledger.applyDelta()` |
| `microcompact`/`autocompact` ใน `query/deps.ts` | ไม่มีใครฉีดแล้ว |
| background status ใน `TokenWarning.tsx` | ไม่มี background job ให้รายงาน |

`microCompact.ts` ยังอยู่ — `/compact`, `/context` และ `analyzeContext` เรียก `microcompactMessages` เพื่อวิเคราะห์ และ reducer ของ v2 ใช้ helper ในไฟล์นั้นซ้ำ (`calculateToolResultTokens`, `collectCompactableToolIds`, `collectDuplicateToolUseState`)

### ผลรันจริง (smoke, v2 เป็น default)

session สังเคราะห์ 49 ข้อความ / usage 175k, window 200k → `actNow` 140k, `softTarget` 120k, deficit 41k:

```
plan: stale-tool(~41k) covers 41k deficit
applied: [ "stale-tool" ]
tokensFreed: 49895     evictions: 5
stub: [evicted: Read: f0.ts — ~10.0k tokens — restore with ContextRestore("ev_1362s9x")]
restore: { restored: true, tokens: 10000, contentMatches: true }
```

**`summarize` ไม่ถูกเรียกเลย** ทั้งที่ระบบเดิมจะยิง full compact ทันทีที่ข้าม 140k — reducer ที่ถูกกว่าเอาอยู่ และของที่ถูกถอดออกกลับมาครบทุก byte

### kill switch

`COMPACT_V2=0` หรือ `compactV2: false` ปิด v2 ได้ แต่เมื่อเส้นทางเดิมถูกลบไปแล้ว การปิดหมายถึง **ไม่มี auto-compact เลย** (เท่ากับ `DISABLE_AUTO_COMPACT`) ไม่ใช่การย้อนกลับไปใช้ระบบเก่า

## 6. เกณฑ์วัดว่าดีขึ้นจริง

1. **restore rate** < 5% — ถ้าโมเดลต้องดึงของกลับบ่อย แปลว่า planner ถอดผิดตัว
2. **summarize invocation rate** ลดลง ≥ 40% ใน session ที่ tool-heavy (เป้าหมายหลัก: หยุด summarize ทิ้งทั้งเซสชันทั้งที่แค่ dedupe ก็พอ)
3. **prompt_too_long เป็นศูนย์** — `drop` reducer รับประกัน
4. **ไม่มี compact ซ้อนกันภายใน 3 turn** โดยไม่ต้องมี cooldown เป็นตัวกัน

---

## 7. ความเสี่ยง

- **prompt cache** — reducer ที่แก้ content ต้น ๆ ของ prompt จะทำลาย cache prefix ระบบเดิมมี `notifyCacheDeletion` กระจายอยู่ v2 ต้องรวมไว้ที่จุดเดียวใน `applyPlan()` และ planner ควรถ่วงน้ำหนัก "ตำแหน่ง" ด้วย ไม่ใช่แค่ token — ถอดของที่อยู่ท้าย ๆ ก่อนถูกกว่าเสมอ
- **`ContextRestore` ถูกใช้พร่ำเพรื่อ** — ต้องกันด้วย budget ต่อ turn ไม่งั้นโมเดลดึงกลับหมดแล้ว deficit เด้งกลับทันที
- **shadow .js files** — `services/compact/` มีไฟล์ `.js` เงาที่รันจริง ต้องผ่าน `/js-shadow-sync` ทุกเฟส ไม่งั้นแก้แล้วไม่มีผล
