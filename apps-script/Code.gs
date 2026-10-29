// HR Paper Mill — Google Apps Script (ผูกกับ Google Sheets)
// รองรับ 2 ทาง:
//   1) เว็บบน GitHub Pages  → เรียกผ่าน doPost (fetch POST JSON: { action, secret, ... })
//      - หน้าผู้ใช้สิทธิ์ (index.html): login / history / submit / image
//      - หน้าเจ้าหน้าที่ (staff.html): staff.* และ admin.* (ดู Staff.gs, Admin.gs)
//   2) หน้าเว็บของ Apps Script เอง (Index.html) → เรียกผ่าน google.script.run
// ไฟล์ในโปรเจกต์: Code.gs, Schema.gs, Auth.gs, Staff.gs, Admin.gs, Export.gs, Notify.gs, Analytics.gs (+ Index.html) — วิธีติดตั้งดู apps-script/README.md
// หลังแก้โค้ด: Deploy → Manage deployments → Edit (รูปดินสอ) → Version: New version → Deploy
// ตั้งค่า deployment: Execute as = Me, Who has access = Anyone

const IMAGE_FOLDER_ID = '1TwqomzgnM3IrDLCuf3hzY_GxNPmDsm5e'; // <--- ตรวจสอบ ID โฟลเดอร์ให้ถูกต้อง
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const TZ = 'Asia/Bangkok';
const SALES_TYPES = ['ทำการขายด้วยตัวเอง', 'ทำการขายโดยตัวแทน'];
const HISTORY_LIMIT = 400; // พอสำหรับตัวกรอง "ปีนี้" (วันละ 1 รายการ)
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // หลังย่อไฟล์แล้วควรเหลือไม่ถึง 1 MB
const API_SECRET = 'MY_SUPER_SECRET_KEY_2026'; // ต้องตรงกับ API_SECRET ใน js/config.js ของเว็บ

