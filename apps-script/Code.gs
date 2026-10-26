// HR Paper Mill — Google Apps Script (ผูกกับ Google Sheets)
// รองรับ 2 ทาง:
//   1) เว็บบน GitHub Pages  → เรียกผ่าน doPost (fetch POST JSON: { action, secret, ... })
//   2) หน้าเว็บของ Apps Script เอง (Index.html) → เรียกผ่าน google.script.run
// หลังแก้โค้ด: Deploy → Manage deployments → Edit (รูปดินสอ) → Version: New version → Deploy
// ตั้งค่า deployment: Execute as = Me, Who has access = Anyone

const IMAGE_FOLDER_ID = '1TwqomzgnM3IrDLCuf3hzY_GxNPmDsm5e'; // <--- ตรวจสอบ ID โฟลเดอร์ให้ถูกต้อง
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const TZ = 'Asia/Bangkok';
const SALES_TYPES = ['ทำการขายด้วยตัวเอง', 'ทำการขายโดยตัวแทน'];
const HISTORY_LIMIT = 400; // พอสำหรับตัวกรอง "ปีนี้" (วันละ 1 รายการ)
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // หลังย่อไฟล์แล้วควรเหลือไม่ถึง 1 MB
const API_SECRET = 'MY_SUPER_SECRET_KEY_2026'; // ต้องตรงกับ API_SECRET ใน js/config.js ของเว็บ

function doGet() {
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

  try {
    switch (req.action) {
      case 'login': {
        const user = findUser_(req.userId);
        return json_(user ? { success: true, data: user } : { success: false, message: 'ไม่พบรหัสผู้ใช้สิทธิ์นี้ กรุณาตรวจสอบอีกครั้ง' });
      }
      case 'history':
        return json_({ success: true, history: getUserHistory(req.userId) });
      case 'submit':
        return json_(submitSalesData(Object.assign({}, req.formData, { userId: req.userId })));
      case 'image':
        return json_(getImageData_(req.userId, req.fileId));
      default:
        return json_({ success: false, message: 'ไม่รู้จักคำสั่ง: ' + req.action });
    }
  } catch (err) {
    return json_({ success: false, message: 'Error: ' + err });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// หาข้อมูลผู้ใช้จากแผ่น Users (A: รหัส, B: ชื่อ, C: การใช้สิทธิ์, D: รูป)
function findUser_(userId) {
  const id = String(userId || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(id)) return null;
  const data = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Users').getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === id) {
      return { id: String(data[i][0]).trim(), name: String(data[i][1]), status: String(data[i][2]), pic: toImageUrl_(data[i][3]) };
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
    const now = new Date();
    const todayStr = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');

    // --- ตรวจสอบการส่งซ้ำ: ดึงเฉพาะ Timestamp(A) ถึง EmployeeID(D) ---
    const lastRow = recordSheet.getLastRow();
    if (lastRow > 1) {
      const checkData = recordSheet.getRange(2, 1, lastRow - 1, 4).getValues();
      for (let i = checkData.length - 1; i >= 0; i--) {
        if (String(checkData[i][3]).trim().toUpperCase() !== user.id.toUpperCase()) continue;
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
      `https://maps.google.com/maps?q=${lat},${long}`
    ]);

    return { success: true, message: 'บันทึกข้อมูลเรียบร้อยแล้ว', record: toRecord_(now, formObject.salesType, file.getDownloadUrl()) };
  } catch (error) {
    return { success: false, message: 'Error: ' + error.toString() };
  } finally {
    lock.releaseLock();
  }
}

function toRecord_(ts, type, imageUrl) {
  return {
    date: Utilities.formatDate(ts, TZ, 'yyyy-MM-dd'),
    time: Utilities.formatDate(ts, TZ, 'HH:mm'),
    type: String(type),
    image: toImageUrl_(imageUrl),
    fileId: toFileId_(imageUrl),
    timestamp: ts.getTime()
  };
}

// 3. ระบบดึงประวัติ (ของผู้ใช้คนนั้น ล่าสุดก่อน)
function getUserHistory(userId) {
  const id = String(userId || '').trim().toUpperCase();
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Records');
  const lastRow = sheet.getLastRow();
  if (!id || lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const history = [];
  for (let i = data.length - 1; i >= 0 && history.length < HISTORY_LIMIT; i--) {
    if (String(data[i][3]).trim().toUpperCase() !== id) continue;
    const ts = data[i][0] instanceof Date ? data[i][0] : new Date(data[i][1]);
    if (isNaN(ts)) continue;
    history.push(toRecord_(ts, data[i][5], data[i][6]));
  }
  return history;
}

// 4. ส่งรูปหลักฐานเป็น data URL (ใช้เมื่อรูปไม่ได้แชร์สาธารณะ) — เฉพาะรูปของผู้ใช้คนนั้นเท่านั้น
function getImageData_(userId, fileId) {
  const id = String(userId || '').trim().toUpperCase();
  fileId = String(fileId || '');
  if (!id || !/^[\w-]{20,}$/.test(fileId)) return { success: false, message: 'คำขอไม่ถูกต้อง' };

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Records');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, message: 'ไม่พบรูป' };
  const data = sheet.getRange(2, 4, lastRow - 1, 4).getValues(); // D: รหัส ... G: ลิงก์รูป
  const owns = data.some(r => String(r[0]).trim().toUpperCase() === id && toFileId_(r[3]) === fileId);
  if (!owns) return { success: false, message: 'ไม่พบรูป' };

  const blob = DriveApp.getFileById(fileId).getBlob();
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
