// Feedback.gs — แจ้งปัญหาการใช้งาน และแบบสอบถามความพึงพอใจ
//
// 1) แจ้งปัญหา (ผู้ใช้สิทธิ์ · เจ้าหน้าที่ · หรือคนที่ยังเข้าระบบไม่ได้จากหน้าเข้าสู่ระบบ)
//    - บันทึกในแผ่นงาน "Problems" (สร้างให้อัตโนมัติ) + ส่งอีเมลถึง PROBLEM_EMAILS (ไม่ตั้ง = ADMIN_EMAILS) ทันที
//    - แนบภาพหน้าจอได้ 1 รูป (เก็บในโฟลเดอร์รูปหลักฐาน ชื่อไฟล์ขึ้นต้น problem-) และแนบไปกับอีเมล
//    - กันสแปม: เครื่องละไม่เกิน 5 ครั้ง/ชั่วโมง · ทั้งระบบไม่เกิน 60 ครั้ง/ชั่วโมง · อีเมลไม่เกิน 80 ฉบับ/วัน
//    - ผู้ดูแลระบบดู/เปลี่ยนสถานะได้ที่หน้า Staff › ผู้ดูแลระบบ › แจ้งปัญหา
//
// 2) แบบสอบถาม (ผู้ดูแลระบบสร้าง → ตั้งวันเวลาเริ่ม → ระบบส่งให้ผู้ใช้สิทธิ์ที่เลือก)
//    - แผ่นงาน "Surveys" (แบบสอบถาม) และ "SurveyResponses" (คำตอบ) สร้างให้อัตโนมัติ
//    - ผู้ใช้สิทธิ์เห็นแบบสอบถามเมื่อถึงเวลาเริ่ม: ขึ้นให้ทำหลังส่งรายงานของวันนั้น หรือกด "ทำภายหลัง" แล้วทำจากแถบเตือนได้
//    - แจ้งเตือนบนมือถือ (ถ้าเปิดไว้) เมื่อถึงเวลาเริ่ม และเตือนซ้ำอีกครั้งหลัง SURVEY_REMIND_HOURS ชั่วโมง ถ้ายังไม่ทำ
//      ต้องรัน installAllTriggers() ใหม่หนึ่งครั้ง (เพิ่มตัวตั้งเวลา surveyTick ทุก 15 นาที)

const PROBLEM_SHEET = 'Problems';
const PCOL = { ID: 0, TS: 1, ROLE: 2, REPORTER_ID: 3, REPORTER_NAME: 4, CONTACT: 5, CATEGORY: 6, TITLE: 7, DETAIL: 8, PAGE: 9, CLIENT: 10, VERSION: 11, STATUS: 12, HANDLED_BY: 13, HANDLED_AT: 14, ADMIN_NOTE: 15, IMAGE: 16, VERIFIED: 17 };
const P_HEADERS = ['ID', 'เวลา', 'บทบาท', 'รหัส/อีเมลผู้แจ้ง', 'ชื่อผู้แจ้ง', 'ติดต่อกลับ', 'หมวด', 'หัวข้อ', 'รายละเอียด', 'หน้า', 'อุปกรณ์', 'เวอร์ชัน', 'สถานะ', 'จัดการโดย', 'จัดการเมื่อ', 'หมายเหตุผู้ดูแล', 'ภาพหน้าจอ', 'ยืนยันตัวตน'];
const PROBLEM_CATEGORIES = { login: 'เข้าสู่ระบบไม่ได้', gps: 'GPS / ตำแหน่ง', camera: 'กล้อง / รูปภาพ', submit: 'ส่งรายงานไม่ได้', data: 'ข้อมูลไม่ถูกต้อง', slow: 'ช้า / ค้าง', display: 'หน้าจอแสดงผลผิดปกติ', notify: 'การแจ้งเตือน', other: 'อื่นๆ' };
const PROBLEM_STATUS = { new: 'ใหม่', doing: 'กำลังแก้ไข', done: 'แก้ไขแล้ว', wont: 'ไม่ดำเนินการ' };
const PROBLEM_MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const SURVEY_SHEET = 'Surveys', RESPONSE_SHEET = 'SurveyResponses';
const VCOL = { ID: 0, TITLE: 1, INTRO: 2, QUESTIONS: 3, START_AT: 4, END_AT: 5, TARGET: 6, STATUS: 7, CREATED_BY: 8, CREATED_AT: 9, NOTIFIED_AT: 10, REMINDED_AT: 11, UPDATED_AT: 12 };
const V_HEADERS = ['ID', 'หัวข้อ', 'คำอธิบาย', 'คำถาม (JSON)', 'เริ่มส่ง', 'ปิดรับ', 'ผู้รับ', 'สถานะ', 'สร้างโดย', 'สร้างเมื่อ', 'แจ้งเตือนแล้ว', 'เตือนซ้ำแล้ว', 'แก้ไขล่าสุด'];
const SRCOL = { TS: 0, SURVEY: 1, USER_ID: 2, USER_NAME: 3, ANSWERS: 4, WHEN: 5, CLIENT: 6, READABLE: 7 };
const SR_HEADERS = ['เวลา', 'แบบสอบถาม', 'รหัส', 'ชื่อ', 'คำตอบ (JSON)', 'ทำเมื่อ', 'อุปกรณ์', 'คำตอบ (อ่านง่าย)'];
const SURVEY_WHEN = { after_submit: 'หลังส่งรายงาน', later: 'ทำภายหลัง', banner: 'จากแถบเตือน', push: 'จากการแจ้งเตือน' };
const SURVEY_Q_TYPES = ['rating', 'choice', 'text'];