function doGet(e) {
  // ตรวจสุขภาพระบบ: เปิด <URL ของ Web app>?health=1 ในเบราว์เซอร์
  if (e && e.parameter && e.parameter.health) return json_(healthCheck_());
  return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('HR Paper Mill - Sales System')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

// API สำหรับเว็บภายนอก (GitHub Pages)
function doPost(e) {
  USERS_DATA_ = null; // อ่านชีต Users ใหม่ทุกคำขอ
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ success: false, message: 'รูปแบบคำขอไม่ถูกต้อง' });
  }
  if (req.secret !== API_SECRET) return json_({ success: false, message: 'ไม่มีสิทธิ์เข้าถึงระบบ' });

  // ข้อผิดพลาดที่เกิดบนเครื่องผู้ใช้ (หน้าเว็บส่งมาเอง) → Logs เป็น client.error
  if (req.action === 'log.error') {
    try { return json_(logClientError_(req)); } catch (err) { return json_({ success: false }); }
  }

  // สถิติการใช้งาน (ดู Analytics.gs) — ไม่ระบุตัวตน ส่งมาเป็นชุด
  if (req.action === 'analytics.track') {
    try {
      if (typeof analyticsTrack_ !== 'function') return json_({ success: false, message: 'ยังไม่ได้เพิ่มไฟล์ Analytics.gs' });
      return json_(analyticsTrack_(req));
    } catch (err) { return json_({ success: false }); }
  }

  // ป้องกันการเดารหัสผู้ใช้สิทธิ์ (ดูส่วน "ป้องกันการสุ่มรหัส" ด้านล่าง)
  const guarded = GUARDED_ACTIONS_.indexOf(req.action) !== -1 || (/^notify\./.test(String(req.action)) && req.action !== 'notify.inbox' && req.action !== 'notify.config');
  if (guarded) {
    const blocked = guardBefore_(req);
    if (blocked) return json_(blocked);
    if (!findUser_(req.userId, true)) return json_(guardFail_(req));
  }

  // การแจ้งเตือนของผู้ใช้สิทธิ์ และ service worker (ดู Notify.gs)
  if (/^notify\./.test(String(req.action))) {
    try {
      if (typeof handleNotifyRequest_ !== 'function') return json_({ success: false, message: 'ระบบแจ้งเตือนยังไม่ได้ติดตั้ง (เพิ่มไฟล์ Notify.gs ใน Apps Script)' });
      if (req.action === 'notify.inbox') return json_(notifyInbox_(req.endpoint));
      const user = req.userId ? findUser_(req.userId) : null;
      if (req.action !== 'notify.config' && !user) return json_({ success: false, code: 'NOT_FOUND', message: 'ไม่พบรหัสผู้ใช้สิทธิ์ กรุณาเข้าสู่ระบบใหม่' });
      return json_(handleNotifyRequest_(req, user ? { type: 'user', id: user.id } : null));
    } catch (err) {
      return json_({ success: false, message: 'Error: ' + err });
    }
  }

  // คำสั่งของเจ้าหน้าที่ / ผู้ดูแลระบบ
  if (/^(staff|admin)\./.test(String(req.action))) {
    try {
      return json_(handleStaffRequest_(req));
    } catch (err) {
      return json_({ success: false, code: err.code || 'ERROR', message: err.code ? err.message : 'Error: ' + err });
    }
  }

  try {
    switch (req.action) {
      case 'login': {
        const user = findUser_(req.userId, true);
        // code บอกหน้าเว็บว่าเป็นผลชัดเจน (ให้ลืมรหัสที่จำไว้) ต่างจากข้อผิดพลาดชั่วคราวของระบบ
        if (user && !user.active) log_({ id: user.id, name: user.name, role: 'participant' }, 'participant.login_failed', user.id, { reason: 'บัญชีถูกปิดใช้งาน' }, '');
        if (user && !user.active) return json_({ success: false, code: 'INACTIVE', message: 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อเจ้าหน้าที่' });
        if (!user) return json_({ success: false, code: 'NOT_FOUND', message: 'ไม่พบรหัสผู้ใช้สิทธิ์นี้ กรุณาตรวจสอบอีกครั้ง' });
        // ส่งประวัติมาพร้อมกัน ลดการเรียก API จาก 2 ครั้งเหลือ 1 ครั้งตอนเปิดแอป
        const trust = guardTrust_(req, user.id);
        return json_(req.withHistory ? { success: true, data: user, history: getUserHistory(user.id), trust: trust } : { success: true, data: user, trust: trust });
      }
      case 'history':
        return json_({ success: true, history: getUserHistory(req.userId) });
      case 'submit':
        return json_(submitSalesData(Object.assign({}, req.formData, { userId: req.userId })));
      case 'image':
        return json_(getImageData_(req.userId, req.fileId, req.thumb));
      default:
        return json_({ success: false, message: 'ไม่รู้จักคำสั่ง: ' + req.action });
    }
  } catch (err) {
    return json_({ success: false, message: 'Error: ' + err });
  }
}

// จำกัด: ทั้งระบบไม่เกิน 60 รายการ/นาที และข้อความเดิมจากคนเดิมบันทึกครั้งเดียวใน 10 นาที (กัน Log ท่วม)
function logClientError_(req) {
  const cache = CacheService.getScriptCache();
  const minuteKey = 'clienterr:' + Math.floor(Date.now() / 60000);
  const n = Number(cache.get(minuteKey) || 0);
  if (n >= 60) return { success: true, throttled: true };
  cache.put(minuteKey, String(n + 1), 120);
  const msg = clean_(req.message, 300), who = clean_(req.who, 40);
  const sig = 'clienterr:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, who + '|' + msg)).slice(0, 22);
  if (cache.get(sig)) return { success: true, duplicate: true };
  cache.put(sig, '1', 600);
  const role = ['participant', 'staff'].indexOf(req.role) === -1 ? 'unknown' : req.role;
  log_({ id: who, name: clean_(req.whoName, 60) || (who ? who : 'ไม่ทราบ'), role: role }, 'client.error', clean_(req.page, 80), {
    message: msg, kind: clean_(req.kind, 30), source: clean_(req.source, 160), line: clean_(req.line, 12),
    online: req.online, app: req.standalone ? 'แอปบนหน้าจอโฮม' : 'เบราว์เซอร์', version: clean_(req.version, 12), extra: clean_(req.extra, 300)
  }, String(req.userAgent || '').slice(0, 200));
  return { success: true };
}

// =====================================================================
// ป้องกันการสุ่มรหัสผู้ใช้สิทธิ์ (brute force / enumeration)
// รหัสผู้ใช้สิทธิ์คือสิ่งเดียวที่ใช้เข้าระบบ จึงต้องกันคนไล่เดารหัส (เช่น 69BB01, 69BB02, ...)
//   1) นับครั้งที่ "ไม่พบรหัส" ต่อเครื่อง (device = รหัสสุ่มที่หน้าเว็บส่งมา; ไม่ส่ง = กลุ่ม anon ร่วมกัน)
//      ผิด 3 ครั้งใน 15 นาที → ต้องผ่าน "ตรวจความปลอดภัย" (proof-of-work: เครื่องคำนวณ ~1–2 วินาที)
//      ผิด 8 ครั้ง → ล็อกเครื่องนั้น 30 นาที
//   2) ทั้งระบบผิดเกิน 15 ครั้งใน 10 นาที (ต่อให้เปลี่ยนเครื่อง/รหัสเครื่องไปเรื่อยๆ) → เปิด "โหมดป้องกัน" 60 นาที
//      ระหว่างนี้ทุกคำขอที่ใช้รหัสที่ยังไม่เคยเข้าสำเร็จ ต้องผ่านการตรวจความปลอดภัย (ยากขึ้น) และผิด 3 ครั้งล็อกทันที
//      + ส่งอีเมลแจ้ง ADMIN_EMAILS (ไม่เกินชั่วโมงละครั้ง)
//   3) เครื่องที่เคยเข้าระบบสำเร็จได้ "บัตรเครื่องที่เชื่อถือได้" (trust: ลายเซ็นของ เครื่อง+รหัส อายุ 60 วัน)
//      ส่งมาด้วยทุกครั้ง → ผ่านได้ตามปกติแม้อยู่ในโหมดป้องกัน (ผู้ใช้จริงแทบไม่รู้สึกอะไร)
//      ถูกโจมตีหนัก (ผิดเกิน 40 ครั้งใน 10 นาที) → พักการเข้าระบบจากเครื่องใหม่ชั่วคราว (เดารหัสถูกก็ไม่รู้ผล)
//   4) Log: บันทึกความล้มเหลวทีละรายการไม่เกิน 3 ครั้งต่อเครื่อง และไม่เกิน 30 รายการ/10 นาที ที่เหลือสรุปเป็นเหตุการณ์ security.*
// ปรับค่าได้ที่ GUARD ด้านล่าง · ผู้ดูแลระบบดูสถานะ/ปิดโหมดป้องกันได้ที่หน้า Staff › ผู้ดูแลระบบ
// =====================================================================
const GUARDED_ACTIONS_ = ['login', 'history', 'submit', 'image'];
const GUARD = { WINDOW_MIN: 15, CHALLENGE_AT: 3, LOCK_AT: 8, LOCK_MIN: 30, SHIELD_FAILS: 15, SHIELD_WINDOW_MIN: 10, SHIELD_MIN: 60, SHIELD_LOCK_AT: 3,
  HARD_FAILS: 40, POW_BITS: 14, POW_BITS_SHIELD: 18, TRUST_DAYS: 60, LOG_PER_DEVICE: 3, LOG_PER_10MIN: 30 };

function guardCache_() { return CacheService.getScriptCache(); }
function guardDevice_(req) {
  const d = String(req.device || '').replace(/[^\w-]/g, '').slice(0, 32);
  return d.length >= 8 ? d : 'anon';
}
function guardShieldUntil_() { return Number(PropertiesService.getScriptProperties().getProperty('GUARD_SHIELD_UNTIL') || 0); }
function guardShieldOn_() { return guardShieldUntil_() > Date.now(); }

// ก่อนทำคำขอ: เครื่องถูกล็อก? ต้องผ่านการตรวจความปลอดภัยก่อนหรือไม่?
function guardBefore_(req) {
  const c = guardCache_(), dev = guardDevice_(req), now = Date.now();
  const lockedUntil = Number(c.get('g:lock:' + dev) || 0);
  if (lockedUntil > now) {
    const min = Math.ceil((lockedUntil - now) / 60000);
    return { success: false, code: 'LOCKED', retryAfter: lockedUntil - now, message: 'กรอกรหัสผิดหลายครั้ง ระบบพักการเข้าใช้จากเครื่องนี้ชั่วคราว กรุณาลองใหม่ในอีก ' + min + ' นาที หรือติดต่อเจ้าหน้าที่' };
  }
  const id = String(req.userId || '').trim().toUpperCase();
  if (id && guardTrusted_(req.trust, dev, id)) return null; // เครื่องนี้เคยเข้าด้วยรหัสนี้สำเร็จ
  const shield = guardShieldOn_(), fails = Number(c.get('g:f:' + dev) || 0);
  if (shield && guardFails10_() >= GUARD.HARD_FAILS) {
    return { success: false, code: 'PAUSED', retryAfter: 15 * 60000, message: 'ระบบพักการเข้าสู่ระบบจากเครื่องใหม่ชั่วคราว เพื่อความปลอดภัย กรุณาลองใหม่ภายหลัง หรือติดต่อเจ้าหน้าที่' };
  }
  if (!shield && fails < GUARD.CHALLENGE_AT) return null;
  const bits = shield ? GUARD.POW_BITS_SHIELD : GUARD.POW_BITS;
  if (req.pow && guardPowValid_(req.pow, bits)) return null;
  return { success: false, code: 'CHALLENGE', challenge: guardChallenge_(bits), message: 'กำลังตรวจความปลอดภัย กรุณารอสักครู่' };
}

// ไม่พบรหัส: นับ ล็อก เปิดโหมดป้องกัน และบันทึก Log แบบจำกัดจำนวน
function guardFail_(req) {
  const c = guardCache_(), dev = guardDevice_(req), now = Date.now(), shield = guardShieldOn_();
  const fails = Number(c.get('g:f:' + dev) || 0) + 1;
  c.put('g:f:' + dev, String(fails), GUARD.WINDOW_MIN * 60);
  const id = String(req.userId || '').slice(0, 20);

  // ทั้งระบบ: นับเป็นช่องละนาที รวมย้อนหลัง SHIELD_WINDOW_MIN นาที (เก็บ 70 นาทีไว้แสดงกราฟชั่วโมงล่าสุด)
  const minute = Math.floor(now / 60000), mk = 'g:gf:' + minute;
  c.put(mk, String(Number(c.get(mk) || 0) + 1), 70 * 60);
  const total = guardFails10_();
  const devs = c.get('g:devs:' + minute) || '';
  if (devs.split(',').indexOf(dev) === -1) c.put('g:devs:' + minute, (devs ? devs + ',' : '') + dev.slice(0, 12), 900);

  const actor = { id: '', name: 'ผู้ใช้สิทธิ์', role: 'participant' };
  const logsThis10 = 'g:logs:' + Math.floor(now / 600000), nLogs = Number(c.get(logsThis10) || 0);
  if (fails <= GUARD.LOG_PER_DEVICE && nLogs < GUARD.LOG_PER_10MIN) {
    c.put(logsThis10, String(nLogs + 1), 700);
    log_(actor, req.action === 'login' ? 'participant.login_failed' : 'participant.unknown_id', id, { reason: 'ไม่พบรหัสนี้ในระบบ', action: req.action, device: dev.slice(0, 12), attempt: fails }, String(req.userAgent || '').slice(0, 200));
  }

  if (!shield && total >= GUARD.SHIELD_FAILS) guardShield_(total, minute);
  const lockAt = guardShieldOn_() ? GUARD.SHIELD_LOCK_AT : GUARD.LOCK_AT;
  if (fails >= lockAt && !(Number(c.get('g:lock:' + dev) || 0) > now)) {
    c.put('g:lock:' + dev, String(now + GUARD.LOCK_MIN * 60000), GUARD.LOCK_MIN * 60);
    guardNote_('device_locked', { device: dev.slice(0, 12), fails: fails, lastId: id });
    log_(actor, 'security.device_locked', dev.slice(0, 12), { fails: fails, minutes: GUARD.LOCK_MIN, lastTried: id }, String(req.userAgent || '').slice(0, 200));
  }
  if (req.action === 'login') return { success: false, code: 'NOT_FOUND', message: 'ไม่พบรหัสผู้ใช้สิทธิ์นี้ กรุณาตรวจสอบอีกครั้ง' };
  return { success: false, code: 'NOT_FOUND', message: 'ไม่พบรหัสผู้ใช้สิทธิ์ กรุณาเข้าสู่ระบบใหม่' };
}
function guardFails10_() {
  const c = guardCache_(), minute = Math.floor(Date.now() / 60000), keys = [];
  for (let i = 0; i < GUARD.SHIELD_WINDOW_MIN; i++) keys.push('g:gf:' + (minute - i));
  const got = c.getAll(keys);
  return keys.reduce((a, k) => a + Number(got[k] || 0), 0);
}
// บัตรเครื่องที่เชื่อถือได้: "หมดอายุ.ลายเซ็น(เครื่อง|รหัส|หมดอายุ)"
function guardTrust_(req, userId) {
  const dev = guardDevice_(req), id = String(userId || '').trim().toUpperCase();
  if (dev === 'anon' || !id) return '';
  const exp = Date.now() + GUARD.TRUST_DAYS * 86400000;
  return exp.toString(36) + '.' + guardSign_(dev + '|' + id + '|' + exp);
}
function guardTrusted_(token, dev, id) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || dev === 'anon') return false;
  const exp = parseInt(parts[0], 36);
  return exp > Date.now() && guardSign_(dev + '|' + id + '|' + exp) === parts[1];
}

