// Schema.gs — โครงสร้างแผ่นงาน, ค่าตั้งค่า, Log และฟังก์ชันช่วยที่ใช้ร่วมกัน
// ลำดับคอลัมน์เริ่มที่ 0 (A = 0) — คอลัมน์ใหม่ต่อท้ายของเดิมทั้งหมด ข้อมูลเก่ายังใช้ได้

const SHEET = { USERS: 'Users', RECORDS: 'Records', STAFF: 'Staff', LOGS: 'Logs' };

// Users: ผู้ใช้สิทธิ์ (A–D เดิม)
const UCOL = { ID: 0, NAME: 1, STATUS: 2, PIC: 3, SITE: 4, SITE_LAT: 5, SITE_LNG: 6, PHONE: 7, ACTIVE: 8, NOTE: 9, UPDATED_AT: 10, UPDATED_BY: 11 };
const U_HEADERS = ['รหัส', 'ชื่อ-สกุล', 'การใช้สิทธิ์', 'รูป', 'จุดขาย', 'ละติจูดจุดขาย', 'ลองจิจูดจุดขาย', 'เบอร์โทร', 'ใช้งาน', 'หมายเหตุ', 'แก้ไขล่าสุด', 'แก้ไขโดย'];

// Records: รายงานการขาย (A–J เดิม)
const RCOL = { TS: 0, DATE: 1, TIME: 2, USER_ID: 3, USER_NAME: 4, TYPE: 5, IMAGE: 6, LAT: 7, LNG: 8, MAP: 9, NOTE: 10, STATUS: 11, UPDATED_BY: 12, UPDATED_AT: 13, SOURCE: 14 };
const R_HEADERS = ['Timestamp', 'วันที่', 'เวลา', 'รหัส', 'ชื่อ', 'ประเภทการขาย', 'รูปหลักฐาน', 'Latitude', 'Longitude', 'แผนที่', 'หมายเหตุ', 'สถานะ', 'แก้ไขโดย', 'แก้ไขล่าสุด', 'ที่มา'];

// Staff: บัญชีเจ้าหน้าที่ (เข้าสู่ระบบด้วย Google / LINE)
const SCOL = { ID: 0, PROVIDER: 1, SUB: 2, EMAIL: 3, NAME: 4, PICTURE: 5, ROLE: 6, PERMS: 7, STATUS: 8, TOKEN_VER: 9, CREATED_AT: 10, LAST_LOGIN: 11, APPROVED_BY: 12, APPROVED_AT: 13, NOTE: 14 };
const S_HEADERS = ['ID', 'ผู้ให้บริการ', 'Subject', 'อีเมล', 'ชื่อ', 'รูป', 'บทบาท', 'สิทธิ์', 'สถานะ', 'Token version', 'สร้างเมื่อ', 'เข้าใช้ล่าสุด', 'อนุมัติโดย', 'อนุมัติเมื่อ', 'หมายเหตุ'];

// Logs: บันทึกการใช้งาน
const LCOL = { TS: 0, ACTOR_ID: 1, ACTOR_NAME: 2, ACTOR_ROLE: 3, ACTION: 4, TARGET: 5, DETAILS: 6, USER_AGENT: 7 };
const L_HEADERS = ['เวลา', 'ผู้กระทำ (ID)', 'ผู้กระทำ', 'บทบาท', 'การกระทำ', 'เป้าหมาย', 'รายละเอียด', 'อุปกรณ์'];

const AGENT_LIMIT_PER_MONTH = 10;   // ข้อ 1.3
const DEFAULT_ANOMALY_RADIUS_M = 300; // ห่างจากจุดขายเกินนี้ถือว่าตำแหน่งผิดปกติ

// --- ค่าตั้งค่า (Project Settings → Script Properties) ---
function prop_(key, fallback) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return v === null || v === '' ? (fallback === undefined ? '' : fallback) : v;
}

function anomalyRadius_() {
  const n = Number(prop_('ANOMALY_RADIUS_M', DEFAULT_ANOMALY_RADIUS_M));
  return isFinite(n) && n > 0 ? n : DEFAULT_ANOMALY_RADIUS_M;
}

