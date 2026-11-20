// Schema.gs — โครงสร้างแผ่นงาน, ค่าตั้งค่า, Log และฟังก์ชันช่วยที่ใช้ร่วมกัน
// ลำดับคอลัมน์เริ่มที่ 0 (A = 0) — คอลัมน์ใหม่ต่อท้ายของเดิมทั้งหมด ข้อมูลเก่ายังใช้ได้

const SHEET = { USERS: 'Users', RECORDS: 'Records', STAFF: 'Staff', LOGS: 'Logs' };

// Users: ผู้ใช้สิทธิ์ (A–D เดิม)
// DELETED_AT…PREV_ACTIVE = ถังขยะ: ลบแล้วกู้คืนได้ภายใน PARTICIPANT_TRASH_DAYS วัน (ระหว่างนั้นเข้าสู่ระบบไม่ได้ · รหัสยังถูกจองไว้)
const UCOL = { ID: 0, NAME: 1, STATUS: 2, PIC: 3, SITE: 4, SITE_LAT: 5, SITE_LNG: 6, PHONE: 7, ACTIVE: 8, NOTE: 9, UPDATED_AT: 10, UPDATED_BY: 11, ORG: 12, DELETED_AT: 13, DELETED_BY: 14, DELETE_REASON: 15, PREV_ACTIVE: 16 };
const U_HEADERS = ['user_id', 'full_name', 'entitlement', 'photo', 'site', 'site_lat', 'site_lng', 'phone', 'active', 'note', 'updated_at', 'updated_by', 'org_id', 'deleted_at', 'deleted_by', 'delete_reason', 'prev_active'];
const PARTICIPANT_TRASH_DAYS = 30;

// Records: รายงานการขาย (A–J เดิม)
const RCOL = { TS: 0, DATE: 1, TIME: 2, USER_ID: 3, USER_NAME: 4, TYPE: 5, IMAGE: 6, LAT: 7, LNG: 8, MAP: 9, NOTE: 10, STATUS: 11, UPDATED_BY: 12, UPDATED_AT: 13, SOURCE: 14, ACCURACY: 15, PHOTO_HASH: 16, RECEIVED_AT: 17 };
const R_HEADERS = ['timestamp', 'date', 'time', 'user_id', 'user_name', 'sales_type', 'evidence_photo', 'lat', 'lng', 'map_url', 'note', 'status', 'updated_by', 'updated_at', 'source', 'gps_accuracy_m', 'photo_hash', 'received_at'];

// Staff: บัญชีเจ้าหน้าที่ (เข้าสู่ระบบด้วย Google / LINE)
const SCOL = { ID: 0, PROVIDER: 1, SUB: 2, EMAIL: 3, NAME: 4, PICTURE: 5, ROLE: 6, PERMS: 7, STATUS: 8, TOKEN_VER: 9, CREATED_AT: 10, LAST_LOGIN: 11, APPROVED_BY: 12, APPROVED_AT: 13, NOTE: 14, ORG: 15, CUSTOM_PIC: 16 };
const S_HEADERS = ['staff_id', 'provider', 'subject', 'email', 'name', 'photo', 'role', 'permissions', 'status', 'token_version', 'created_at', 'last_login', 'approved_by', 'approved_at', 'note', 'org_id', 'custom_photo'];

// องค์กร (บริษัทลูกค้า) ของเจ้าหน้าที่ที่ส่งคำขออยู่ — ตั้งใน handleStaffRequest_: เจ้าหน้าที่ขององค์กรเห็นเฉพาะผู้ใช้สิทธิ์/รายงานขององค์กรตัวเอง
// null = ไม่จำกัด (Dev, บัญชีที่ไม่ได้ผูกองค์กร, งานเบื้องหลัง) · ล้างทุกคำขอใน doPost
let SCOPE_ORG_ = null;
// ข้อมูลส่วนผู้ดูแล (ประกาศ แบบสอบถาม แจ้งปัญหา Log สถิติ) ที่บันทึกรหัสองค์กรไว้ — อยู่ในขอบเขตของผู้เรียกไหม
// ว่าง = ข้อมูลส่วนกลาง/ของผู้ให้บริการ: เห็นเฉพาะ Dev และบัญชีที่ไม่ได้ผูกองค์กร
const inScope_ = org => !SCOPE_ORG_ || String(org || '').trim() === SCOPE_ORG_;
// เติมหัวคอลัมน์ใหม่ (ต่อท้าย) ในแผ่นงานเดิมที่ยังไม่มี — ไม่ต้องรัน setup ใหม่
function ensureHeader_(sh, col, title) {
  try { if (!String(sh.getRange(1, col + 1).getValue() || '')) sh.getRange(1, col + 1).setValue(title); } catch (e) { console.warn('เติมหัวคอลัมน์ไม่สำเร็จ: ' + e); }
}
// รหัสผู้ใช้สิทธิ์ → รหัสองค์กร (ทุกองค์กร)
function participantOrgMap_() {
  const m = {};
  try { readRows_(SHEET.USERS, U_HEADERS.length).forEach(r => { const id = String(r[UCOL.ID] || '').trim().toUpperCase(); if (id) m[id] = String(r[UCOL.ORG] || '').trim(); }); } catch (e) { console.warn(e); }
  return m;
}