function feedbackSheet_(name, headers) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function feedbackRows_(name, headers) {
  const sh = feedbackSheet_(name, headers), last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, headers.length).getValues();
}
const fbTime_ = d => (d instanceof Date && !isNaN(d) ? d.getTime() : null);
const fbEsc_ = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function fbClient_(req) { return typeof uaSummary_ === 'function' ? uaSummary_(req.ua || req.userAgent) : clean_(req.userAgent, 120); }
function fbRecipients_() {
  return String(prop_('PROBLEM_EMAILS') || prop_('ADMIN_EMAILS')).split(',').map(s => s.trim()).filter(Boolean);
}

// =====================================================================
// แจ้งปัญหา
// =====================================================================
// จากหน้าผู้ใช้สิทธิ์ (index.html) — เข้าระบบแล้วหรือยังก็ได้ · ตอบสำเร็จเสมอเมื่อรับเรื่อง (ไม่บอกว่ารหัสมีจริงไหม กันการไล่เดารหัส)
function problemReportPublic_(req) {
  const dev = String(req.device || 'anon').replace(/[^\w-]/g, '').slice(0, 40) || 'anon';
  const limited = problemRateLimit_(dev);
  if (limited) return limited;
  const user = req.userId ? findUser_(req.userId, true) : null;
  const typedId = clean_(String(req.userId || '').toUpperCase(), 12);
  return problemSave_(req, {
    role: user ? 'participant' : 'guest', id: user ? user.id : typedId, name: user ? user.name : clean_(req.name, 80), verified: !!user
  });
}

// จากหน้าเจ้าหน้าที่ (staff.html) — ต้องเข้าสู่ระบบแล้ว (บัญชีรออนุมัติก็แจ้งได้)
function problemReportStaff_(req, staff) {
  const limited = problemRateLimit_('s' + staff.id);
  if (limited) return limited;
  return problemSave_(req, { role: 'staff', id: staff.email || staff.id, name: staff.name, verified: true, contact: staff.email || '' });
}

function problemRateLimit_(key) {
  const c = CacheService.getScriptCache(), hour = Math.floor(Date.now() / 3600000);
  const kd = 'pr:' + key + ':' + hour, kg = 'pr:all:' + hour;
  const nd = Number(c.get(kd) || 0), ng = Number(c.get(kg) || 0);
  if (nd >= 5) return { success: false, code: 'LIMIT', message: 'แจ้งปัญหาจากเครื่องนี้หลายครั้งแล้ว กรุณารอสักครู่ หรือโทรหาเจ้าหน้าที่' };
  if (ng >= 60) return { success: false, code: 'LIMIT', message: 'ขณะนี้มีการแจ้งปัญหาจำนวนมาก กรุณาลองใหม่ภายหลัง หรือโทรหาเจ้าหน้าที่' };
  c.put(kd, String(nd + 1), 3700); c.put(kg, String(ng + 1), 3700);
  return null;
}