function guardShield_(total, minute) {
  const until = Date.now() + GUARD.SHIELD_MIN * 60000;
  PropertiesService.getScriptProperties().setProperty('GUARD_SHIELD_UNTIL', String(until));
  const c = guardCache_(), devs = {};
  for (let i = 0; i < GUARD.SHIELD_WINDOW_MIN; i++) (c.get('g:devs:' + (minute - i)) || '').split(',').filter(Boolean).forEach(d => { devs[d] = 1; });
  guardNote_('shield_on', { fails: total, devices: Object.keys(devs).length, minutes: GUARD.SHIELD_MIN });
  log_({ id: '', name: 'ระบบป้องกัน', role: 'system' }, 'security.shield_on', 'ทั้งระบบ', { fails10min: total, devices: Object.keys(devs).length, minutes: GUARD.SHIELD_MIN }, '');
  if (!c.get('g:alerted')) {
    c.put('g:alerted', '1', 3600);
    try {
      const to = String(prop_('ADMIN_EMAILS') || '').split(',').map(x => x.trim()).filter(Boolean);
      if (to.length) MailApp.sendEmail(to.join(','), 'HR Paper Mill — พบการไล่เดารหัสผู้ใช้สิทธิ์ (เปิดโหมดป้องกันแล้ว)',
        'มีการกรอกรหัสผู้ใช้สิทธิ์ที่ไม่มีในระบบ ' + total + ' ครั้งใน ' + GUARD.SHIELD_WINDOW_MIN + ' นาที จาก ' + Object.keys(devs).length + ' เครื่อง\n' +
        'ระบบเปิดโหมดป้องกันอัตโนมัติ ' + GUARD.SHIELD_MIN + ' นาที (ผู้ใช้สิทธิ์ที่เข้าระบบอยู่แล้วใช้งานได้ตามปกติ)\n\n' +
        'ดูรายละเอียด: หน้า Staff › ผู้ดูแลระบบ › ความปลอดภัย และแผ่นงาน Logs (security.* / participant.login_failed)');
    } catch (e) { console.warn('ส่งอีเมลแจ้งเตือนความปลอดภัยไม่สำเร็จ', e); }
  }
}