// --- แผ่นงาน ---
const SHEET_CACHE_ = {};
function sheet_(name) {
  if (!SHEET_CACHE_[name]) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    SHEET_CACHE_[name] = ss.getSheetByName(name);
    if (!SHEET_CACHE_[name]) throw new Error('ไม่พบแผ่นงาน "' + name + '" — กรุณารันฟังก์ชัน setup() ก่อน');
  }
  return SHEET_CACHE_[name];
}

// อ่านข้อมูลทั้งหมด (ไม่รวมหัวตาราง) ตามจำนวนคอลัมน์ที่กำหนด
function readRows_(name, width) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, width).getValues();
}

// เตรียมแผ่นงาน/หัวตาราง และค่าตั้งค่าที่จำเป็น — รันครั้งแรก (และรันซ้ำได้ ไม่ลบข้อมูล)
function setup() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const ensure = (name, headers) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const current = sh.getLastColumn() ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), headers.length)).getValues()[0] : [];
    // เติมเฉพาะหัวตารางที่ยังว่าง (ไม่เขียนทับของเดิม)
    headers.forEach((h, i) => { if (!current[i]) sh.getRange(1, i + 1).setValue(h); });
    sh.setFrozenRows(1);
    return sh;
  };
  ensure(SHEET.USERS, U_HEADERS);
  ensure(SHEET.RECORDS, R_HEADERS);
  ensure(SHEET.STAFF, S_HEADERS);
  ensure(SHEET.LOGS, L_HEADERS);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SESSION_SECRET')) props.setProperty('SESSION_SECRET', Utilities.getUuid() + Utilities.getUuid());
  Logger.log('setup เรียบร้อย — ตั้งค่า Script Properties: GOOGLE_CLIENT_ID, LINE_CHANNEL_ID, LINE_CHANNEL_SECRET, ADMIN_EMAILS');
}

// --- ข้อความจากผู้ใช้: กันสูตรใน Sheets (=, +, -, @) และจำกัดความยาว ---
function clean_(v, max) {
  let s = String(v === null || v === undefined ? '' : v).trim();
  if (max) s = s.slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function num_(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

// Asia/Bangkok = UTC+7 ไม่มีเวลาออมแสง: คำนวณเองเร็วกว่า Utilities.formatDate มาก (เรียกหลายพันครั้งต่อคำขอ)
const BKK_OFFSET_MS_ = 7 * 3600000;
function fmtDate_(d, pattern) {
  pattern = pattern || 'yyyy-MM-dd';
  if (pattern !== 'yyyy-MM-dd' && pattern !== 'HH:mm') return Utilities.formatDate(d, TZ, pattern);
  const b = new Date(d.getTime() + BKK_OFFSET_MS_);
  const p2 = n => (n < 10 ? '0' : '') + n;
  return pattern === 'HH:mm' ? p2(b.getUTCHours()) + ':' + p2(b.getUTCMinutes())
    : b.getUTCFullYear() + '-' + p2(b.getUTCMonth() + 1) + '-' + p2(b.getUTCDate());
}

function toDate_(v, fallbackDateStr) {
  if (v instanceof Date && !isNaN(v)) return v;
  const d = new Date(v || fallbackDateStr);
  return isNaN(d) ? null : d;
}

// ระยะทางระหว่างพิกัด (เมตร)
function distanceM_(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// --- Error ที่ส่งกลับไปหน้าเว็บ (code ใช้ตัดสินใจฝั่งเว็บ เช่น AUTH = ต้องเข้าสู่ระบบใหม่) ---
function fail_(code, message) {
  const e = new Error(message);
  e.code = code;
  throw e;
}

// --- Log ---
function log_(actor, action, target, details, userAgent) {
  try {
    sheet_(SHEET.LOGS).appendRow([
      new Date(),
      actor ? actor.id : '',
      clean_(actor ? actor.name : '', 120),
      actor ? actor.role : '',
      action,
      clean_(target || '', 200),
      clean_(details ? (typeof details === 'string' ? details : JSON.stringify(details)) : '', 2000),
      clean_(userAgent || '', 200)
    ]);
  } catch (e) {
    console.warn('เขียน Log ไม่สำเร็จ: ' + e);
  }
}