function problemSave_(req, who) {
  const category = PROBLEM_CATEGORIES[req.category] ? req.category : 'other';
  const detail = clean_(req.detail, 3000);
  if (detail.replace(/\s/g, '').length < 5) return { success: false, message: 'กรุณาเล่ารายละเอียดของปัญหาอย่างน้อย 1 ประโยค' };
  if (who.role === 'guest' && !clean_(req.contact, 120)) return { success: false, message: 'กรุณากรอกเบอร์โทรหรือช่องทางติดต่อกลับ' };
  const id = 'P' + Utilities.formatDate(new Date(), TZ, 'yyMMdd') + '-' + Utilities.getUuid().slice(0, 4).toUpperCase();
  const now = new Date(), client = fbClient_(req);

  // ภาพหน้าจอ (ถ้ามี): เก็บใน Drive + แนบอีเมล · บันทึกไม่สำเร็จก็ยังรับเรื่องได้
  let blob = null, imageUrl = '';
  try {
    const img = req.image;
    if (img && img.data && /^image\/(jpeg|png|webp)$/.test(img.mimeType || '')) {
      const bytes = Utilities.base64Decode(String(img.data).replace(/^data:[^,]+,/, ''));
      if (bytes.length <= PROBLEM_MAX_IMAGE_BYTES) {
        blob = Utilities.newBlob(bytes, img.mimeType, 'problem-' + id + (img.mimeType === 'image/png' ? '.png' : '.jpg'));
        const file = DriveApp.getFolderById(IMAGE_FOLDER_ID).createFile(blob);
        imageUrl = file.getUrl();
      }
    }
  } catch (e) { console.warn('บันทึกภาพหน้าจอไม่สำเร็จ', e); }

  const row = [];
  row[PCOL.ID] = id; row[PCOL.TS] = now; row[PCOL.ROLE] = who.role; row[PCOL.REPORTER_ID] = clean_(who.id, 120); row[PCOL.REPORTER_NAME] = clean_(who.name, 120);
  row[PCOL.CONTACT] = clean_(req.contact || who.contact, 120); row[PCOL.CATEGORY] = PROBLEM_CATEGORIES[category]; row[PCOL.TITLE] = clean_(req.title, 150);
  row[PCOL.DETAIL] = detail; row[PCOL.PAGE] = clean_(req.page, 80); row[PCOL.CLIENT] = client; row[PCOL.VERSION] = clean_(req.version, 20);
  row[PCOL.STATUS] = PROBLEM_STATUS.new; row[PCOL.HANDLED_BY] = ''; row[PCOL.HANDLED_AT] = ''; row[PCOL.ADMIN_NOTE] = ''; row[PCOL.IMAGE] = imageUrl; row[PCOL.VERIFIED] = who.verified ? 'ใช่' : 'ไม่';
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = feedbackSheet_(PROBLEM_SHEET, P_HEADERS);
    sh.getRange(sh.getLastRow() + 1, 1, 1, P_HEADERS.length).setValues([row]);
  } finally { lock.releaseLock(); }

  log_({ id: who.id || 'guest', name: who.name || 'ไม่ระบุ', role: who.role }, 'feedback.problem', id, { category: category, page: row[PCOL.PAGE] }, client);
  const mailed = problemEmail_(row, blob, extraInfo_(req));
  return { success: true, id: id, mailed: mailed };
}

// ข้อมูลประกอบที่หน้าเว็บส่งมา (ช่วยหาสาเหตุ): ออนไลน์ไหม · ขนาดจอ · โหมดแอป · ข้อผิดพลาดล่าสุด
function extraInfo_(req) {
  const e = req.env || {};
  return [
    ['การเชื่อมต่อ', e.online === false ? 'ออฟไลน์' : e.online ? 'ออนไลน์' : ''],
    ['ขนาดจอ', clean_(e.screen, 30)],
    ['เปิดจาก', e.standalone ? 'แอปบนหน้าจอโฮม' : e.standalone === false ? 'เบราว์เซอร์' : ''],
    ['ภาษา/เขตเวลา', clean_(e.lang, 40)],
    ['ข้อผิดพลาดล่าสุด', clean_(e.lastError, 300)]
  ].filter(r => r[1]);
}