// เหตุการณ์ล่าสุด 30 รายการ (เก็บถาวรใน Script Properties) ไว้แสดงในหน้า Staff
function guardNote_(type, data) {
  const props = PropertiesService.getScriptProperties();
  let list = [];
  try { list = JSON.parse(props.getProperty('GUARD_EVENTS') || '[]'); } catch (e) { list = []; }
  list.unshift(Object.assign({ t: Date.now(), type: type }, data));
  props.setProperty('GUARD_EVENTS', JSON.stringify(list.slice(0, 30)));
}

// ---------- ตรวจความปลอดภัยแบบ proof-of-work ----------
// โจทย์ = "เวลา.สุ่ม.bits.ลายเซ็น" (ลงลายเซ็นด้วย SESSION_SECRET ไม่ต้องเก็บไว้ที่ไหน) ใช้ได้ 10 นาที ครั้งเดียว
// เครื่องต้องหา counter ที่ SHA-256("โจทย์:counter") ขึ้นต้นด้วยบิต 0 จำนวน bits ตัว (14 bits ≈ 16,000 ครั้ง ≈ 1 วินาทีบนมือถือ)
function guardSign_(s) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, sessionSecret_())).slice(0, 22); }
function guardChallenge_(bits) {
  const base = Date.now().toString(36) + '.' + Utilities.getUuid().replace(/-/g, '').slice(0, 12) + '.' + bits;
  return { nonce: base + '.' + guardSign_(base), bits: bits };
}
function guardPowValid_(pow, minBits) {
  const nonce = String(pow && pow.nonce || ''), counter = String(pow && pow.counter || '');
  const parts = nonce.split('.');
  if (parts.length !== 4 || !/^\d{1,12}$/.test(counter)) return false;
  const base = parts.slice(0, 3).join('.'), bits = Number(parts[2]);
  if (guardSign_(base) !== parts[3] || !(bits >= minBits)) return false;
  if (Date.now() - parseInt(parts[0], 36) > 10 * 60000) return false;
  const c = guardCache_(), usedKey = 'g:pow:' + parts[1];
  if (c.get(usedKey)) return false;
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, nonce + ':' + counter, Utilities.Charset.UTF_8);
  let need = bits;
  for (let i = 0; i < d.length && need > 0; i++) {
    const b = (d[i] + 256) % 256;
    if (need >= 8) { if (b !== 0) return false; need -= 8; }
    else { if ((b >> (8 - need)) !== 0) return false; need = 0; }
  }
  c.put(usedKey, '1', 900);
  return true;
}

