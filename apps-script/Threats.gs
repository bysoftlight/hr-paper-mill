// HR Paper Mill — ตรวจจับพฤติกรรมเสี่ยง ติดป้าย "ผู้ต้องสงสัย" และแจ้งเตือนอีเมลผู้ดูแลระบบ
// แหล่งข้อมูล: ระบบป้องกันการเดารหัส (Code.gs: guard*) และสถิติการใช้งาน (Analytics.gs)
// บันทึกในแผ่นงาน Threats (สร้างให้อัตโนมัติ) · ระดับ critical/high ส่งอีเมลถึง ADMIN_EMAILS ทันที
//   (เหตุการณ์เดิมจากเครื่องเดิมแจ้งครั้งเดียวต่อชั่วโมง · ประเภทเดียวกันส่งอีเมลไม่เกินทุก 10 นาที · ไม่เกิน 30 ฉบับ/วัน)
// ผู้ดูแลระบบดู/ตรวจแล้ว/บล็อกเครื่องได้ที่หน้า Staff › ผู้ดูแลระบบ › ความปลอดภัย
// บล็อกเครื่อง = เครื่องนั้นใช้หน้าผู้ใช้สิทธิ์ไม่ได้ (เก็บใน Script Properties: GUARD_BLOCKS)

const THREAT_SHEET = 'Threats';
const T_HEADERS = ['เวลา', 'ระดับ', 'ประเภท', 'รายละเอียด', 'เครื่อง', 'รหัสผู้ใช้สิทธิ์', 'อุปกรณ์', 'สถานะ', 'จัดการโดย', 'รหัสประเภท'];
const TC = { TS: 0, LEVEL: 1, LABEL: 2, DETAIL: 3, DEVICE: 4, USER: 5, CLIENT: 6, STATUS: 7, BY: 8, TYPE: 9 };
const THREAT_LEVELS = { critical: 'วิกฤต', high: 'สูง', medium: 'ปานกลาง' };
const THREAT_TYPES = {
  sequential_guess: { label: 'ไล่เดารหัสเรียงลำดับ', level: 'critical', tip: 'มีคนไล่ลองรหัสผู้ใช้สิทธิ์ทีละหมายเลข ควรบล็อกเครื่องนี้ และพิจารณาออกรหัสแบบสุ่มที่เดายาก' },
  guessed_success: { label: 'เครื่องที่เคยเดารหัส เข้าระบบสำเร็จ', level: 'critical', tip: 'รหัสนี้อาจถูกเดาได้ ควรติดต่อเจ้าของรหัส ตรวจรายงานล่าสุด และเปลี่ยนรหัสผู้ใช้สิทธิ์ (หน้า Staff › ผู้ใช้สิทธิ์ › แก้ไข)' },
  shield: { label: 'เปิดโหมดป้องกันทั้งระบบ', level: 'critical', tip: 'มีการกรอกรหัสผิดจำนวนมากจากหลายเครื่อง ระบบเปิดโหมดป้องกันให้อัตโนมัติแล้ว' },
  enumeration: { label: 'ลองรหัสผู้ใช้สิทธิ์หลายรหัส', level: 'high', tip: 'เครื่องเดียวลองหลายรหัสในเวลาสั้นๆ' },
  device_locked: { label: 'เครื่องถูกล็อก (กรอกรหัสผิดบ่อย)', level: 'high', tip: 'ระบบล็อกเครื่องนี้ชั่วคราวแล้ว ถ้ายังกลับมาอีกควรบล็อก' },
  bot_activity: { label: 'ใช้งานถี่ผิดปกติ (อาจเป็นบอท)', level: 'high', tip: 'มีการกระทำจำนวนมากในเวลาสั้นเกินกว่าคนทั่วไป' },
  analytics_flood: { label: 'ส่งข้อมูลท่วมระบบ', level: 'high', tip: 'เครื่องนี้ส่งข้อมูลสถิติเกินขีดจำกัด อาจมีการยิงคำขออัตโนมัติ' },
  blocked_attempt: { label: 'เครื่องที่ถูกบล็อกพยายามเข้าใช้', level: 'medium', tip: 'เครื่องที่ถูกบล็อกยังพยายามใช้งาน' },
  shared_account: { label: 'รหัสเดียวเข้าจากหลายเครื่อง', level: 'medium', tip: 'อาจมีการแชร์รหัสหรือรหัสรั่วไหล ควรสอบถามเจ้าของรหัส' },
  error_burst: { label: 'หน้าเว็บผิดพลาดซ้ำๆ', level: 'medium', tip: 'อาจมีการพยายามป้อนข้อมูลผิดรูปแบบ หรือเครื่องมีปัญหา' },
  submit_fail_burst: { label: 'ส่งรายงานไม่สำเร็จซ้ำๆ', level: 'medium', tip: 'อาจพยายามส่งข้อมูลปลอม/ซ้ำ หรือมีปัญหาการใช้งานจริง' }
};

function threatSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(THREAT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(THREAT_SHEET);
    sh.getRange(1, 1, 1, T_HEADERS.length).setValues([T_HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// "macOS · Edge" จาก user agent (ไม่เก็บ user agent เต็ม)
function uaSummary_(ua) {
  ua = String(ua || '');
  if (!ua) return '';
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : /curl|python|wget|node|axios|go-http|java/i.test(ua) ? 'สคริปต์/บอท' : 'อื่นๆ';
  const br = / Line\//.test(ua) ? 'LINE' : /FBAN|FBAV|Instagram/.test(ua) ? 'Facebook/IG' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Edg\//.test(ua) ? 'Edge'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /curl|python|wget|node|axios|go-http|java/i.test(ua) ? ua.split(/[\/ ]/)[0].slice(0, 20) : 'อื่นๆ';
  const dev = /iPad|Tablet/.test(ua) ? 'แท็บเล็ต' : /Mobi|iPhone|Android/.test(ua) ? 'มือถือ' : 'คอมพิวเตอร์';
  return [dev, os, br].join(' · ');
}

// ติดป้ายผู้ต้องสงสัย: type ตาม THREAT_TYPES · key = เครื่อง/รหัส ใช้กันแจ้งซ้ำ (ชั่วโมงละครั้ง)
// info: { device, userId, client, detail }
function threat_(type, key, info) {
  const t = THREAT_TYPES[type];
  if (!t) return false;
  const c = CacheService.getScriptCache(), dk = 'th:' + type + ':' + String(key || '').slice(0, 60);
  if (c.get(dk)) return false;
  c.put(dk, '1', 3600);
  info = info || {};
  const row = [new Date(), THREAT_LEVELS[t.level], t.label, clean_(info.detail, 500), clean_(info.device, 40), clean_(info.userId, 20), clean_(info.client, 80), 'ใหม่', '', type];
  try {
    const lock = LockService.getScriptLock();
    if (lock.tryLock(5000)) {
      try { const sh = threatSheet_(); sh.getRange(sh.getLastRow() + 1, 1, 1, T_HEADERS.length).setValues([row]); } finally { lock.releaseLock(); }
    }
  } catch (e) { console.warn('บันทึก Threats ไม่สำเร็จ', e); }
  if (t.level === 'critical' || t.level === 'high') threatEmail_(type, t, info);
  return true;
}

function threatEmail_(type, t, info) {
  const c = CacheService.getScriptCache();
  if (c.get('thm:' + type)) return; // ประเภทเดียวกันไม่เกินทุก 10 นาที
  const props = PropertiesService.getScriptProperties(), dayKey = 'THREAT_MAILS_' + fmtDate_(new Date());
  const n = Number(props.getProperty(dayKey) || 0);
  if (n >= 30) return;
  const to = String(prop_('ADMIN_EMAILS') || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!to.length) return;
  c.put('thm:' + type, '1', 600);
  props.setProperty(dayKey, String(n + 1));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const color = t.level === 'critical' ? '#B3261E' : '#7A5900';
  const rows = [['ระดับ', THREAT_LEVELS[t.level]], ['เวลา', Utilities.formatDate(new Date(), TZ, 'd MMM yyyy HH:mm:ss')], ['รายละเอียด', info.detail],
    ['เครื่อง', info.device], ['รหัสผู้ใช้สิทธิ์', info.userId], ['อุปกรณ์', info.client]].filter(r => r[1]);
  const site = (typeof SITE_URL === 'string' ? SITE_URL : 'https://bysoftlight.github.io/hr-paper-mill/') + 'staff.html#admin';
  const html = '<div style="font-family:Arial,sans-serif;max-width:560px">' +
    '<p style="margin:0 0 4px;color:' + color + ';font-weight:bold">⚠️ พบพฤติกรรมเสี่ยง (' + THREAT_LEVELS[t.level] + ')</p>' +
    '<h2 style="margin:0 0 12px;font-weight:500">' + esc(t.label) + '</h2>' +
    '<table style="border-collapse:collapse;font-size:14px">' + rows.map(r => '<tr><td style="padding:4px 12px 4px 0;color:#5F6368;vertical-align:top">' + r[0] + '</td><td style="padding:4px 0">' + esc(r[1]) + '</td></tr>').join('') + '</table>' +
    '<p style="margin:16px 0;padding:12px 14px;background:#F0F4F9;border-radius:12px;font-size:14px">' + esc(t.tip) + '</p>' +
    '<p><a href="' + site + '" style="display:inline-block;padding:10px 18px;background:#0850D1;color:#fff;border-radius:999px;text-decoration:none">เปิดหน้าความปลอดภัย</a></p>' +
    '<p style="font-size:12px;color:#5F6368">ดูทั้งหมดได้ในแผ่นงาน Threats · บล็อกเครื่องได้ที่หน้า Staff › ผู้ดูแลระบบ › ความปลอดภัย</p></div>';
  try {
    MailApp.sendEmail({ to: to.join(','), subject: 'HR Paper Mill — ⚠️ ' + t.label + (info.userId ? ' (' + info.userId + ')' : ''), htmlBody: html,
      body: t.label + '\n' + rows.map(r => r[0] + ': ' + r[1]).join('\n') + '\n\n' + t.tip + '\n' + site });
  } catch (e) { console.warn('ส่งอีเมลแจ้งเตือนไม่สำเร็จ', e); }
}

// ---------- กฎตรวจจับ (เรียกจาก Code.gs / Analytics.gs) ----------
// รหัสที่เครื่องหนึ่งลองแล้วไม่พบ: ลองหลายรหัส / เรียงหมายเลขกัน
function threatOnFail_(dev, id, client) {
  const c = CacheService.getScriptCache(), k = 'th:ids:' + dev;
  const ids = (c.get(k) || '').split(',').filter(Boolean);
  if (ids.indexOf(id) === -1) ids.push(id);
  c.put(k, ids.slice(-20).join(','), 1800);
  if (ids.length >= 5) threat_('enumeration', dev, { device: dev, client, userId: id, detail: 'ลอง ' + ids.length + ' รหัสที่ไม่มีในระบบภายใน 30 นาที: ' + ids.slice(-10).join(', ') });
  // เรียงลำดับ: ส่วนหน้าเหมือนกัน เลขท้ายต่อกันอย่างน้อย 3 รหัส (เช่น 69BB01, 69BB02, 69BB03)
  const groups = {};
  ids.forEach(x => { const m = String(x).match(/^(.*?)(\d+)$/); if (m) (groups[m[1]] = groups[m[1]] || []).push(Number(m[2])); });
  Object.keys(groups).forEach(prefix => {
    const nums = groups[prefix].sort((a, b) => a - b);
    let run = 1, best = 1;
    for (let i = 1; i < nums.length; i++) { run = nums[i] - nums[i - 1] <= 2 ? run + 1 : 1; best = Math.max(best, run); }
    if (best >= 3) threat_('sequential_guess', dev, { device: dev, client, userId: id, detail: 'ไล่ลองรหัส ' + prefix + '… เรียงหมายเลข ' + best + ' รหัสติดกัน: ' + ids.filter(x => String(x).indexOf(prefix) === 0).slice(-10).join(', ') });
  });
}
// เข้าระบบสำเร็จ: เครื่องนี้เพิ่งเดารหัสผิดหลายครั้ง? รหัสนี้ถูกใช้จากหลายเครื่อง?
function threatOnLogin_(dev, id, fails, client) {
  const c = CacheService.getScriptCache();
  if (fails >= 3) threat_('guessed_success', dev + ':' + id, { device: dev, client, userId: id, detail: 'เครื่องนี้กรอกรหัสที่ไม่มีในระบบ ' + fails + ' ครั้ง แล้วเข้าระบบสำเร็จด้วยรหัส ' + id + ' (ลองล่าสุด: ' + ((c.get('th:ids:' + dev) || '').split(',').slice(-5).join(', ')) + ')' });
  if (dev === 'anon') return;
  const k = 'th:ud:' + id, devs = (c.get(k) || '').split(',').filter(Boolean);
  if (devs.indexOf(dev) === -1) devs.push(dev);
  c.put(k, devs.slice(-10).join(','), 21600);
  if (devs.length >= 4) threat_('shared_account', id, { device: dev, client, userId: id, detail: 'รหัส ' + id + ' เข้าระบบจาก ' + devs.length + ' เครื่องภายใน 6 ชั่วโมง' });
}
// สถิติการใช้งาน: ถี่ผิดปกติ / ผิดพลาดซ้ำ / ส่งรายงานไม่สำเร็จซ้ำ
function threatOnAnalytics_(ctx, events, throttled) {
  const c = CacheService.getScriptCache(), vid = ctx.vid, now = Date.now();
  const client = [ctx.device === 'mobile' ? 'มือถือ' : ctx.device === 'tablet' ? 'แท็บเล็ต' : 'คอมพิวเตอร์', ctx.os, ctx.browser, ctx.screen ? ctx.screen + 'px' : ''].filter(Boolean).join(' · ');
  const dev = ctx.did || vid;
  if (throttled) return threat_('analytics_flood', vid, { device: dev, client, detail: 'ส่งข้อมูลสถิติเกินขีดจำกัด (แอป ' + ctx.app + ')' });
  const bump = (k, n, ttl) => { const v = Number(c.get(k) || 0) + n; c.put(k, String(v), ttl); return v; };
  const total = bump('th:ev:' + vid + ':' + Math.floor(now / 300000), events.length, 400);
  if (total > 150) threat_('bot_activity', vid, { device: dev, client, detail: total + ' เหตุการณ์ใน 5 นาที (แอป ' + ctx.app + ')' });
  const je = events.filter(e => e.e === 'js_error').length;
  if (je && bump('th:je:' + vid, je, 600) >= 10) threat_('error_burst', vid, { device: dev, client, detail: 'ข้อผิดพลาดในหน้าเว็บ ≥10 ครั้งใน 10 นาที: ' + (events.find(e => e.e === 'js_error').l || '') });
  const sf = events.filter(e => e.e === 'submit_fail').length;
  if (sf && bump('th:sf:' + vid, sf, 1800) >= 5) threat_('submit_fail_burst', vid, { device: dev, client, detail: 'ส่งรายงานไม่สำเร็จ ≥5 ครั้งใน 30 นาที: ' + (events.filter(e => e.e === 'submit_fail').map(e => e.l).filter(Boolean)[0] || '') });
}

// ---------- บล็อกเครื่อง ----------
function threatBlocks_() {
  let b = {};
  try { b = JSON.parse(PropertiesService.getScriptProperties().getProperty('GUARD_BLOCKS') || '{}') || {}; } catch (e) { b = {}; }
  const now = Date.now();
  Object.keys(b).forEach(k => { if (!(b[k].until > now)) delete b[k]; });
  return b;
}
function threatIsBlocked_(dev) { return dev && dev !== 'anon' && !!threatBlocks_()[dev]; }
function threatBlock_(dev, on, reason, staff, ua, days) {
  dev = String(dev || '').replace(/[^\w-]/g, '').slice(0, 32);
  if (!dev || dev === 'anon') fail_('INVALID', 'ระบุเครื่องไม่ถูกต้อง');
  const b = threatBlocks_();
  if (on) b[dev] = { until: Date.now() + (days || 30) * 86400000, reason: clean_(reason, 120), by: staff.name || staff.email || '', at: Date.now() };
  else delete b[dev];
  PropertiesService.getScriptProperties().setProperty('GUARD_BLOCKS', JSON.stringify(b));
  log_(staff, on ? 'security.device_blocked' : 'security.device_unblocked', dev, { reason: clean_(reason, 120), days: on ? (days || 30) : 0 }, ua || '');
  return { success: true, blocks: threatBlocksList_() };
}
function threatBlocksList_() {
  const b = threatBlocks_();
  return Object.keys(b).map(k => Object.assign({ device: k }, b[k])).sort((x, y) => y.at - x.at);
}

// ---------- สำหรับหน้า Staff ----------
function threatList_(limit) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID), sh = ss.getSheetByName(THREAT_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  const n = Math.min(limit || 60, sh.getLastRow() - 1), start = sh.getLastRow() - n + 1;
  return sh.getRange(start, 1, n, T_HEADERS.length).getValues().map((r, i) => ({
    row: start + i, t: r[TC.TS] && r[TC.TS].getTime ? r[TC.TS].getTime() : Number(r[TC.TS]) || 0, level: r[TC.LEVEL], label: r[TC.LABEL], detail: r[TC.DETAIL],
    device: r[TC.DEVICE], userId: r[TC.USER], client: r[TC.CLIENT], status: r[TC.STATUS], by: r[TC.BY], type: r[TC.TYPE],
    tip: (THREAT_TYPES[r[TC.TYPE]] || {}).tip || '', sev: (THREAT_TYPES[r[TC.TYPE]] || {}).level || 'medium'
  })).reverse();
}
function threatSetStatus_(row, status, staff, ua) {
  const sh = threatSheet_();
  row = Number(row);
  if (!(row >= 2 && row <= sh.getLastRow())) fail_('INVALID', 'ไม่พบรายการ');
  if (['ใหม่', 'ตรวจแล้ว', 'บล็อกแล้ว'].indexOf(status) === -1) fail_('INVALID', 'สถานะไม่ถูกต้อง');
  sh.getRange(row, TC.STATUS + 1, 1, 2).setValues([[status, staff.name || staff.email || '']]);
  log_(staff, 'security.threat_' + (status === 'ตรวจแล้ว' ? 'reviewed' : status === 'บล็อกแล้ว' ? 'blocked' : 'reopened'), String(row), {}, ua || '');
  return { success: true };
}
