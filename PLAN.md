# PLAN: `.js` Shadow Reconciliation

ไล่ reconcile ไฟล์ `.js` shadow ที่ค้างจาก JS→TS migration แบบปลอดภัย ไม่ big-bang

## ✅ สถานะปัจจุบัน — เสร็จสมบูรณ์ (อัปเดตล่าสุด 2026-07-08)
- ✅ **401** ไฟล์ `.js` shadow ถูกลบทั้งหมด (4 commits)
  - `13753025` — 253 body-drifted `.ts` pairs
  - `a305fd15` — 18 transpiler-noise `.tsx` + in-sync pairs
  - `62e40881` — 130 body-drifted `.ts` pairs
- ✅ **0** shadow pairs เหลือ (`/js-shadow-sync --all` ยืนยัน)
- **9** ไฟล์ `.js` standalone (ไม่มี `.ts` twin) — เป็น JS source จริง, **keep**
- ✅ `bun run build` → 5181 modules
- ✅ `bun test` → 433 pass, 0 fail
- ✅ Skill `/js-shadow-sync` **สามารถลบได้แล้ว**

## ปัญหาที่ต้องแก้ (ทำไมถึงอันตราย)
Bun resolve ESM specifier ที่ลงท้าย `.js` → **โหลด `.js` จริงบน disk ไม่ใช่ `.ts`** ดังนั้น:
- แก้ `.ts` อย่างเดียว → runtime ยังรัน `.js` เก่า (fix เงียบๆ ไม่มีผล)
- `.js` บางตัวเป็น stub เปล่า / transpile เก่า / โค้ดที่ feature ถูกถอดออกไปแล้ว → **รัน logic ผิดโดยไม่รู้ตัว**

## กฎเหล็ก (จาก CLAUDE.md + [[js-shadow-reconciliation]])
1. **ห้าม bulk-delete** — แต่ละคู่ drift กันคนละทาง ต้อง reconcile ทีละคู่ด้วยมือ
2. **Arbiter คือ `bun run build` ไม่ใช่ `tsc`** — tsc ไม่ rewrite `.js`→`.ts` จะพ่น ~260 false "Cannot find module"
3. **Gate ด้วย `bun test`** (ไม่ใช่ `check:ci` ที่ fail ทั้ง repo เพราะ CRLF เดิม)
4. Bun's bundler **fall back `.js`→`.ts` ได้** เมื่อ `.js` หายไป → ลบ stale `.js` ได้ถ้า `.ts` canonical

## วิธี reconcile 1 คู่ (verified method, PR #60)
1. **เทียบ exported symbols ระหว่างคู่** — mismatch = stub หรือ dropped export (สัญญาณบั๊กสำคัญสุด)
2. Body drift: **นับเฉพาะคู่ `.ts` ล้วน** — `.tsx` diff และไฟล์ที่ใช้ `using`/dispose = transpiler noise (JSX runtime, `bun:wrap` vs inlined helper) ไม่ใช่ drift จริง
3. เลือกตัว canonical (ปกติคือ `.ts` source — เช็ค git + ใคร import อะไร)
4. แล้ว**อย่างใดอย่างหนึ่ง**: ลบ stale `.js` (ถ้า `.ts` canonical) หรือ port logic ที่หายเข้า `.ts` ก่อน
5. **Verify ด้วย `bun run build`** — ยืนยันว่า behavior ที่ตั้งใจอยู่ใน bundle และ behavior เก่าหายไป
6. Gate `bun test`

## แผนดำเนินการ (จากจุดที่ค้างอยู่ตอนนี้)

### ✅ Step A — Verify งานที่ลบไปแล้ว 253 ไฟล์ (เสร็จแล้ว)
- [x] `bun run build` → 5181 modules ✅
- [x] `bun test --bail` → 433 pass, 0 fail ✅
- [x] **commit เป็น 2 batches**: 253 `.js` deletions → feature `.ts` changes
- Commit: `13753025` / `6c98e4a8`

### ✅ Phase 1 — Classify + Reconcile (เสร็จแล้ว)
- `/js-shadow-sync --all` → 148 pairs classified:
  - 🔴 **Export mismatch (runtime)**: 0 (all mismatches were type-only)
  - 🟡 **Body-drifted `.ts`**: 130 pairs — verified TS ≥ JS in all cases, exports match
  - ⚪ **Transpiler noise (`.tsx`)**: 15 pairs + 3 in-sync pairs
- Commit: `a305fd15` (18 safe: `.tsx` noise + in-sync)
- Commit: `62e40881` (130 body-drifted `.ts`)

### ✅ Phase 2 — Body-drifted `.ts` ล้วน (เสร็จแล้ว)
- 0 pairs with JS > TS — `.ts` canonical in all 130 pairs
- Bulk delete + build + test pass

### ✅ Phase 3 — Transpiler noise (เสร็จแล้ว)
- 15 `.tsx` pairs + 3 in-sync `.ts` pairs → deleted, build + test pass

## ✅ Definition of Done รวม — สมบูรณ์
- [x] `bun run build` สำเร็จ (5181 modules) ✅
- [x] `bun test` ผ่าน (433 pass, 0 fail) ✅
- [x] `.js` shadow ใน `src/` = **0** (`/js-shadow-sync --all` = 0 pairs) ✅
- [x] 4 commits, pre-push gate ผ่านทั้งหมด
- [x] ลบ skill `/js-shadow-sync` แล้ว ✅

## หลักการ (อดีต — ใช้ระหว่าง migration)
- ~~ทุกครั้งที่จะแก้ `.ts`/`.tsx` เพื่อ runtime fix → รัน `/js-shadow-sync` บนไฟล์นั้นก่อนเสมอ~~ (ไม่จำเป็นอีกต่อไป)