// ---------- สำหรับหน้า Staff (ผู้ดูแลระบบ) ----------
function guardStatus_() {
  const c = guardCache_(), minute = Math.floor(Date.now() / 60000), keys = [];
  for (let i = 0; i < 60; i++) keys.push('g:gf:' + (minute - i));
  const got = c.getAll(keys);
  const perMin = keys.map(k => Number(got[k] || 0)).reverse();
  let events = [];
  try { events = JSON.parse(PropertiesService.getScriptProperties().getProperty('GUARD_EVENTS') || '[]'); } catch (e) { events = []; }
  return { success: true, shieldUntil: guardShieldUntil_(), shieldOn: guardShieldOn_(), failsLastHour: perMin.reduce((a, b) => a + b, 0),
    fails10min: guardFails10_(), hardPause: guardShieldOn_() && guardFails10_() >= GUARD.HARD_FAILS, perMinute: perMin, events: events, settings: GUARD };
}
function guardSetShield_(on, staff, ua) {
  const props = PropertiesService.getScriptProperties();
  if (on) props.setProperty('GUARD_SHIELD_UNTIL', String(Date.now() + GUARD.SHIELD_MIN * 60000));
  else props.deleteProperty('GUARD_SHIELD_UNTIL');
  guardNote_(on ? 'shield_on_manual' : 'shield_off_manual', { by: staff.name || staff.email || '' });
  log_(staff, on ? 'security.shield_on' : 'security.shield_off', 'ทั้งระบบ', { manual: true }, ua || '');
  return guardStatus_();
}