function problemEmail_(row, blob, extra) {
  const to = fbRecipients_();
  if (!to.length) return false;
  const props = PropertiesService.getScriptProperties(), dayKey = 'PROBLEM_MAILS_' + fmtDate_(new Date());
  const n = Number(props.getProperty(dayKey) || 0);
  if (n >= 80) return false;
  props.setProperty(dayKey, String(n + 1));
  const roleTh = { participant: 'ผู้ใช้สิทธิ์', staff: 'เจ้าหน้าที่', guest: 'ผู้ใช้ (ยังไม่ได้เข้าสู่ระบบ)' }[row[PCOL.ROLE]] || row[PCOL.ROLE];
  const rows = [['เลขที่', row[PCOL.ID]], ['เวลา', Utilities.formatDate(row[PCOL.TS], TZ, 'd MMM yyyy HH:mm')], ['ผู้แจ้ง', [row[PCOL.REPORTER_NAME], row[PCOL.REPORTER_ID]].filter(Boolean).join(' · ') + ' (' + roleTh + (row[PCOL.ROLE] === 'guest' && row[PCOL.REPORTER_ID] ? ', รหัสที่กรอกยังไม่ยืนยัน' : '') + ')'],
    ['ติดต่อกลับ', row[PCOL.CONTACT]], ['หมวด', row[PCOL.CATEGORY]], ['หน้า', row[PCOL.PAGE]], ['อุปกรณ์', row[PCOL.CLIENT]], ['เวอร์ชัน', row[PCOL.VERSION]]].concat(extra).filter(r => r[1]);
  const site = SITE_URL + 'staff.html#admin';
  const title = plain_(row[PCOL.TITLE] || row[PCOL.CATEGORY]);
  const html = '<div style="font-family:Arial,sans-serif;max-width:600px">' +
    '<p style="margin:0 0 4px;color:#0850D1;font-weight:bold">แจ้งปัญหาการใช้งาน · ' + fbEsc_(roleTh) + '</p>' +
    '<h2 style="margin:0 0 12px;font-weight:500">' + fbEsc_(title) + '</h2>' +
    '<div style="margin:0 0 16px;padding:12px 14px;background:#F0F4F9;border-radius:12px;font-size:15px;white-space:pre-wrap">' + fbEsc_(plain_(row[PCOL.DETAIL])) + '</div>' +
    '<table style="border-collapse:collapse;font-size:14px">' + rows.map(r => '<tr><td style="padding:4px 12px 4px 0;color:#5F6368;vertical-align:top;white-space:nowrap">' + r[0] + '</td><td style="padding:4px 0">' + fbEsc_(r[1]) + '</td></tr>').join('') + '</table>' +
    (row[PCOL.IMAGE] ? '<p style="font-size:14px">ภาพหน้าจอ: แนบมากับอีเมลนี้ · <a href="' + fbEsc_(row[PCOL.IMAGE]) + '">เปิดใน Google Drive</a></p>' : '') +
    '<p><a href="' + site + '" style="display:inline-block;padding:10px 18px;background:#0850D1;color:#fff;border-radius:999px;text-decoration:none">เปิดรายการแจ้งปัญหา</a></p>' +
    '<p style="font-size:12px;color:#5F6368">ดูทั้งหมดได้ในแผ่นงาน Problems · เปลี่ยนสถานะได้ที่หน้า Staff › ผู้ดูแลระบบ › แจ้งปัญหา</p></div>';
  try {
    const mail = { to: to.join(','), subject: 'HR Paper Mill — แจ้งปัญหา: ' + title + ' (' + row[PCOL.ID] + ')', htmlBody: html,
      body: title + '\n\n' + plain_(row[PCOL.DETAIL]) + '\n\n' + rows.map(r => r[0] + ': ' + r[1]).join('\n') + '\n\n' + site };
    if (blob) mail.attachments = [blob];
    if (row[PCOL.ROLE] === 'staff' && /@/.test(row[PCOL.REPORTER_ID])) mail.replyTo = row[PCOL.REPORTER_ID];
    MailApp.sendEmail(mail);
    return true;
  } catch (e) { console.warn('ส่งอีเมลแจ้งปัญหาไม่สำเร็จ', e); return false; }
}

function adminProblemsList_(req) {
  const rows = feedbackRows_(PROBLEM_SHEET, P_HEADERS);
  const list = rows.map((r, i) => ({
    row: i + 2, id: String(r[PCOL.ID]), ts: fbTime_(r[PCOL.TS]), role: String(r[PCOL.ROLE]), reporterId: String(r[PCOL.REPORTER_ID]), reporterName: String(r[PCOL.REPORTER_NAME]),
    contact: plain_(r[PCOL.CONTACT]), category: String(r[PCOL.CATEGORY]), title: plain_(r[PCOL.TITLE]), detail: plain_(r[PCOL.DETAIL]), page: String(r[PCOL.PAGE]),
    client: String(r[PCOL.CLIENT]), version: String(r[PCOL.VERSION]), status: String(r[PCOL.STATUS] || PROBLEM_STATUS.new), handledBy: String(r[PCOL.HANDLED_BY]),
    handledAt: fbTime_(r[PCOL.HANDLED_AT]), note: String(r[PCOL.ADMIN_NOTE]), image: String(r[PCOL.IMAGE]), verified: String(r[PCOL.VERIFIED]) !== 'ไม่'
  })).filter(p => p.id).reverse();
  const counts = {};
  Object.keys(PROBLEM_STATUS).forEach(k => { counts[k] = 0; });
  const keyOf = th => Object.keys(PROBLEM_STATUS).filter(k => PROBLEM_STATUS[k] === th)[0] || 'new';
  list.forEach(p => { p.statusKey = keyOf(p.status); counts[p.statusKey]++; });
  const limit = Math.min(Number(req.limit) || 200, 500);
  return { success: true, problems: list.slice(0, limit), total: list.length, counts: counts, statuses: PROBLEM_STATUS, recipients: fbRecipients_().length };
}

function adminProblemUpdate_(req, staff, ua) {
  const st = PROBLEM_STATUS[req.status];
  if (!st) fail_('INVALID', 'สถานะไม่ถูกต้อง');
  const sh = feedbackSheet_(PROBLEM_SHEET, P_HEADERS);
  const row = Number(req.row);
  if (!(row >= 2 && row <= sh.getLastRow()) || String(sh.getRange(row, PCOL.ID + 1).getValue()) !== String(req.id)) fail_('CONFLICT', 'ไม่พบรายการนี้ (อาจถูกแก้ไขในแผ่นงาน) กรุณาโหลดใหม่');
  sh.getRange(row, PCOL.STATUS + 1, 1, 4).setValues([[st, staff.name || staff.email, new Date(), clean_(req.note, 500)]]);
  log_(staff, 'admin.problem_status', req.id, { status: st }, ua);
  return { success: true };
}

