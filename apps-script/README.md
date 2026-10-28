# ติดตั้ง Apps Script สำหรับ HR Paper Mill (ผู้ใช้สิทธิ์ + Dashboard เจ้าหน้าที่)

ไฟล์ทั้งหมดในโฟลเดอร์นี้ต้องอยู่ในโปรเจกต์ Apps Script เดียวกัน (DoubleA_App ที่ผูกกับ Google Sheets)

| ไฟล์ | หน้าที่ |
|---|---|
| `Code.gs` | API ของผู้ใช้สิทธิ์ (login / history / submit / image) และตัวกระจายคำสั่ง — **วางแทนของเดิม** |
| `Schema.gs` | โครงสร้างแผ่นงาน, `setup()`, Log, ฟังก์ชันช่วย |
| `Auth.gs` | เข้าสู่ระบบเจ้าหน้าที่ด้วย Google / LINE, session, สิทธิ์ |
| `Staff.gs` | API ของ Dashboard: ภาพรวม, รายงาน, ตัวกรอง, แก้ไข, ผู้ใช้สิทธิ์ |
| `Admin.gs` | จัดการบัญชีเจ้าหน้าที่ และดู Log |
| `Export.gs` | ส่งออก Google Sheets และสรุปรายวันทางอีเมล |

`Index.html` เดิมใช้ต่อได้ ไม่ต้องแก้

---

## 1. เพิ่มไฟล์และรัน `setup()`

1. เปิด Apps Script → วางโค้ด `Code.gs` ใหม่แทนของเดิม
2. กด **+ → Script** สร้างไฟล์ `Schema`, `Auth`, `Staff`, `Admin`, `Export` แล้ววางโค้ดตามชื่อไฟล์
3. เลือกฟังก์ชัน **`setup`** แล้วกด **Run** → กด Allow เมื่อระบบขอสิทธิ์ (Sheets, Drive, การเชื่อมต่อภายนอก, อีเมล)
   - สร้างแผ่นงาน `Staff` และ `Logs`
   - เติมหัวคอลัมน์ใหม่ให้ `Users` (E–L) และ `Records` (K–O) **โดยไม่แตะข้อมูลเดิม**

## 2. ตั้งค่า Script Properties

Project Settings (รูปเฟือง) → **Script properties** → Add script property

| Property | จำเป็น | ค่า |
|---|---|---|
| `ADMIN_EMAILS` | ✔ | อีเมล Google ของผู้ดูแลระบบคนแรก (คั่นด้วย `,`) — เข้าสู่ระบบครั้งแรกแล้วเป็น Admin ทันที |
| `GOOGLE_CLIENT_ID` | ✔ (ถ้าใช้ Google) | Client ID จากข้อ 3 |
| `LINE_CHANNEL_ID` | ✔ (ถ้าใช้ LINE) | Channel ID จากข้อ 4 |
| `LINE_CHANNEL_SECRET` | ✔ (ถ้าใช้ LINE) | Channel secret จากข้อ 4 (เก็บที่นี่เท่านั้น ห้ามใส่ในเว็บ) |
| `LINE_REDIRECT_URIS` | – | ค่าเริ่มต้น `https://bysoftlight.github.io/hr-paper-mill/staff.html` (ถ้าเคยตั้งค่านี้ไว้เป็นลิงก์เดิม ให้แก้เป็นลิงก์นี้) |
| `EXPORT_FOLDER_ID` | – | โฟลเดอร์ Drive สำหรับเก็บไฟล์ Google Sheets ที่ส่งออก |
| `ANOMALY_RADIUS_M` | – | ระยะ (เมตร) ห่างจากจุดขายที่ถือว่า "ตำแหน่งผิดปกติ" ค่าเริ่มต้น 300 |
| `SUMMARY_EMAILS` | – | อีเมลรับสรุปรายวัน (คั่นด้วย `,`) |
| `PROFILE_FOLDER_ID` | – | โฟลเดอร์ Drive เก็บรูปโปรไฟล์ที่อัปโหลดจาก Dashboard (ค่าเริ่มต้น `1-GZAWmJ0daUrM6R9HuiayZzRBQwu_-HE`) |

| `SESSION_DAYS` | – | จดจำการเข้าสู่ระบบของเจ้าหน้าที่กี่วันนับจากการเปิดเว็บครั้งล่าสุด (ค่าเริ่มต้น 90, สูงสุด 365) |

`SESSION_SECRET` ถูกสร้างให้อัตโนมัติ — ถ้าเปลี่ยนค่า ทุกคนจะต้องเข้าสู่ระบบใหม่

## 3. Google Sign-In (Google Cloud Console)