// บอกว่าไฟล์ไหนขาด/เป็นรุ่นเก่า แผ่นงานไหนไม่มี และ Script Properties ใดยังไม่ตั้ง (ไม่เปิดเผยค่าจริง)
function healthCheck_() {
  const files = {
    'Code.gs': typeof getImageData_ === 'function',
    'Schema.gs': typeof BKK_OFFSET_MS_ === 'number',
    'Auth.gs': typeof renewedToken_ === 'function',
    'Staff.gs': typeof staffLogoutEverywhere_ === 'function',
    'Admin.gs': typeof adminStaffDelete_ === 'function',
    'Export.gs': typeof staffExportGsheet_ === 'function',
    'Notify.gs': typeof handleNotifyRequest_ === 'function',
    'Analytics.gs': typeof analyticsTrack_ === 'function'
  };
  const sheets = {};
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ['Users', 'Records', 'Staff', 'Logs'].forEach(n => { sheets[n] = !!ss.getSheetByName(n); });
  const props = {};
  ['ADMIN_EMAILS', 'GOOGLE_CLIENT_ID', 'LINE_CHANNEL_ID', 'LINE_CHANNEL_SECRET', 'LINE_REDIRECT_URIS'].forEach(k => {
    props[k] = !!PropertiesService.getScriptProperties().getProperty(k);
  });
  const folders = {};
  [['IMAGE_FOLDER_ID', IMAGE_FOLDER_ID], ['PROFILE_FOLDER_ID', typeof PROFILE_FOLDER_ID === 'string' ? PROFILE_FOLDER_ID : '']].forEach(([k, id]) => {
    try { folders[k] = !!id && !!DriveApp.getFolderById(id).getName(); } catch (err) { folders[k] = false; }
  });
  const ok = Object.values(files).every(Boolean) && Object.values(sheets).every(Boolean) && Object.values(folders).every(Boolean);
  return { success: ok, files: files, sheets: sheets, folders: folders, properties: props, time: new Date().toISOString() };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// หาข้อมูลผู้ใช้จากแผ่น Users (A: รหัส, B: ชื่อ, C: การใช้สิทธิ์, D: รูป, ... I: ใช้งาน)
// ผู้ใช้ที่ถูกปิดใช้งาน (I = FALSE) จะไม่พบ ยกเว้น includeInactive
let USERS_DATA_ = null; // อ่านชีต Users ครั้งเดียวต่อคำขอ (ตรวจรหัสก่อน แล้วใช้ซ้ำใน login/submit)
function findUser_(userId, includeInactive) {
  const id = String(userId || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(id)) return null;
  const data = USERS_DATA_ || (USERS_DATA_ = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Users').getDataRange().getValues());
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === id) {
      const flag = data[i][8];
      const active = !(flag === false || String(flag).toUpperCase() === 'FALSE' || String(flag) === '0');
      if (!active && !includeInactive) return null;
      return { id: String(data[i][0]).trim(), name: String(data[i][1]), status: String(data[i][2]), pic: toImageUrl_(data[i][3]), active: active };
    }
  }
  return null;
}

// ดึง file ID จากลิงก์ Google Drive
function toFileId_(url) {
  const s = String(url || '');
  const m = s.match(/[?&]id=([\w-]{20,})/) || s.match(/\/d\/([\w-]{20,})/);
  return m ? m[1] : '';
}

// แปลงลิงก์ Google Drive ให้เป็นลิงก์รูปที่แสดงใน <img> ได้
function toImageUrl_(url) {
  const id = toFileId_(url);
  return id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1000' : String(url || '');
}

// เปิดสิทธิ์ดูรูปแบบ "ทุกคนที่มีลิงก์" ถ้าองค์กร (Google Workspace) ไม่อนุญาต จะลดเป็น "คนในองค์กรที่มีลิงก์"
// ถ้ายังไม่ได้ ก็เก็บไฟล์ไว้แบบส่วนตัว (เว็บจะขอรูปผ่าน action "image" แทน) — ไม่ทำให้การบันทึกล้มเหลว
function shareFile_(file) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'anyone';
  } catch (e) {
    try {
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
      return 'domain';
    } catch (e2) {
      console.warn('setSharing ไม่สำเร็จ (นโยบายการแชร์ขององค์กร): ' + e2);
      return 'private';
    }
  }
}

// 1. ระบบ Login (ตรวจสอบสิทธิ์)
function checkLoginUser(userId) {
  const user = findUser_(userId);
  return user ? { found: true, data: user } : { found: false };
}