// =====================================================================
// แบบสอบถาม
// =====================================================================
function readSurveys_() {
  return feedbackRows_(SURVEY_SHEET, V_HEADERS).map((r, i) => {
    let questions = [], target = 'all';
    try { questions = JSON.parse(r[VCOL.QUESTIONS] || '[]'); } catch (e) { questions = []; }
    const t = String(r[VCOL.TARGET] || 'all').trim();
    target = t === 'all' || !t ? 'all' : t.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    return {
      row: i + 2, id: String(r[VCOL.ID]), title: String(r[VCOL.TITLE]), intro: String(r[VCOL.INTRO]), questions: questions,
      startAt: fbTime_(toDate_(r[VCOL.START_AT])), endAt: fbTime_(toDate_(r[VCOL.END_AT])), target: target,
      status: String(r[VCOL.STATUS] || 'active'), createdBy: String(r[VCOL.CREATED_BY]), createdAt: fbTime_(r[VCOL.CREATED_AT]),
      notifiedAt: fbTime_(toDate_(r[VCOL.NOTIFIED_AT])), remindedAt: fbTime_(toDate_(r[VCOL.REMINDED_AT])), updatedAt: fbTime_(r[VCOL.UPDATED_AT])
    };
  }).filter(s => s.id);
}

// สถานะที่แสดงผล: draft (ร่าง) · scheduled (รอถึงเวลา) · open (เปิดรับ) · closed (ปิดแล้ว)
function surveyState_(s, now) {
  now = now || Date.now();
  if (s.status === 'draft') return 'draft';
  if (s.status === 'closed' || (s.endAt && s.endAt <= now)) return 'closed';
  return s.startAt && s.startAt > now ? 'scheduled' : 'open';
}
const surveyTargets_ = (s, uid) => s.target === 'all' || s.target.indexOf(String(uid).toUpperCase()) !== -1;

function surveyAnsweredSet_(surveyId) {
  const set = {};
  feedbackRows_(RESPONSE_SHEET, SR_HEADERS).forEach(r => { if (!surveyId || String(r[SRCOL.SURVEY]) === surveyId) set[String(r[SRCOL.SURVEY]) + '|' + String(r[SRCOL.USER_ID]).toUpperCase()] = true; });
  return set;
}

// แบบสอบถามที่ผู้ใช้สิทธิ์คนนี้ต้องทำตอนนี้ (เรียกตอนเข้าสู่ระบบ/หลังส่งรายงาน)
function surveyPendingFor_(userId) {
  try {
    const now = Date.now(), uid = String(userId || '').toUpperCase();
    const open = readSurveys_().filter(s => surveyState_(s, now) === 'open' && surveyTargets_(s, uid));
    if (!open.length) return [];
    const done = surveyAnsweredSet_();
    return open.filter(s => !done[s.id + '|' + uid]).map(s => ({ id: s.id, title: s.title, intro: s.intro, questions: s.questions, startAt: s.startAt, endAt: s.endAt }));
  } catch (e) { console.warn('อ่านแบบสอบถามไม่สำเร็จ', e); return []; }
}

function surveyAnswer_(req, user) {
  const s = readSurveys_().filter(x => x.id === String(req.surveyId))[0];
  if (!s || !surveyTargets_(s, user.id)) return { success: false, code: 'NOT_FOUND', message: 'ไม่พบแบบสอบถามนี้' };
  if (surveyState_(s) !== 'open') return { success: false, code: 'CLOSED', message: 'แบบสอบถามนี้ปิดรับคำตอบแล้ว ขอบคุณที่สนใจ' };
  const ans = req.answers && typeof req.answers === 'object' ? req.answers : {};
  const clean = {}, readable = [];
  for (let i = 0; i < s.questions.length; i++) {
    const q = s.questions[i], v = ans[q.id];
    let out = null;
    if (q.type === 'rating') { const n = Number(v); if (n >= 1 && n <= (q.scale || 5)) out = Math.round(n); }
    else if (q.type === 'choice') { if ((q.options || []).indexOf(String(v)) !== -1) out = String(v); }
    else { const t = clean_(v, 1500); if (t) out = t; }
    if (out === null && q.required) return { success: false, code: 'INVALID', message: 'กรุณาตอบข้อ "' + q.text + '"' };
    if (out !== null) { clean[q.id] = out; readable.push((i + 1) + '. ' + q.text + ': ' + (q.type === 'rating' ? out + '/' + (q.scale || 5) : out)); }
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (surveyAnsweredSet_(s.id)[s.id + '|' + String(user.id).toUpperCase()]) return { success: true, duplicate: true };
    const sh = feedbackSheet_(RESPONSE_SHEET, SR_HEADERS);
    const row = [new Date(), s.id, user.id, clean_(user.name, 120), JSON.stringify(clean), SURVEY_WHEN[req.when] || SURVEY_WHEN.later, fbClient_(req), clean_(readable.join('\n'), 5000)];
    sh.getRange(sh.getLastRow() + 1, 1, 1, SR_HEADERS.length).setValues([row]);
  } finally { lock.releaseLock(); }
  log_({ id: user.id, name: user.name, role: 'participant' }, 'survey.answer', s.id, { when: req.when || 'later' }, fbClient_(req));
  return { success: true };
}

