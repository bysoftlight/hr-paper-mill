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
        if (!user) log_({ id: '', name: 'ผู้ใช้สิทธิ์', role: 'participant' }, 'participant.login_failed', String(req.userId || '').slice(0, 20), { reason: 'ไม่พบรหัสนี้ในระบบ' }, '');
        if (!user) return json_({ success: false, code: 'NOT_FOUND', message: 'ไม่พบรหัสผู้ใช้สิทธิ์นี้ กรุณาตรวจสอบอีกครั้ง' });
        // ส่งประวัติมาพร้อมกัน ลดการเรียก API จาก 2 ครั้งเหลือ 1 ครั้งตอนเปิดแอป
        return json_(req.withHistory ? { success: true, data: user, history: getUserHistory(user.id) } : { success: true, data: user });
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
function findUser_(userId, includeInactive) {
  const id = String(userId || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(id)) return null;
  const data = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Users').getDataRange().getValues();
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