// Logs: บันทึกการใช้งาน
const LCOL = { TS: 0, ACTOR_ID: 1, ACTOR_NAME: 2, ACTOR_ROLE: 3, ACTION: 4, TARGET: 5, DETAILS: 6, USER_AGENT: 7, ORG: 8 };
const L_HEADERS = ['timestamp', 'actor_id', 'actor_name', 'actor_role', 'action', 'target', 'details', 'user_agent', 'org_id'];

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
// หัวคอลัมน์ทุกแผ่นงานเป็นภาษาอังกฤษ (snake_case) — เขียนทับแถวที่ 1 ครั้งเดียวต่อรุ่น (โค้ดอ่านตามตำแหน่งคอลัมน์ ไม่ใช่ชื่อหัว)
const HEADERS_VERSION = 'en1';
function migrateHeadersEn_(force) {
  const props = PropertiesService.getScriptProperties();
  if (!force && props.getProperty('HEADERS_V') === HEADERS_VERSION) return 0;
  const map = [
    [SHEET.USERS, U_HEADERS], [SHEET.RECORDS, R_HEADERS], [SHEET.STAFF, S_HEADERS], [SHEET.LOGS, L_HEADERS],
    ['Analytics', (typeof A_HEADERS !== 'undefined' ? A_HEADERS : null)], ['Orgs', (typeof BO_HEADERS !== 'undefined' ? BO_HEADERS : null)], ['Plans', (typeof BP_HEADERS !== 'undefined' ? BP_HEADERS : null)], ['PayAccounts', (typeof BA_HEADERS !== 'undefined' ? BA_HEADERS : null)], ['Invoices', (typeof BI_HEADERS !== 'undefined' ? BI_HEADERS : null)],
    ['Problems', (typeof P_HEADERS !== 'undefined' ? P_HEADERS : null)], ['Surveys', (typeof V_HEADERS !== 'undefined' ? V_HEADERS : null)], ['SurveyResponses', (typeof SR_HEADERS !== 'undefined' ? SR_HEADERS : null)], ['Announcements', (typeof NW_HEADERS !== 'undefined' ? NW_HEADERS : null)], ['InboxState', (typeof ST_HEADERS !== 'undefined' ? ST_HEADERS : null)],
    [(typeof NOTIFY_SHEET !== 'undefined' ? NOTIFY_SHEET : null) || 'Notify', (typeof N_HEADERS !== 'undefined' ? N_HEADERS : null)], [(typeof CONTACT_SHEET !== 'undefined' ? CONTACT_SHEET : null) || 'Contacts', (typeof C_HEADERS !== 'undefined' ? C_HEADERS : null)], [(typeof THREAT_SHEET !== 'undefined' ? THREAT_SHEET : null) || 'Threats', (typeof T_HEADERS !== 'undefined' ? T_HEADERS : null)]
  ];
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let n = 0;
  map.forEach(([name, headers]) => {
    if (!headers) return;
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    try { sh.getRange(1, 1, 1, headers.length).setValues([headers]); n++; } catch (e) { console.warn('เปลี่ยนหัวคอลัมน์ ' + name + ' ไม่สำเร็จ: ' + e); }
  });
  props.setProperty('HEADERS_V', HEADERS_VERSION);
  return n;
}

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
  migrateHeadersEn_(true); // หัวคอลัมน์ภาษาอังกฤษทุกแผ่นงาน

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

// ข้อความที่ผ่าน clean_ (มี ' นำหน้ากันสูตร) → ข้อความจริงสำหรับแสดงผล/อีเมล/การแจ้งเตือน
function plain_(v) { return String(v === null || v === undefined ? '' : v).replace(/^'(?=[=+\-@])/, ''); }

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
    // องค์กรของรายการ: ของผู้กระทำ → ผู้ใช้สิทธิ์ (จากชีต Users) → องค์กรของคำขอนี้
    let org = actor && actor.org != null ? String(actor.org) : '';
    if (!org && actor && actor.role === 'participant' && actor.id && typeof findUser_ === 'function') { try { const u = findUser_(actor.id, true); org = u ? u.org : ''; } catch (e) {} }
    if (!org) org = SCOPE_ORG_ || '';
    const sh = sheet_(SHEET.LOGS);
    if (sh.getLastColumn() < L_HEADERS.length) ensureHeader_(sh, LCOL.ORG, L_HEADERS[LCOL.ORG]);
    sh.appendRow([
      new Date(),
      actor ? actor.id : '',
      clean_(actor ? actor.name : '', 120),
      actor ? actor.role : '',
      action,
      clean_(target || '', 200),
      clean_(details ? (typeof details === 'string' ? details : JSON.stringify(details)) : '', 2000),
      clean_(userAgent || '', 200),
      org
    ]);
  } catch (e) {
    console.warn('เขียน Log ไม่สำเร็จ: ' + e);
  }
}
