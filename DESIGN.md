# HR Paper Mill — Design system

ระบบส่งหลักฐานการขายรายวันสำหรับผู้ใช้สิทธิ์มาตรา 35 ใช้งานบนมือถือเป็นหลัก
ผู้ใช้หลายคนเป็นผู้พิการหรือผู้ดูแล จึงตั้งต้นจาก **อ่านง่าย กดง่าย ใจเย็น**
มากกว่าความหวือหวา

Direction: warm, calm, paper-like — พื้นสีครีมอุ่นแทนสีเทาเย็น ตัวอักษรสีเข้มเกือบดำ
สีหลักเป็นสีดินเผา (clay) ใช้เฉพาะกับปุ่มและสิ่งที่กดได้ หัวข้อใหญ่ใช้ serif
เพื่อให้รู้สึกเป็นเอกสารที่เชื่อถือได้ ไม่ใช่แอปทั่วไป (ได้แรงบันดาลใจจาก
สไตล์หน้า Artifact ของ Claude: neutrals อุ่น, สีเน้นสีเดียว, เส้นขอบบางแทนเงาหนัก)

Tokens อยู่ใน `css/style.css` (`:root`) — ห้ามใช้ค่าสีหรือระยะดิบในหน้า ใช้ชื่อ token เสมอ

## Color

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#FAF9F5` | `#1F1E1B` | พื้นหลังหน้า |
| `--surface` | `#FFFFFF` | `#262522` | การ์ด, dialog, bottom nav |
| `--surface-2` | `#F3F1EA` | `#2E2D29` | พื้นรอง: chip, segmented, ช่อง disabled |
| `--border` | `#E6E3D9` | `#3A3934` | เส้นขอบการ์ดและช่องกรอก |
| `--border-strong` | `#CFCBBE` | `#4D4B44` | ขอบช่องกรอก, hover |
| `--text` | `#141413` | `#ECEAE2` | ตัวอักษรหลัก (17.5:1) |
| `--text-muted` | `#6B6A63` | `#A3A197` | คำอธิบาย, label รอง (≥5:1) |
| `--primary` | `#B4532F` | `#E5835F` | ปุ่มหลัก, ลิงก์, แท็บที่เลือก, focus ring |
| `--primary-hover` | `#9C4526` | `#EE9675` | hover ของปุ่มหลัก |
| `--on-primary` | `#FFFFFF` | `#1F1E1B` | ตัวอักษรบนปุ่มหลัก (≥4.9:1) |
| `--primary-soft` | `#F6E7DF` | `#3B2A22` | พื้นของสิ่งที่ถูกเลือก |
| `--success` / `-soft` | `#2F7A4A` / `#E4F1E8` | `#6FBF8A` / `#1F3227` | ระบุพิกัดสำเร็จ, ส่งงานแล้ว |
| `--warning` / `-soft` | `#8A5A00` / `#FBF0D9` | `#E0B35A` / `#372C17` | หมายเหตุ, กำลังค้นหา |
| `--danger` / `-soft` | `#B3261E` / `#FBE6E4` | `#F08A80` / `#3A211E` | ข้อผิดพลาด, ออกจากระบบ, ข้อความเตือนในกฎ |

ไม่มี gradient ไม่มีสีเน้นที่สอง สีสถานะใช้คู่กับไอคอนและข้อความเสมอ (ไม่สื่อด้วยสีอย่างเดียว)

## Typography

- Body / UI: **LINE Seed Sans TH** (เดิมของแบรนด์) — 400, 700
- Display: **Noto Serif Thai** 600 — เฉพาะชื่อระบบ หัวข้อหน้า และตัวเลขสรุป

| Token | Size / line-height | ใช้กับ |
|---|---|---|
| `--fs-xs` | 13px / 1.5 | caption, เวลาในรายการ |
| `--fs-sm` | 14px / 1.55 | label, helper text |
| `--fs-md` | 16px / 1.6 | body (ขั้นต่ำของข้อความอ่าน) |
| `--fs-lg` | 18px / 1.5 | หัวการ์ด, ปุ่มหลัก |
| `--fs-xl` | 22px / 1.35 | หัวข้อหน้า (serif) |
| `--fs-2xl` | 28px / 1.25 | ชื่อระบบ (serif) |
| `--fs-3xl` | 44px / 1.1 | ตัวเลขสรุปยอด (serif) |

## Spacing & layout

- Scale (4px base): `--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 · `--sp-5` 20 · `--sp-6` 24 · `--sp-8` 32 · `--sp-10` 40
- ความกว้างเนื้อหา `--content` 560px, ขอบข้างมือถือ 16px
- ระยะระหว่างการ์ด 16px, padding การ์ด 20px
- พื้นที่กดขั้นต่ำ 48px (`--tap`)

## Shape & depth

- Radius: `--r-sm` 8 (chip, thumbnail) · `--r-md` 12 (ช่องกรอก, ปุ่ม) · `--r-lg` 16 (การ์ด) · `--r-xl` 24 (dialog) · `--r-full`
- ใช้เส้นขอบ 1px เป็นหลัก เงามีสองระดับ: `--shadow-sm` (bottom nav, ปุ่มลอย) และ `--shadow-lg` (dialog)

## Components

- **Button** — `.btn` + `.btn-primary` (พื้น primary), `.btn-secondary` (พื้น surface + ขอบ), `.btn-quiet` (ไม่มีพื้น), `.btn-danger-quiet`.
  สูง 48px (ปุ่มหลัก 56px), hover เปลี่ยนสีพื้น, focus = ring 3px สี primary, disabled = opacity .5 + cursor not-allowed
- **Input** — สูง 52px, ขอบ `--border-strong`, focus ขอบ primary + ring; ช่องรหัสผู้ใช้เป็นตัวพิมพ์ใหญ่ เว้นช่องตัวอักษร
- **Card** — `.card`: surface + border + `--r-lg`. การ์ดขั้นตอน `.step` มีเลขลำดับ และสถานะ done / error
- **Choice card** — radio ขนาดใหญ่ทั้งการ์ด เลือกแล้วขอบ primary + พื้น `--primary-soft`
- **Segmented control** — `.segmented` สำหรับ สัปดาห์ / เดือน / ปี และธีม
- **Status pill** — `.pill` + `is-success|is-warning|is-danger`
- **Bottom nav** — 3 แท็บ (ส่งงาน, ประวัติ, บัญชี), ไอคอน + ป้าย, แท็บที่เลือกสี primary
- **Dialog** — `<dialog>` native, `--r-xl`, ใช้แทน alert/confirm ทั้งหมด
- **Footer** — แสดงเฉพาะหน้าเข้าสู่ระบบ ลิงก์ข้อมูลอยู่ในแท็บ "บัญชี" เมื่อเข้าสู่ระบบแล้ว

## Imagery & icons

- ไอคอน: **Bootstrap Icons** ชุดเดียว (แบบ fill สำหรับสถานะ, แบบเส้นสำหรับเมนู) ไม่ใช้อีโมจิ
- รูปโปรไฟล์วงกลม; ถ้าไม่มีรูปแสดงอักษรย่อบนพื้น `--primary-soft`
- รูปหลักฐานแสดงเป็น thumbnail มุม `--r-sm` และเปิดดูเต็มจอใน dialog