1. https://console.cloud.google.com → เลือก/สร้างโปรเจกต์
2. **APIs & Services → OAuth consent screen** → External → กรอกชื่อแอปและอีเมล → Scopes: `openid`, `email`, `profile`
3. **Credentials → Create credentials → OAuth client ID** → Application type: **Web application**
4. **Authorized JavaScript origins**: `https://bysoftlight.github.io` (ใส่เฉพาะโดเมน ไม่ต้องมี `/hr-paper-mill`)
5. คัดลอก **Client ID** ไปใส่ `GOOGLE_CLIENT_ID`

## 4. LINE Login (LINE Developers Console)

1. https://developers.line.biz/console/ → สร้าง Provider → **Create a LINE Login channel**
2. แท็บ **LINE Login** → Callback URL: `https://bysoftlight.github.io/hr-paper-mill/staff.html` → เปิดใช้ Web app
3. แท็บ **Basic settings** → คัดลอก **Channel ID** และ **Channel secret**
4. (ไม่บังคับ) ขอสิทธิ์ **OpenID Connect → Email address permission** ถ้าต้องการอีเมลของผู้ใช้ LINE (ใช้แชร์ไฟล์ Google Sheets ที่ส่งออก)
5. เปลี่ยนสถานะ channel เป็น **Published** เมื่อพร้อมใช้งานจริง

## 5. Deploy

**Deploy → Manage deployments → Edit (ดินสอ) → Version: New version → Deploy**
(Execute as: Me · Who has access: Anyone) — URL เดิมไม่เปลี่ยน

## 6. ข้อมูลที่ควรเติมในแผ่น `Users`

| คอลัมน์ | ใช้ทำอะไร |
|---|---|
| E จุดขาย | กรองตามจุดขาย, แสดงในรายงาน |
| F–G พิกัดจุดขาย | ตรวจ "ตำแหน่งผิดปกติ" (ห่างจากจุดขายเกิน `ANOMALY_RADIUS_M`) — ใน Dashboard กด "ใช้พิกัดจากรายงานล่าสุด" ได้ |
| H เบอร์โทร | ปุ่มโทรในรายชื่อ "ยังไม่ส่งวันนี้" |
| I ใช้งาน | `FALSE` = ปิดใช้งาน (เข้าสู่ระบบส่งรายงานไม่ได้) |

แก้ผ่านหน้า **ผู้ใช้สิทธิ์** ใน Dashboard ได้เลย ไม่ต้องแก้ในชีต

**รูปโปรไฟล์ (คอลัมน์ D):** ในฟอร์มผู้ใช้สิทธิ์ วางลิงก์ Google Drive / ลิงก์รูปได้เลย หรือกด **อัปโหลดรูป**
→ ระบบย่อรูปแล้วบันทึกลงโฟลเดอร์รูปโปรไฟล์ชื่อ `IMG_<รหัส>` (เช่น `IMG_UN1234`) และใส่ลิงก์ลงคอลัมน์ D ให้อัตโนมัติ
อัปโหลดซ้ำ = แทนที่รูปเดิม (ไฟล์เก่าย้ายไปถังขยะ) · บัญชีที่ Deploy ต้องมีสิทธิ์ **แก้ไข** โฟลเดอร์นี้

## 7. (ไม่บังคับ) สรุปรายวันทางอีเมล

ตั้ง `SUMMARY_EMAILS` แล้วรัน **`installDailySummaryTrigger`** หนึ่งครั้ง → ระบบส่งสรุปทุกวัน 18:00 น.
(จำนวนที่ส่งแล้ว/ยังไม่ส่ง พร้อมรายชื่อ, ผู้ใกล้ครบโควตาขายโดยตัวแทน)

---

## ระบบสิทธิ์

- บัญชีใหม่ (Google หรือ LINE) = **รออนุมัติ** ไม่เห็นข้อมูลใดๆ จนกว่า Admin จะอนุมัติในหน้า **ผู้ดูแลระบบ**
- บทบาท: **Viewer** (ดู) · **Editor** (ดู + เพิ่ม/แก้/ลบ + จัดการผู้ใช้สิทธิ์ + ส่งออก) · **Admin** (ทุกสิทธิ์ + จัดการบัญชี + Log)
- ปรับสิทธิ์รายข้อได้ และการเปลี่ยนสิทธิ์/ระงับบัญชีมีผลทันทีโดยไม่ต้องให้ผู้ใช้ออกจากระบบ
- ระบบไม่ยอมให้ Admin คนสุดท้ายถูกลดสิทธิ์หรือลบ และไม่ให้ Admin ลดสิทธิ์ตัวเอง
- ทุกการแก้ไข ลบ อนุมัติ ส่งออก และการเข้าสู่ระบบ ถูกบันทึกในแผ่น `Logs`