// 2. ระบบบันทึกข้อมูล (ใช้ LockService กันการบันทึกชนกัน)
function submitSalesData(formObject) {
  const user = findUser_(formObject && formObject.userId);
  if (!user) return { success: false, message: 'ไม่พบรหัสผู้ใช้สิทธิ์ กรุณาเข้าสู่ระบบใหม่' };
  if (SALES_TYPES.indexOf(formObject.salesType) === -1) return { success: false, message: 'กรุณาเลือกประเภทการขาย' };
  if (!formObject.imageFile || !formObject.imageFile.data) return { success: false, message: 'กรุณาถ่ายภาพหลักฐาน' };
  const lat = parseFloat(formObject.lat), long = parseFloat(formObject.long);
  if (!isFinite(lat) || !isFinite(long)) return { success: false, message: 'ระบบยังไม่ได้รับพิกัด GPS' };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // รอคิวบันทึกสูงสุด 10 วินาที
  } catch (e) {
    return { success: false, message: 'ระบบกำลังทำงานหนัก กรุณากดส่งใหม่อีกครั้ง' };
  }

  try {
    const recordSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Records');
    const received = new Date();
    // ส่งย้อนหลังจากเครื่องที่ออฟไลน์: ใช้เวลาที่ถ่าย/กดบันทึกจริง (ย้อนได้ไม่เกิน 48 ชม.) และระบุที่มาว่า app-offline
    const captured = Number(formObject.capturedAt);
    const delayMs = isFinite(captured) && captured > 0 ? received.getTime() - captured : 0;
    const backdated = delayMs > 10 * 60000 && delayMs <= 48 * 3600000;
    const now = backdated ? new Date(captured) : received;
    const todayStr = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
    ensureRecordHeaders_(recordSheet);

    // --- ตรวจสอบการส่งซ้ำ: Timestamp(A) ถึงสถานะ(L) — รายการที่เจ้าหน้าที่ลบแล้วไม่นับ ---
    const lastRow = recordSheet.getLastRow();
    if (lastRow > 1) {
      const checkData = recordSheet.getRange(2, 1, lastRow - 1, 12).getValues();
      for (let i = checkData.length - 1; i >= 0; i--) {
        if (String(checkData[i][3]).trim().toUpperCase() !== user.id.toUpperCase()) continue;
        if (checkData[i][11] === 'deleted') continue;
        const ts = checkData[i][0] instanceof Date ? checkData[i][0] : new Date(checkData[i][1]);
        if (!isNaN(ts) && Utilities.formatDate(ts, TZ, 'yyyy-MM-dd') === todayStr) {
          return { success: false, message: 'คุณได้บันทึกข้อมูลของวันนี้ไปแล้ว' };
        }
      }
    }

    // --- อัปโหลดรูปภาพ (แยกขั้นตอน เพื่อให้รู้ว่าติดสิทธิ์ที่จุดไหน) ---
    const bytes = Utilities.base64Decode(formObject.imageFile.data);
    if (bytes.length > MAX_IMAGE_BYTES) return { success: false, message: 'ไฟล์ภาพใหญ่เกินไป กรุณาถ่ายใหม่' };
    const fileName = user.id + '_' + Utilities.formatDate(now, TZ, 'yyyyMMdd_HHmmss') + '.jpg';

    let folder;
    try {
      folder = DriveApp.getFolderById(IMAGE_FOLDER_ID);
    } catch (e) {
      return { success: false, message: 'เข้าถึงโฟลเดอร์เก็บรูปไม่ได้ (ตรวจ IMAGE_FOLDER_ID และสิทธิ์แก้ไขของบัญชีเจ้าของสคริปต์): ' + e.message };
    }
    let file;
    try {
      file = folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', fileName));
    } catch (e) {
      return { success: false, message: 'บันทึกรูปลง Google Drive ไม่ได้ (ตรวจพื้นที่ Drive และสิทธิ์แก้ไขโฟลเดอร์): ' + e.message };
    }
    shareFile_(file);

    // --- บันทึกข้อมูล (ลำดับคอลัมน์เหมือนเดิม) ---
    recordSheet.appendRow([
      now,
      todayStr,
      Utilities.formatDate(now, TZ, 'HH:mm:ss'),
      user.id,
      user.name,
      formObject.salesType,
      file.getDownloadUrl(),
      lat,
      long,
      `https://maps.google.com/maps?q=${lat},${long}`,
      '',        // K: หมายเหตุ
      'active',  // L: สถานะ
      '', '',    // M–N: แก้ไขโดย / แก้ไขล่าสุด
      backdated ? 'app-offline' : 'app', // O: ที่มา
      num_(formObject.accuracy) === null ? '' : Math.round(num_(formObject.accuracy)), // P: ความแม่นยำ GPS (ม.)
      /^[0-9a-f]{16}$/.test(String(formObject.photoHash || '')) ? String(formObject.photoHash) : '', // Q: ลายนิ้วมือรูป (dHash)
      received   // R: ระบบได้รับเมื่อ
    ]);
    log_({ id: user.id, name: user.name, role: 'participant' }, 'participant.submit', user.id + ' ' + todayStr, { type: formObject.salesType, offline: backdated ? Math.round(delayMs / 60000) + ' นาที' : undefined }, '');
    if (typeof notifyNewRecord_ === 'function') notifyNewRecord_(user, formObject.salesType, Utilities.formatDate(now, TZ, 'HH:mm'));

    return { success: true, message: 'บันทึกข้อมูลเรียบร้อยแล้ว', record: toRecord_(now, formObject.salesType, file.getDownloadUrl(), lat, long) };
  } catch (error) {
    return { success: false, message: 'Error: ' + error.toString() };
  } finally {
    lock.releaseLock();
  }
}