// ---------- ผู้ดูแลระบบ ----------
function adminSurveysList_() {
  const now = Date.now(), surveys = readSurveys_();
  const participants = readParticipants_().filter(p => p.active);
  const responses = feedbackRows_(RESPONSE_SHEET, SR_HEADERS);
  const by = {};
  responses.forEach(r => { const k = String(r[SRCOL.SURVEY]); (by[k] = by[k] || []).push(r); });
  const list = surveys.map(s => {
    const rs = by[s.id] || [];
    const targetCount = s.target === 'all' ? participants.length : s.target.length;
    // สรุปผล: rating = ค่าเฉลี่ย + การกระจาย · choice = จำนวนต่อตัวเลือก · text = จำนวนคนตอบ
    const summary = s.questions.map(q => {
      const vals = rs.map(r => { try { return JSON.parse(r[SRCOL.ANSWERS] || '{}')[q.id]; } catch (e) { return undefined; } }).filter(v => v !== undefined && v !== null && v !== '');
      if (q.type === 'rating') {
        const dist = Array.from({ length: q.scale || 5 }, () => 0);
        vals.forEach(v => { const n = Number(v); if (n >= 1 && n <= dist.length) dist[n - 1]++; });
        const sum = vals.reduce((a, v) => a + Number(v || 0), 0);
        return { id: q.id, n: vals.length, avg: vals.length ? Math.round(sum / vals.length * 100) / 100 : null, dist: dist };
      }
      if (q.type === 'choice') { const c = {}; (q.options || []).forEach(o => { c[o] = 0; }); vals.forEach(v => { c[v] = (c[v] || 0) + 1; }); return { id: q.id, n: vals.length, counts: c }; }
      return { id: q.id, n: vals.length };
    });
    return Object.assign({}, s, { state: surveyState_(s, now), targetCount: targetCount, responses: rs.length, summary: summary });
  }).reverse();
  return { success: true, surveys: list, participants: participants.map(p => ({ id: p.id, name: p.name, site: p.site })), remindHours: surveyRemindHours_() };
}

function adminSurveyResponses_(req) {
  const s = readSurveys_().filter(x => x.id === String(req.id))[0];
  if (!s) fail_('NOT_FOUND', 'ไม่พบแบบสอบถามนี้');
  const rows = feedbackRows_(RESPONSE_SHEET, SR_HEADERS).filter(r => String(r[SRCOL.SURVEY]) === s.id);
  const responses = rows.map(r => {
    let a = {};
    try { a = JSON.parse(r[SRCOL.ANSWERS] || '{}'); } catch (e) { a = {}; }
    return { ts: fbTime_(r[SRCOL.TS]), userId: String(r[SRCOL.USER_ID]), name: String(r[SRCOL.USER_NAME]), answers: a, when: String(r[SRCOL.WHEN]), client: String(r[SRCOL.CLIENT]) };
  }).reverse();
  const answered = {};
  responses.forEach(x => { answered[x.userId.toUpperCase()] = true; });
  const pending = readParticipants_().filter(p => p.active && surveyTargets_(s, p.id) && !answered[p.id]).map(p => ({ id: p.id, name: p.name, site: p.site }));
  return { success: true, survey: s, responses: responses, pending: pending };
}

function validQuestions_(qs) {
  if (!Array.isArray(qs) || !qs.length) fail_('INVALID', 'กรุณาเพิ่มคำถามอย่างน้อย 1 ข้อ');
  if (qs.length > 20) fail_('INVALID', 'คำถามได้ไม่เกิน 20 ข้อ');
  return qs.map((q, i) => {
    const type = SURVEY_Q_TYPES.indexOf(q.type) !== -1 ? q.type : 'rating';
    const text = clean_(q.text, 200);
    if (!text) fail_('INVALID', 'คำถามข้อ ' + (i + 1) + ' ยังไม่มีข้อความ');
    const out = { id: String(q.id || ('q' + (i + 1))).replace(/[^\w-]/g, '').slice(0, 20) || ('q' + (i + 1)), type: type, text: text, required: !!q.required };
    if (type === 'rating') { out.scale = 5; out.low = clean_(q.low || 'น้อยที่สุด', 30); out.high = clean_(q.high || 'มากที่สุด', 30); }
    if (type === 'choice') {
      out.options = (Array.isArray(q.options) ? q.options : String(q.options || '').split('\n')).map(o => clean_(o, 80)).filter(Boolean).slice(0, 10);
      if (out.options.length < 2) fail_('INVALID', 'คำถามข้อ ' + (i + 1) + ' ต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก');
    }
    return out;
  }).filter((q, i, arr) => arr.findIndex(x => x.id === q.id) === i);
}

