# HR Paper Mill

ระบบส่งรายงานการขายประจำวัน โครงการใช้สิทธิ์สัมปทานผู้พิการตามมาตรา 35

เว็บไซต์: https://bysoftlight.github.io/hr-paper-mill/ (เจ้าหน้าที่: https://bysoftlight.github.io/hr-paper-mill/staff.html)

| หน้า | สำหรับ |
|---|---|
| `index.html` | ผู้ใช้สิทธิ์ — เข้าสู่ระบบด้วยรหัส 6 หลัก ส่งรายงาน ดูประวัติ ส่งออก PDF |
| `staff.html` | เจ้าหน้าที่ HR / ผู้ดูแลระบบ — เข้าสู่ระบบด้วย Google หรือ LINE (ต้องได้รับอนุมัติ) |

- Backend: Google Apps Script + Google Sheets — วิธีติดตั้งดู [`apps-script/README.md`](apps-script/README.md)
- Design system: [`DESIGN.md`](DESIGN.md)
- ทุกครั้งที่แก้ CSS/JS ให้เปลี่ยนเลข `?v=` ใน `index.html` / `staff.html`