// หัวคอลัมน์ใหม่ (P–R) สำหรับชีตเดิมที่ยังไม่ได้รัน setup() ใหม่
function ensureRecordHeaders_(sh) {
  const cur = sh.getRange(1, RCOL.ACCURACY + 1, 1, 3).getValues()[0];
  if (!cur[0] || !cur[1] || !cur[2]) sh.getRange(1, RCOL.ACCURACY + 1, 1, 3).setValues([R_HEADERS.slice(RCOL.ACCURACY, RCOL.ACCURACY + 3)]);
}

function toRecord_(ts, type, imageUrl, lat, lng) {
  lat = parseFloat(lat); lng = parseFloat(lng);
  const hasLoc = isFinite(lat) && isFinite(lng);
  return {
    date: fmtDate_(ts),
    time: fmtDate_(ts, 'HH:mm'),
    type: String(type),
    image: toImageUrl_(imageUrl),
    fileId: toFileId_(imageUrl),
    lat: hasLoc ? lat : null,
    lng: hasLoc ? lng : null,
    mapUrl: hasLoc ? `https://maps.google.com/maps?q=${lat},${lng}` : '',
    timestamp: ts.getTime()
  };
}

// 3. ระบบดึงประวัติ (ของผู้ใช้คนนั้น ล่าสุดก่อน)
function getUserHistory(userId) {
  const id = String(userId || '').trim().toUpperCase();
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Records');
  const lastRow = sheet.getLastRow();
  if (!id || lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, 12).getValues(); // A–L: ... G: รูป, H: lat, I: long, L: สถานะ
  const history = [];
  for (let i = data.length - 1; i >= 0 && history.length < HISTORY_LIMIT; i--) {
    if (String(data[i][3]).trim().toUpperCase() !== id) continue;
    if (data[i][11] === 'deleted') continue;
    const ts = data[i][0] instanceof Date ? data[i][0] : new Date(data[i][1]);
    if (isNaN(ts)) continue;
    history.push(toRecord_(ts, data[i][5], data[i][6], data[i][7], data[i][8]));
  }
  return history;
}

// 4. ส่งรูปหลักฐานเป็น data URL (ใช้เมื่อรูปไม่ได้แชร์สาธารณะ) — เฉพาะรูปของผู้ใช้คนนั้นเท่านั้น
function getImageData_(userId, fileId, thumb) {
  const id = String(userId || '').trim().toUpperCase();
  fileId = String(fileId || '');
  if (!id || !/^[\w-]{20,}$/.test(fileId)) return { success: false, message: 'คำขอไม่ถูกต้อง' };

  const user = findUser_(id, true);
  let owns = !!user && toFileId_(user.pic) === fileId; // รูปโปรไฟล์ของตัวเอง
  if (!owns) {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Records');
    const lastRow = sheet.getLastRow();
    const data = lastRow < 2 ? [] : sheet.getRange(2, 4, lastRow - 1, 4).getValues(); // D: รหัส ... G: ลิงก์รูป
    owns = data.some(r => String(r[0]).trim().toUpperCase() === id && toFileId_(r[3]) === fileId);
  }
  if (!owns) return { success: false, message: 'ไม่พบรูป' };

  const file = DriveApp.getFileById(fileId);
  let blob = null;
  if (thumb) { try { blob = file.getThumbnail(); } catch (e) { blob = null; } }
  if (!blob) blob = file.getBlob();
  return { success: true, dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
}

// ทดสอบสิทธิ์ Drive: เลือกฟังก์ชันนี้แล้วกด Run (ครั้งแรกจะขอสิทธิ์ ให้กด Allow)
function testDriveAccess() {
  const folder = DriveApp.getFolderById(IMAGE_FOLDER_ID);
  Logger.log('โฟลเดอร์: ' + folder.getName());
  const file = folder.createFile(Utilities.newBlob('test', 'text/plain', 'drive-access-test.txt'));
  Logger.log('สร้างไฟล์ได้: ' + file.getId());
  Logger.log('การแชร์: ' + shareFile_(file));
  file.setTrashed(true);
  Logger.log('เรียบร้อย — ลบไฟล์ทดสอบแล้ว');
}