function adminSurveySave_(req, staff, ua) {
  const title = clean_(req.title, 150);
  if (!title) fail_('INVALID', 'กรุณาใส่หัวข้อแบบสอบถาม');
  const questions = validQuestions_(req.questions);
  const startAt = req.startAt ? new Date(Number(req.startAt)) : new Date();
  if (isNaN(startAt)) fail_('INVALID', 'วันเวลาเริ่มส่งไม่ถูกต้อง');
  const endAt = req.endAt ? new Date(Number(req.endAt)) : '';
  if (endAt && (isNaN(endAt) || endAt <= startAt)) fail_('INVALID', 'วันปิดรับต้องอยู่หลังวันเริ่มส่ง');
  let target = 'all';
  if (Array.isArray(req.target)) {
    const valid = {};
    readParticipants_().forEach(p => { valid[p.id] = true; });
    const ids = req.target.map(x => String(x).trim().toUpperCase()).filter(x => valid[x]);
    if (!ids.length) fail_('INVALID', 'กรุณาเลือกผู้ใช้สิทธิ์อย่างน้อย 1 คน');
    target = ids.join(',');
  }
  const status = req.draft ? 'draft' : 'active';
  const sh = feedbackSheet_(SURVEY_SHEET, V_HEADERS);
  const now = new Date();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let id;
  try {
    const existing = req.id ? readSurveys_().filter(s => s.id === String(req.id))[0] : null;
    if (req.id && !existing) fail_('NOT_FOUND', 'ไม่พบแบบสอบถามนี้ (อาจถูกลบ)');
    if (existing) {
      const answered = Object.keys(surveyAnsweredSet_(existing.id)).length;
      // มีคนตอบแล้ว: ห้ามเปลี่ยนชุดคำถาม (ผลจะเพี้ยน) แต่ยังแก้หัวข้อ/วันปิด/ผู้รับได้
      const qChanged = JSON.stringify(existing.questions.map(q => [q.id, q.type, q.options || null])) !== JSON.stringify(questions.map(q => [q.id, q.type, q.options || null]));
      if (answered && qChanged) fail_('INVALID', 'มีผู้ตอบแล้ว ' + answered + ' คน — แก้ข้อความได้ แต่เพิ่ม/ลบ/เปลี่ยนชนิดคำถามไม่ได้ (สร้างแบบสอบถามใหม่แทน)');
      id = existing.id;
      const keepNotified = existing.notifiedAt && existing.startAt === startAt.getTime();
      sh.getRange(existing.row, VCOL.TITLE + 1, 1, V_HEADERS.length - 1).setValues([[title, clean_(req.intro, 500), JSON.stringify(questions), startAt, endAt, target, status,
        existing.createdBy, existing.createdAt ? new Date(existing.createdAt) : now, keepNotified ? new Date(existing.notifiedAt) : '', keepNotified && existing.remindedAt ? new Date(existing.remindedAt) : '', now]]);
    } else {
      id = 'S' + Utilities.formatDate(now, TZ, 'yyMMdd') + '-' + Utilities.getUuid().slice(0, 4).toUpperCase();
      sh.getRange(sh.getLastRow() + 1, 1, 1, V_HEADERS.length).setValues([[id, title, clean_(req.intro, 500), JSON.stringify(questions), startAt, endAt, target, status, staff.name || staff.email, now, '', '', now]]);
    }
  } finally { lock.releaseLock(); }
  log_(staff, req.id ? 'admin.survey_update' : 'admin.survey_create', id, { title: title, startAt: startAt.toISOString(), target: target === 'all' ? 'all' : target.split(',').length + ' คน', draft: !!req.draft }, ua);
  // ถึงเวลาแล้ว (ส่งทันที): แจ้งเตือนเลย ไม่ต้องรอตัวตั้งเวลา
  let pushed = null;
  if (status === 'active' && startAt.getTime() <= Date.now() + 60000) { try { pushed = surveyTick(); } catch (e) { console.warn(e); } }
  return { success: true, id: id, pushed: pushed };
}

function adminSurveyClose_(req, staff, ua) {
  const s = readSurveys_().filter(x => x.id === String(req.id))[0];
  if (!s) fail_('NOT_FOUND', 'ไม่พบแบบสอบถามนี้');
  const sh = feedbackSheet_(SURVEY_SHEET, V_HEADERS);
  sh.getRange(s.row, VCOL.STATUS + 1).setValue(req.reopen ? 'active' : 'closed');
  if (req.reopen && s.endAt && s.endAt <= Date.now()) sh.getRange(s.row, VCOL.END_AT + 1).setValue('');
  sh.getRange(s.row, VCOL.UPDATED_AT + 1).setValue(new Date());
  log_(staff, req.reopen ? 'admin.survey_reopen' : 'admin.survey_close', s.id, { title: s.title }, ua);
  return { success: true };
}

