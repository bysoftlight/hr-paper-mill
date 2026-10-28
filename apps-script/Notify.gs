// Notify.gs — การแจ้งเตือน: Web Push (เด้งบนมือถือ/คอม) และอีเมล
//
// ทำงานอย่างไร
//   - หน้าเว็บขอสิทธิ์แจ้งเตือน → ได้ "subscription" (endpoint ของ Google/Apple/Mozilla) → ส่งมาเก็บในแผ่น Notify
//   - ถึงเวลาแจ้งเตือน: เก็บข้อความไว้ในแผ่น Notify (คอลัมน์ข้อความล่าสุด) แล้วส่ง push "เปล่า" ไปที่ endpoint
//     service worker (sw.js) ของเว็บตื่นขึ้นมา ดึงข้อความด้วย notify.inbox แล้วแสดงบนเครื่อง
//     (Apps Script เข้ารหัสเนื้อหา push แบบ aes128gcm ไม่ได้ จึงส่งแบบไม่มีเนื้อหาแล้วให้เครื่องดึงเอง)
//   - push service ต้องการลายเซ็น VAPID (ECDSA P-256) — Apps Script ไม่มีให้ จึงคำนวณเองด้านล่าง
//     กุญแจสร้างอัตโนมัติครั้งแรก (Script Properties: VAPID_PRIVATE / VAPID_PUBLIC) — ห้ามแก้หรือลบ
//     ถ้าลบ ทุกเครื่องต้องเปิดการแจ้งเตือนใหม่
//
// ตั้งเวลา: รัน installNotifyTriggers() หนึ่งครั้ง
//   - เตือนผู้ใช้สิทธิ์ที่ยังไม่ส่งรายงาน ทุกวันเวลา NOTIFY_REMIND_HOUR (ค่าเริ่มต้น 17 = 17:00 น.)
//   - สรุปประจำวันให้เจ้าหน้าที่ (push + อีเมล) ทุกวัน 18:00 น. (รวมกับ SUMMARY_EMAILS เดิม)

const NCOL = { ID: 0, OWNER_TYPE: 1, OWNER_ID: 2, CHANNEL: 3, ENDPOINT: 4, TOPICS: 5, DEVICE: 6, CREATED_AT: 7, LAST_SENT: 8, FAILS: 9, MESSAGE: 10 };
const N_HEADERS = ['ID', 'ประเภท', 'เจ้าของ (รหัส)', 'ช่องทาง', 'ปลายทาง', 'หัวข้อ', 'อุปกรณ์', 'สร้างเมื่อ', 'ส่งล่าสุด', 'ส่งไม่สำเร็จ', 'ข้อความล่าสุด'];
const NOTIFY_SHEET = 'Notify';
const NOTIFY_TOPICS = { user: ['remind'], staff: ['new', 'summary'] };
const DEFAULT_REMIND_HOUR = 17;
const SITE_URL = 'https://bysoftlight.github.io/hr-paper-mill/';

function notifySheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(NOTIFY_SHEET);
  if (!sh) {
    sh = ss.insertSheet(NOTIFY_SHEET);
    sh.getRange(1, 1, 1, N_HEADERS.length).setValues([N_HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readNotify_() {
  const sh = notifySheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, N_HEADERS.length).getValues().map((r, i) => ({
    row: i + 2, id: String(r[NCOL.ID]), ownerType: String(r[NCOL.OWNER_TYPE]), ownerId: String(r[NCOL.OWNER_ID]),
    channel: String(r[NCOL.CHANNEL]), endpoint: String(r[NCOL.ENDPOINT]),
    topics: String(r[NCOL.TOPICS] || '').split(',').filter(Boolean), device: String(r[NCOL.DEVICE] || ''),
    fails: Number(r[NCOL.FAILS]) || 0, message: String(r[NCOL.MESSAGE] || '')
  })).filter(n => n.endpoint);
}

function remindHour_() {
  const h = Number(prop_('NOTIFY_REMIND_HOUR', DEFAULT_REMIND_HOUR));
  return isFinite(h) && h >= 6 && h <= 22 ? Math.floor(h) : DEFAULT_REMIND_HOUR;
}

function validPushEndpoint_(url) {
  return /^https:\/\/[a-z0-9.-]+\.(googleapis\.com|push\.apple\.com|mozilla\.com|mozaws\.net|notify\.windows\.com)\//i.test(String(url || '')) && String(url).length < 1000;
}

// ---------- คำสั่งจากหน้าเว็บ ----------
// owner = { type: 'user' | 'staff', id, email? } (ตรวจตัวตนแล้วจากผู้เรียก)
function handleNotifyRequest_(req, owner) {
  switch (req.action) {
    case 'notify.config':
    case 'staff.notify.config': {
      const out = { success: true, publicKey: vapidKeys_().publicKey, remindHour: remindHour_(), summaryHour: 18 };
      if (owner) {
        const mine = readNotify_().filter(n => n.ownerType === owner.type && n.ownerId === owner.id);
        const dev = mine.filter(n => n.channel === 'push' && n.endpoint === req.endpoint)[0];
        out.device = dev ? { topics: dev.topics } : null;
        out.devices = mine.filter(n => n.channel === 'push').length;
        if (owner.type === 'staff') {
          const mail = mine.filter(n => n.channel === 'email')[0];
          out.email = owner.email || '';
          out.emailTopics = mail ? mail.topics : [];
        }
      }
      return out;
    }
    case 'notify.subscribe':
    case 'staff.notify.subscribe':
      return notifySubscribe_(req, owner);
    case 'notify.unsubscribe':
    case 'staff.notify.unsubscribe':
      return notifyUnsubscribe_(req.endpoint);
    case 'notify.test':
    case 'staff.notify.test':
      return notifyTest_(req.endpoint, owner);
    case 'staff.notify.email':
      return notifyEmail_(req, owner);
  }
  return { success: false, message: 'ไม่รู้จักคำสั่ง: ' + req.action };
}

function notifySubscribe_(req, owner) {
  if (!validPushEndpoint_(req.endpoint)) return { success: false, message: 'ข้อมูลการแจ้งเตือนจากเบราว์เซอร์ไม่ถูกต้อง' };
  const allowed = NOTIFY_TOPICS[owner.type];
  const topics = (Array.isArray(req.topics) ? req.topics : allowed).filter(t => allowed.indexOf(t) !== -1);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = notifySheet_();
    const existing = readNotify_().filter(n => n.channel === 'push' && n.endpoint === req.endpoint)[0];
    const device = clean_(req.device, 80);
    if (existing) {
      // เครื่องเดิม (อาจเปลี่ยนบัญชี): ผูกกับเจ้าของปัจจุบัน
      sh.getRange(existing.row, NCOL.OWNER_TYPE + 1, 1, 6).setValues([[owner.type, owner.id, 'push', req.endpoint, topics.join(','), device]]);
      sh.getRange(existing.row, NCOL.FAILS + 1).setValue(0);
    } else {
      sh.appendRow([Utilities.getUuid(), owner.type, owner.id, 'push', req.endpoint, topics.join(','), device, new Date(), '', 0, '']);
    }
  } finally {
    lock.releaseLock();
  }
  return { success: true, topics: topics };
}

function notifyUnsubscribe_(endpoint) {
  const rows = readNotify_().filter(n => n.channel === 'push' && n.endpoint === endpoint);
  const sh = notifySheet_();
  rows.reverse().forEach(n => sh.deleteRow(n.row));
  return { success: true };
}

function notifyEmail_(req, owner) {
  if (!owner.email) return { success: false, message: 'บัญชีนี้ไม่มีอีเมล (เข้าสู่ระบบด้วย LINE) — ใช้การแจ้งเตือนบนเครื่องแทน' };
  const topics = (req.topics || []).filter(t => t === 'summary');
  const sh = notifySheet_();
  const mine = readNotify_().filter(n => n.ownerType === 'staff' && n.ownerId === owner.id && n.channel === 'email');
  mine.reverse().forEach(n => sh.deleteRow(n.row));
  if (topics.length) sh.appendRow([Utilities.getUuid(), 'staff', owner.id, 'email', owner.email, topics.join(','), '', new Date(), '', 0, '']);
  return { success: true, emailTopics: topics };
}

function notifyTest_(endpoint, owner) {
  const sub = readNotify_().filter(n => n.channel === 'push' && n.endpoint === endpoint && n.ownerId === owner.id)[0];
  if (!sub) return { success: false, message: 'เครื่องนี้ยังไม่ได้เปิดการแจ้งเตือน' };
  const res = sendPush_([sub], { title: 'ทดสอบการแจ้งเตือน', body: 'การแจ้งเตือนของ HR Paper Mill ใช้งานได้แล้ว', url: owner.type === 'staff' ? 'staff.html' : './', tag: 'test' });
  return res.sent ? { success: true } : { success: false, message: 'ส่งไม่สำเร็จ' + (res.lastError ? ' (' + res.lastError + ')' : '') + ' — ลองปิดแล้วเปิดการแจ้งเตือนใหม่' };
}

// service worker ดึงข้อความล่าสุดของเครื่องตัวเอง (endpoint เป็นความลับเฉพาะเครื่อง)
function notifyInbox_(endpoint) {
  const sub = readNotify_().filter(n => n.channel === 'push' && n.endpoint === endpoint)[0];
  if (!sub || !sub.message) return { success: true, message: null };
  try { return { success: true, message: JSON.parse(sub.message) }; } catch (e) { return { success: true, message: null }; }
}

// ---------- ส่ง ----------
// msg = { title, body, url, tag }
function sendPush_(subs, msg) {
  const out = { sent: 0, failed: 0, removed: 0, lastError: '' };
  if (!subs.length) return out;
  const sh = notifySheet_();
  const now = new Date();
  const json = JSON.stringify(Object.assign({ at: now.getTime() }, msg));
  // เก็บข้อความไว้ก่อน แล้วค่อยปลุกเครื่อง
  subs.forEach(s => sh.getRange(s.row, NCOL.MESSAGE + 1).setValue(json));
  SpreadsheetApp.flush && SpreadsheetApp.flush();
  const requests = subs.map(s => ({
    url: s.endpoint, method: 'post', muteHttpExceptions: true, payload: '',
    headers: { TTL: '43200', Urgency: 'high', Topic: String(msg.tag || 'hrpm').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'hrpm', Authorization: vapidAuthHeader_(s.endpoint) }
  }));
  let responses;
  try { responses = UrlFetchApp.fetchAll(requests); } catch (e) { out.failed = subs.length; out.lastError = String(e).slice(0, 120); return out; }
  const gone = [];
  responses.forEach((r, i) => {
    const code = r.getResponseCode(), s = subs[i];
    if (code >= 200 && code < 300) {
      out.sent++;
      sh.getRange(s.row, NCOL.LAST_SENT + 1, 1, 2).setValues([[now, 0]]);
    } else if (code === 404 || code === 410 || s.fails >= 4) {
      gone.push(s.row); // เครื่องยกเลิก/ลบแอปแล้ว หรือส่งไม่สำเร็จติดกันหลายครั้ง
    } else {
      out.failed++;
      out.lastError = 'HTTP ' + code;
      sh.getRange(s.row, NCOL.FAILS + 1).setValue(s.fails + 1);
    }
  });
  gone.sort((a, b) => b - a).forEach(row => sh.deleteRow(row));
  out.removed = gone.length;
  return out;
}

// เตือนผู้ใช้สิทธิ์ที่เปิดการแจ้งเตือนไว้ แต่ยังไม่ส่งรายงานวันนี้ (เรียกจากตัวตั้งเวลา)
function sendDailyReminders() {
  const o = staffOverview_();
  const missing = {};
  o.missing.forEach(m => { missing[m.id] = m; });
  const subs = readNotify_().filter(n => n.ownerType === 'user' && n.channel === 'push' && n.topics.indexOf('remind') !== -1 && missing[n.ownerId]);
  const res = sendPush_(subs, { title: 'ยังไม่ได้ส่งรายงานวันนี้', body: 'อย่าลืมส่งรายงานการขายประจำวัน แตะเพื่อเปิดแอปแล้วส่งได้เลย', url: './', tag: 'remind' });
  log_({ id: 'system', name: 'ระบบ', role: 'system' }, 'system.notify_remind', o.today, { missing: o.missing.length, sent: res.sent, failed: res.failed, removed: res.removed }, '');
  return res;
}

// สรุปประจำวันให้เจ้าหน้าที่ (push + อีเมล) และอีเมล SUMMARY_EMAILS เดิม
function sendDailySummary() {
  const o = staffOverview_();
  const head = 'ส่งแล้ว ' + o.kpi.reportedToday + '/' + o.kpi.participants + ' คน · ยังไม่ส่ง ' + o.kpi.missingToday + ' คน';
  const lines = [
    'สรุปการส่งรายงาน ' + o.today,
    head,
    'ขายโดยตัวแทนวันนี้ ' + o.kpi.agentToday + ' · ตำแหน่งผิดปกติ ' + o.kpi.anomaliesToday + ' · ไม่มี GPS ' + o.kpi.nogpsToday,
    '',
    'ยังไม่ส่งรายงาน:',
  ].concat(o.missing.map(m => '- ' + m.id + ' ' + m.name + (m.site ? ' (' + m.site + ')' : '') + (m.phone ? ' โทร ' + m.phone : '')));
  if (o.agentWatch.length) {
    lines.push('', 'เฝ้าระวังขายโดยตัวแทน (เดือนนี้):');
    o.agentWatch.forEach(a => lines.push('- ' + a.id + ' ' + a.name + ' ' + a.used + '/' + a.limit + ' ครั้ง'));
  }
  lines.push('', 'เปิด Dashboard: ' + SITE_URL + 'staff.html');
  const subject = 'HR Paper Mill — สรุปรายงานวันที่ ' + o.today;

  const subs = readNotify_().filter(n => n.ownerType === 'staff' && n.topics.indexOf('summary') !== -1 && activeStaffIds_()[n.ownerId]);
  const emails = {};
  String(prop_('SUMMARY_EMAILS')).split(',').map(s => s.trim()).filter(Boolean).forEach(e => { emails[e.toLowerCase()] = e; });
  subs.filter(n => n.channel === 'email').forEach(n => { emails[n.endpoint.toLowerCase()] = n.endpoint; });
  Object.keys(emails).forEach(k => {
    try { MailApp.sendEmail(emails[k], subject, lines.join('\n')); } catch (e) { console.warn('ส่งอีเมลไม่สำเร็จ', emails[k], e); }
  });
  const res = sendPush_(subs.filter(n => n.channel === 'push'), { title: 'สรุปรายงานวันนี้', body: head + (o.kpi.anomaliesToday ? ' · ตำแหน่งผิดปกติ ' + o.kpi.anomaliesToday : ''), url: 'staff.html#overview', tag: 'summary' });
  log_({ id: 'system', name: 'ระบบ', role: 'system' }, 'system.daily_summary', Object.keys(emails).length + ' อีเมล', { reported: o.kpi.reportedToday, missing: o.kpi.missingToday, push: res.sent }, '');
}

// แจ้งเจ้าหน้าที่ที่เลือก "รายงานใหม่" ทันทีที่ผู้ใช้สิทธิ์ส่งรายงาน (ไม่ให้ความผิดพลาดกระทบการส่งรายงาน)
function notifyNewRecord_(user, type, time) {
  try {
    const subs = readNotify_().filter(n => n.ownerType === 'staff' && n.channel === 'push' && n.topics.indexOf('new') !== -1 && activeStaffIds_()[n.ownerId]);
    if (!subs.length) return;
    sendPush_(subs, { title: user.name + ' ส่งรายงานแล้ว', body: user.id + ' · ' + type + ' · ' + time + ' น.', url: 'staff.html#records', tag: 'new' });
  } catch (e) {
    console.warn('แจ้งเตือนรายงานใหม่ไม่สำเร็จ', e);
  }
}

let ACTIVE_STAFF_IDS_ = null;
function activeStaffIds_() {
  if (!ACTIVE_STAFF_IDS_) {
    ACTIVE_STAFF_IDS_ = {};
    readStaff_().forEach(s => { if (s.status === 'active' && (s.permissions || []).indexOf('records.view') !== -1) ACTIVE_STAFF_IDS_[s.id] = true; });
  }
  return ACTIVE_STAFF_IDS_;
}

function installNotifyTriggers() {
  const handlers = ['sendDailyReminders', 'sendDailySummary'];
  ScriptApp.getProjectTriggers().filter(t => handlers.indexOf(t.getHandlerFunction()) !== -1).forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendDailyReminders').timeBased().everyDays(1).atHour(remindHour_()).inTimezone(TZ).create();
  ScriptApp.newTrigger('sendDailySummary').timeBased().everyDays(1).atHour(18).inTimezone(TZ).create();
  vapidKeys_();
  notifySheet_();
  Logger.log('ตั้งเวลาแล้ว: เตือนผู้ใช้สิทธิ์ ' + remindHour_() + ':00 น. · สรุปเจ้าหน้าที่ 18:00 น.');
}

// ---------- VAPID (RFC 8292): JWT ES256 ----------
function vapidKeys_() {
  const props = PropertiesService.getScriptProperties();
  let priv = props.getProperty('VAPID_PRIVATE'), pub = props.getProperty('VAPID_PUBLIC');
  if (!priv || !pub) {
    // สุ่มกุญแจลับจาก UUID หลายชุด (สุ่มด้วยระบบของ Google) แล้วย่อด้วย SHA-256
    let d = 0n;
    while (d <= 0n || d >= P256_.n) d = bytesToBig_(sha256_(Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid() + Date.now()));
    const Q = ecMul_(d, P256_.G);
    priv = vb64_(bigToBytes_(d, 32));
    pub = vb64_([4].concat(bigToBytes_(Q[0], 32), bigToBytes_(Q[1], 32)));
    props.setProperty('VAPID_PRIVATE', priv);
    props.setProperty('VAPID_PUBLIC', pub);
  }
  return { privateKey: priv, publicKey: pub };
}

function vapidAuthHeader_(endpoint) {
  const aud = String(endpoint).match(/^https:\/\/[^/]+/)[0];
  const cache = CacheService.getScriptCache();
  const keys = vapidKeys_();
  const ckey = 'vapid:' + aud + ':' + keys.publicKey.slice(0, 12);
  let jwt = cache.get(ckey);
  if (!jwt) {
    const header = vb64_(utf8_(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const claims = vb64_(utf8_(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:' + (prop_('ADMIN_EMAILS').split(',')[0].trim() || 'admin@example.com') })));
    const input = header + '.' + claims;
    jwt = input + '.' + vb64_(ecdsaSign_(input, bytesToBig_(fromB64url_(keys.privateKey))));
    cache.put(ckey, jwt, 6 * 3600); // ใช้ซ้ำได้ (ลายเซ็นมีอายุ 12 ชม.)
  }
  return 'vapid t=' + jwt + ', k=' + keys.publicKey;
}

// --- P-256 ด้วย BigInt (พิกัดแบบ Jacobian) ---
const P256_ = {
  p: 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn,
  n: 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n,
  a: -3n,
  G: [0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n, 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n]
};
function mod_(a, m) { const r = a % m; return r < 0n ? r + m : r; }
function modInv_(a, m) {
  let [r0, r1] = [mod_(a, m), m], [s0, s1] = [1n, 0n];
  while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; }
  return mod_(s0, m);
}
function jDouble_(P) {
  const p = P256_.p, [X, Y, Z] = P;
  if (!Y || !Z) return [0n, 1n, 0n];
  const YY = mod_(Y * Y, p), S = mod_(4n * X * YY, p), ZZ = mod_(Z * Z, p);
  const M = mod_(3n * (X - ZZ) * (X + ZZ), p); // a = -3
  const X3 = mod_(M * M - 2n * S, p);
  return [X3, mod_(M * (S - X3) - 8n * YY * YY, p), mod_(2n * Y * Z, p)];
}
function jAdd_(P, Q) {
  const p = P256_.p;
  if (!P[2]) return Q;
  if (!Q[2]) return P;
  const Z1Z1 = mod_(P[2] * P[2], p), Z2Z2 = mod_(Q[2] * Q[2], p);
  const U1 = mod_(P[0] * Z2Z2, p), U2 = mod_(Q[0] * Z1Z1, p);
  const S1 = mod_(P[1] * Q[2] * Z2Z2, p), S2 = mod_(Q[1] * P[2] * Z1Z1, p);
  if (U1 === U2) return S1 === S2 ? jDouble_(P) : [0n, 1n, 0n];
  const H = mod_(U2 - U1, p), R = mod_(S2 - S1, p), HH = mod_(H * H, p), HHH = mod_(H * HH, p), V = mod_(U1 * HH, p);
  const X3 = mod_(R * R - HHH - 2n * V, p);
  return [X3, mod_(R * (V - X3) - S1 * HHH, p), mod_(P[2] * Q[2] * H, p)];
}
function ecMul_(k, G) {
  let R = [0n, 1n, 0n], A = [G[0], G[1], 1n];
  while (k > 0n) { if (k & 1n) R = jAdd_(R, A); A = jDouble_(A); k >>= 1n; }
  const zi = modInv_(R[2], P256_.p), zi2 = mod_(zi * zi, P256_.p);
  return [mod_(R[0] * zi2, P256_.p), mod_(R[1] * zi2 * zi, P256_.p)];
}
// ECDSA แบบ k กำหนดแน่นอน (RFC 6979) — ไม่พึ่งตัวสุ่ม
function ecdsaSign_(message, d) {
  const n = P256_.n, h1 = sha256_(utf8_(message)), z = mod_(bytesToBig_(h1), n);
  const x = bigToBytes_(d, 32), h = bigToBytes_(z, 32);
  let V = new Array(32).fill(1), K = new Array(32).fill(0);
  K = hmac_(K, V.concat([0], x, h)); V = hmac_(K, V);
  K = hmac_(K, V.concat([1], x, h)); V = hmac_(K, V);
  for (;;) {
    V = hmac_(K, V);
    const k = bytesToBig_(V);
    if (k > 0n && k < n) {
      const r = mod_(ecMul_(k, P256_.G)[0], n);
      const s = mod_(modInv_(k, n) * (z + r * d), n);
      if (r && s) return bigToBytes_(r, 32).concat(bigToBytes_(s, 32));
    }
    K = hmac_(K, V.concat([0])); V = hmac_(K, V);
  }
}

// --- ไบต์ / base64url / แฮช ---
function u8_(bytes) { return bytes.map(b => (b + 256) % 256); }       // Apps Script คืนไบต์แบบมีเครื่องหมาย (-128..127)
function s8_(bytes) { return bytes.map(b => (b > 127 ? b - 256 : b)); }
function utf8_(s) { return u8_(Utilities.newBlob(s).getBytes()); }
function sha256_(v) { return u8_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, typeof v === 'string' ? v : s8_(v))); }
function hmac_(key, data) { return u8_(Utilities.computeHmacSha256Signature(s8_(data), s8_(key))); }
function vb64_(bytes) { return Utilities.base64EncodeWebSafe(s8_(bytes)).replace(/=+$/, ''); }
function fromB64url_(s) { return u8_(Utilities.base64DecodeWebSafe(s + '==='.slice((s.length + 3) % 4))); }
function bytesToBig_(bytes) { return bytes.reduce((a, b) => (a << 8n) + BigInt(b), 0n); }
function bigToBytes_(x, len) { const out = []; for (let i = 0; i < len; i++) { out.unshift(Number(x & 255n)); x >>= 8n; } return out; }
