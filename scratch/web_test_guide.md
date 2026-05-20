# 🧪 คู่มือการทดสอบเว็บอัตโนมัติ (Autonomous Web Testing Guide)

เพื่อให้ Agent สามารถทดสอบหน้าเว็บที่เขียนเสร็จได้ทันทีโดยไม่ต้องใช้คนคลิก ให้ทำตามลูปนี้:

## 1. รัน Server ใน Background
ใช้ `BashTool` รันคำสั่งแบบไม่บล็อก (Background) เช่น:
```bash
npm run dev &
```

## 2. ใช้ BrowserTool เข้าไปตรวจสอบ
สั่งให้ Agent ใช้ `BrowserTool` นำทางไปยัง URL ของ Local Server:
- **Action**: `navigate`
- **URL**: `http://localhost:3000` (หรือ Port ที่มึงรันไว้)

## 3. วิเคราะห์ผลลัพธ์จาก Console Log
ตอนนี้ `BrowserTool` จะส่งค่ากลับมาพร้อมส่วนที่ชื่อว่า `--- BROWSER CONSOLE ---`
- หากเจอคำว่า `[ERROR]` หรือ `Uncaught ReferenceError` ให้ Agent **แก้โค้ดทันที** แล้วรันเทสใหม่

## 4. ตรวจสอบ UI ด้วยดวงตา (Screenshot)
Agent สามารถดูรูป Screenshot ที่ส่งกลับมาเพื่อเช็คว่า:
- ปุ่มอยู่ในตำแหน่งที่ถูกมั้ย?
- สีสันตรงตามดีไซน์มั้ย?

## 5. การจำลองการใช้งาน (User Flow)
Agent สามารถจำลองการเป็น User ได้ เช่น:
1. `fill` - กรอกฟอร์ม Login
2. `click` - กดปุ่ม Submit
3. `wait_for` - รอให้หน้าจอนำทางไปยัง Dashboard
4. `extract` - ดึงเนื้อหามาเช็คว่า Login สำเร็จมั้ย

---
**ตัวอย่างการสั่งงาน:**
"เฮ้ย บอท! ช่วยรันหน้าเว็บที่เพิ่งแก้ แล้วเข้าไปเช็คใน Chrome หน่อยว่าปุ่ม Login กดได้มั้ย ถ้าเจอ Error ใน Console ให้แก้ให้กูด้วยนะ!"