function adminSurveyDelete_(req, staff, ua) {
  const s = readSurveys_().filter(x => x.id === String(req.id))[0];
  if (!s) fail_('NOT_FOUND', 'ไม่พบแบบสอบถามนี้');
  const n = Object.keys(surveyAnsweredSet_(s.id)).length;
  if (n) fail_('INVALID', 'มีผู้ตอบแล้ว ' + n + ' คน — ลบไม่ได้ (เก็บผลไว้) ใช้ "ปิดรับคำตอบ" แทน');
  feedbackSheet_(SURVEY_SHEET, V_HEADERS).deleteRow(s.row);
  log_(staff, 'admin.survey_delete', s.id, { title: s.title }, ua);
  return { success: true };
}

// ---------- แจ้งเตือนตามเวลา (ตัวตั้งเวลา surveyTick ทุก 15 นาที) ----------
function surveyRemindHours_() {
  const h = Number(prop_('SURVEY_REMIND_HOURS', 48));
  return isFinite(h) && h >= 6 ? h : 48;
}
function surveyTick() {
  if (typeof readNotify_ !== 'function' || typeof sendPush_ !== 'function') return null;
  const now = Date.now(), out = { started: 0, reminded: 0, sent: 0 };
  const surveys = readSurveys_().filter(s => surveyState_(s, now) === 'open');
  const due = surveys.filter(s => !s.notifiedAt || (!s.remindedAt && now - Math.max(s.startAt || 0, s.notifiedAt) >= surveyRemindHours_() * 3600000));
  if (!due.length) return out;
  const subs = readNotify_().filter(n => n.ownerType === 'user' && n.channel === 'push');
  const sh = feedbackSheet_(SURVEY_SHEET, V_HEADERS);
  due.forEach(s => {
    const first = !s.notifiedAt;
    const done = surveyAnsweredSet_(s.id);
    const targets = subs.filter(n => surveyTargets_(s, n.ownerId) && !done[s.id + '|' + String(n.ownerId).toUpperCase()]);
    const res = targets.length ? sendPush_(targets, {
      title: first ? 'แบบสอบถามใหม่: ' + s.title : 'อย่าลืมทำแบบสอบถาม',
      body: first ? 'ช่วยบอกความเห็นการใช้งานแอป ใช้เวลาไม่ถึง 1 นาที' : '"' + s.title + '" ยังรอคำตอบจากคุณ ใช้เวลาไม่ถึง 1 นาที',
      url: './#survey=' + encodeURIComponent(s.id), tag: 'survey'
    }) : { sent: 0 };
    sh.getRange(s.row, (first ? VCOL.NOTIFIED_AT : VCOL.REMINDED_AT) + 1).setValue(new Date());
    out[first ? 'started' : 'reminded']++;
    out.sent += res.sent || 0;
    log_({ id: 'system', name: 'ระบบ', role: 'system' }, first ? 'system.survey_notify' : 'system.survey_remind', s.id, { push: res.sent || 0, devices: targets.length }, '');
  });
  return out;
}

// ---------- จุดเข้าใช้งานจาก Code.gs / Staff.gs ----------
function handleFeedbackPublic_(req) {
  if (req.action === 'problem.report') return problemReportPublic_(req);
  // ที่เหลือต้องเป็นผู้ใช้สิทธิ์ที่เข้าระบบแล้ว (Code.gs ตรวจรหัสให้ก่อน)
  const user = findUser_(req.userId);
  if (!user) return { success: false, code: 'NOT_FOUND', message: 'ไม่พบรหัสผู้ใช้สิทธิ์ กรุณาเข้าสู่ระบบใหม่' };
  if (req.action === 'survey.pending') return { success: true, surveys: surveyPendingFor_(user.id) };
  if (req.action === 'survey.answer') return surveyAnswer_(req, user);
  return { success: false, message: 'ไม่รู้จักคำสั่ง: ' + req.action };
}

function handleFeedbackStaff_(req, staff, ua) {
  switch (req.action) {
    case 'staff.problem.report':
      if (staff.status === 'suspended' || staff.status === 'rejected') fail_('FORBIDDEN', 'บัญชีของคุณถูกระงับการใช้งาน');
      return problemReportStaff_(req, staff);
    case 'admin.problems.list':
      requirePerm_(staff, 'admin');
      return adminProblemsList_(req);
    case 'admin.problems.update':
      requirePerm_(staff, 'admin');
      return adminProblemUpdate_(req, staff, ua);
    case 'admin.surveys.list':
      requirePerm_(staff, 'admin');
      return adminSurveysList_();
    case 'admin.surveys.responses':
      requirePerm_(staff, 'admin');
      return adminSurveyResponses_(req);
    case 'admin.surveys.save':
      requirePerm_(staff, 'admin');
      return adminSurveySave_(req, staff, ua);
    case 'admin.surveys.close':
      requirePerm_(staff, 'admin');
      return adminSurveyClose_(req, staff, ua);
    case 'admin.surveys.delete':
      requirePerm_(staff, 'admin');
      return adminSurveyDelete_(req, staff, ua);
  }
  fail_('INVALID', 'ไม่รู้จักคำสั่ง: ' + req.action);
}
