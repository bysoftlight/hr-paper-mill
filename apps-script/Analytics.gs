// HR Paper Mill — สถิติการใช้งาน (คล้าย Google Analytics แต่เก็บในชีตของเราเอง ไม่ส่งข้อมูลไปที่อื่น)
// เก็บ: หน้าที่เปิด · เหตุการณ์ (เช่น ส่งรายงานสำเร็จ) · อุปกรณ์/ระบบ/เบราว์เซอร์ · ที่มา — แบบไม่ระบุตัวตน
//   ผู้เยี่ยมชม = รหัสสุ่มของเครื่อง (ไม่ใช่รหัสผู้ใช้สิทธิ์/อีเมล) · เซสชัน = ช่วงใช้งานต่อเนื่อง (ว่างเกิน 30 นาทีนับใหม่)
// หน้าเว็บส่งมาเป็นชุด: analytics.track { ctx: {...}, events: [{ t, e, p, l, v, n }] }
// ผู้ดูแลระบบดูรายงาน: staff.analytics.report { days | from,to, app } (สิทธิ์ admin)
// เก็บย้อนหลัง ANALYTICS_KEEP_DAYS วัน (ลบอัตโนมัติทุกเช้าพร้อม morningHealthCheck)

const ANALYTICS_SHEET = 'Analytics';
const A_HEADERS = ['เวลา', 'วันที่', 'ชั่วโมง', 'แอป', 'กลุ่ม', 'ผู้เยี่ยมชม', 'เซสชัน', 'เหตุการณ์', 'หน้า', 'ป้าย', 'ค่า',
  'อุปกรณ์', 'ระบบ', 'เบราว์เซอร์', 'แอปบนหน้าจอ', 'ความกว้างจอ', 'ที่มา', 'ผู้ใช้ใหม่'];
const AC = { TS: 0, DATE: 1, HOUR: 2, APP: 3, ROLE: 4, VID: 5, SID: 6, EVENT: 7, PAGE: 8, LABEL: 9, VALUE: 10,
  DEVICE: 11, OS: 12, BROWSER: 13, PWA: 14, SCREEN: 15, REF: 16, NEW: 17 };
const ANALYTICS_APPS = ['user', 'staff', 'quote'];
const ANALYTICS_KEEP_DAYS = 400;

function analyticsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(ANALYTICS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ANALYTICS_SHEET);
    sh.getRange(1, 1, 1, A_HEADERS.length).setValues([A_HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// ---------- รับเหตุการณ์จากหน้าเว็บ ----------
function analyticsTrack_(req) {
  const ctx = req.ctx || {}, list = Array.isArray(req.events) ? req.events.slice(0, 60) : [];
  const app = ANALYTICS_APPS.indexOf(ctx.app) === -1 ? '' : ctx.app;
  const vid = String(ctx.vid || '').replace(/[^\w-]/g, '').slice(0, 24), sid = String(ctx.sid || '').replace(/[^\w-]/g, '').slice(0, 24);
  if (!app || !vid || !sid || !list.length) return { success: false, message: 'ข้อมูลไม่ครบ' };

  // กันส่งท่วม: เครื่องละไม่เกิน 600 เหตุการณ์/ชั่วโมง · ทั้งระบบไม่เกิน 3,000/นาที
  const cache = CacheService.getScriptCache();
  const vKey = 'an:v:' + vid + ':' + Math.floor(Date.now() / 3600000), gKey = 'an:g:' + Math.floor(Date.now() / 60000);
  const vN = Number(cache.get(vKey) || 0), gN = Number(cache.get(gKey) || 0);
  if (vN + list.length > 600 || gN + list.length > 3000) {
    if (typeof threatOnAnalytics_ === 'function' && vN + list.length > 600) threatOnAnalytics_(Object.assign({}, ctx, { vid, app }), list, true);
    return { success: true, throttled: true };
  }
  cache.put(vKey, String(vN + list.length), 3700);
  cache.put(gKey, String(gN + list.length), 120);

  const now = Date.now();
  const word = (s, n) => String(s == null ? '' : s).replace(/[^\w.\-:/ ]/g, '').slice(0, n);
  const device = ['mobile', 'tablet', 'desktop'].indexOf(ctx.device) === -1 ? 'desktop' : ctx.device;
  const rows = [];
  list.forEach(ev => {
    const e = String(ev && ev.e || '');
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(e)) return;
    let t = Number(ev.t) || now;
    if (t > now + 60000 || t < now - 2 * 86400000) t = now; // นาฬิกาเครื่องเพี้ยน / คิวค้างนานเกิน 2 วัน
    const d = new Date(t);
    const v = Number(ev.v);
    rows.push([d, fmtDate_(d), Number(fmtDate_(d, 'HH:mm').slice(0, 2)), app, clean_(ctx.role, 16), vid, sid, e,
      clean_(ev.p, 60), clean_(ev.l, 80), isFinite(v) ? Math.round(v) : '',
      device, word(ctx.os, 16), word(ctx.browser, 16), ctx.standalone ? 1 : 0, Math.min(9999, Math.max(0, Number(ctx.screen) || 0)),
      word(ctx.ref, 60), ev.n ? 1 : 0]);
  });
  if (!rows.length) return { success: true, saved: 0 };
  if (typeof threatOnAnalytics_ === 'function') { try { threatOnAnalytics_(Object.assign({}, ctx, { vid, app, did: String(ctx.did || '').replace(/[^\w-]/g, '').slice(0, 32) }), list, false); } catch (e) { /* ไม่ให้การตรวจจับทำให้การบันทึกล้ม */ } }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return { success: false, message: 'ระบบไม่ว่าง' };
  try {
    const sh = analyticsSheet_();
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, A_HEADERS.length).setValues(rows);
  } finally {
    lock.releaseLock();
  }
  return { success: true, saved: rows.length };
}

// ---------- อ่านข้อมูลตามช่วงวัน (ข้อมูลเรียงตามเวลา → หาแถวแรกด้วยคอลัมน์วันที่อย่างเดียว เร็วกว่าอ่านทั้งชีต) ----------
function analyticsRows_(fromDate) {
  const sh = analyticsSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  const dates = sh.getRange(2, AC.DATE + 1, last - 1, 1).getValues();
  let lo = 0, hi = dates.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (String(dates[mid][0]) < fromDate) lo = mid + 1; else hi = mid; }
  if (lo >= dates.length) return [];
  return sh.getRange(lo + 2, 1, dates.length - lo, A_HEADERS.length).getValues();
}

function addDays_(iso, n) {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000);
  return d.toISOString().slice(0, 10);
}
function tsOf_(v) { return v && typeof v.getTime === 'function' ? v.getTime() : Number(v) || 0; }

// ---------- รายงาน ----------
function analyticsReport_(req) {
  const today = fmtDate_(new Date());
  let to = /^\d{4}-\d{2}-\d{2}$/.test(req.to || '') ? req.to : today;
  let from = /^\d{4}-\d{2}-\d{2}$/.test(req.from || '') ? req.from : addDays_(to, -(Math.min(366, Math.max(1, Number(req.days) || 7)) - 1));
  if (from > to) { const x = from; from = to; to = x; }
  const span = Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) - Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / 86400000) + 1;
  const prevFrom = addDays_(from, -span), prevTo = addDays_(from, -1);
  const app = ANALYTICS_APPS.indexOf(req.app) === -1 ? 'all' : req.app;

  const key = 'an:r:' + [from, to, app].join(':');
  const cache = CacheService.getScriptCache();
  if (!req.fresh) { const hit = cache.get(key); if (hit) return JSON.parse(hit); }

  const all = analyticsRows_(prevFrom);
  const pick = r => app === 'all' || r[AC.APP] === app;
  const cur = [], prev = [];
  all.forEach(r => { if (!pick(r)) return; const d = String(r[AC.DATE]); if (d >= from && d <= to) cur.push(r); else if (d >= prevFrom && d <= prevTo) prev.push(r); });

  const out = {
    success: true, from, to, days: span, app, generatedAt: Date.now(),
    totals: totals_(cur), previous: totals_(prev),
    daily: daily_(cur, from, span),
    realtime: realtime_(all.filter(pick)),
    pages: pages_(cur), events: events_(cur),
    devices: countBy_(cur, r => r[AC.DEVICE]), os: countBy_(cur, r => r[AC.OS] || 'อื่นๆ'), browsers: countBy_(cur, r => r[AC.BROWSER] || 'อื่นๆ'),
    pwa: countBy_(cur, r => (r[AC.PWA] ? 'แอปบนหน้าจอโฮม' : 'เบราว์เซอร์')), sources: countBy_(cur, r => r[AC.REF] || 'เข้าตรง'),
    apps: countBy_(all.filter(r => { const d = String(r[AC.DATE]); return d >= from && d <= to; }), r => r[AC.APP]),
    heat: heat_(cur), funnel: funnel_(cur), outcomes: outcomes_(cur)
  };
  try { cache.put(key, JSON.stringify(out), 60); } catch (e) { /* ใหญ่เกิน cache ก็ไม่เป็นไร */ }
  return out;
}

// เซสชัน: เวลาตั้งแต่เหตุการณ์แรกถึงสุดท้าย + เวลาที่อยู่บนหน้าสุดท้าย (page_leave.v)
function sessions_(rows) {
  const s = {};
  rows.forEach(r => {
    const id = r[AC.SID], t = tsOf_(r[AC.TS]);
    const x = s[id] || (s[id] = { start: t, end: t, views: 0, events: 0, engaged: 0, vid: r[AC.VID], date: String(r[AC.DATE]), hour: r[AC.HOUR], conv: false });
    if (t < x.start) { x.start = t; x.date = String(r[AC.DATE]); x.hour = r[AC.HOUR]; }
    if (t > x.end) x.end = t;
    x.events++;
    if (r[AC.EVENT] === 'page_view') x.views++;
    if (r[AC.EVENT] === 'page_leave') x.engaged += Number(r[AC.VALUE]) || 0;
    if (/^(submit_success|template_apply|print|export)$/.test(r[AC.EVENT])) x.conv = true;
  });
  return s;
}
function totals_(rows) {
  const users = {}, newUsers = {};
  rows.forEach(r => { users[r[AC.VID]] = 1; if (r[AC.NEW]) newUsers[r[AC.VID]] = 1; });
  const ss = sessions_(rows), list = Object.keys(ss).map(k => ss[k]);
  // ระยะเวลาเซสชัน = ช่วงจากเหตุการณ์แรกถึงสุดท้าย หรือเวลาที่อยู่บนหน้า (page_leave) แล้วแต่อันไหนมากกว่า (สูงสุด 1 ชม.)
  const dur = list.map(x => Math.min(3600000, Math.max(x.end - x.start, x.engaged)));
  const engaged = list.filter((x, i) => dur[i] >= 10000 || x.views >= 2 || x.conv).length;
  const sumDur = dur.reduce((a, b) => a + b, 0);
  return {
    users: Object.keys(users).length, newUsers: Object.keys(newUsers).length, sessions: list.length,
    views: rows.filter(r => r[AC.EVENT] === 'page_view').length, events: rows.length,
    avgSession: list.length ? Math.round(sumDur / list.length / 1000) : 0,
    engagementRate: list.length ? Math.round(engaged / list.length * 100) : 0,
    viewsPerSession: list.length ? Math.round(rows.filter(r => r[AC.EVENT] === 'page_view').length / list.length * 10) / 10 : 0
  };
}
function daily_(rows, from, span) {
  const days = {};
  for (let i = 0; i < span; i++) days[addDays_(from, i)] = { u: {}, s: {}, views: 0 };
  rows.forEach(r => { const d = days[String(r[AC.DATE])]; if (!d) return; d.u[r[AC.VID]] = 1; d.s[r[AC.SID]] = 1; if (r[AC.EVENT] === 'page_view') d.views++; });
  return Object.keys(days).sort().map(k => ({ date: k, users: Object.keys(days[k].u).length, sessions: Object.keys(days[k].s).length, views: days[k].views }));
}
function realtime_(rows) {
  const now = Date.now(), perMin = new Array(30).fill(0).map(() => ({})), active = {}, pages = {};
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i], age = now - tsOf_(r[AC.TS]);
    if (age > 30 * 60000) break; // เรียงตามเวลา: เลยไปแล้วเก่ากว่านี้หมด
    if (age < 0) continue;
    perMin[29 - Math.floor(age / 60000)][r[AC.VID]] = 1;
    if (age <= 5 * 60000) { active[r[AC.VID]] = 1; if (r[AC.EVENT] === 'page_view') pages[r[AC.APP] + ':' + r[AC.PAGE]] = (pages[r[AC.APP] + ':' + r[AC.PAGE]] || 0) + 1; }
  }
  return { active: Object.keys(active).length, perMinute: perMin.map(m => Object.keys(m).length),
    users30: Object.keys(perMin.reduce((a, m) => Object.assign(a, m), {})).length,
    pages: Object.keys(pages).map(k => ({ key: k, views: pages[k] })).sort((a, b) => b.views - a.views).slice(0, 5) };
}
function pages_(rows) {
  const p = {};
  rows.forEach(r => {
    const k = r[AC.APP] + ':' + r[AC.PAGE];
    const x = p[k] || (p[k] = { app: r[AC.APP], page: String(r[AC.PAGE]), views: 0, u: {}, time: 0, leaves: 0 });
    if (r[AC.EVENT] === 'page_view') { x.views++; x.u[r[AC.VID]] = 1; }
    if (r[AC.EVENT] === 'page_leave') { x.time += Math.min(Number(r[AC.VALUE]) || 0, 3600000); x.leaves++; }
  });
  return Object.keys(p).map(k => p[k]).filter(x => x.views).map(x => ({ app: x.app, page: x.page, views: x.views, users: Object.keys(x.u).length, avgTime: x.leaves ? Math.round(x.time / x.leaves / 1000) : 0 }))
    .sort((a, b) => b.views - a.views).slice(0, 30);
}
function events_(rows) {
  const e = {};
  rows.forEach(r => {
    const k = r[AC.APP] + ':' + r[AC.EVENT];
    const x = e[k] || (e[k] = { app: r[AC.APP], event: r[AC.EVENT], count: 0, u: {}, labels: {} });
    x.count++; x.u[r[AC.VID]] = 1;
    if (r[AC.LABEL]) x.labels[r[AC.LABEL]] = (x.labels[r[AC.LABEL]] || 0) + 1;
  });
  return Object.keys(e).map(k => e[k]).filter(x => ['page_leave', 'session_start'].indexOf(x.event) === -1)
    .map(x => ({ app: x.app, event: x.event, count: x.count, users: Object.keys(x.u).length,
      labels: Object.keys(x.labels).map(l => ({ label: l, count: x.labels[l] })).sort((a, b) => b.count - a.count).slice(0, 6) }))
    .sort((a, b) => b.count - a.count).slice(0, 40);
}
// นับเป็น "ผู้เยี่ยมชม" (ไม่ใช่จำนวนเหตุการณ์) — เหมือน GA ที่แบ่งผู้ใช้ตามอุปกรณ์/ที่มา
function countBy_(rows, fn) {
  const m = {};
  rows.forEach(r => { const k = String(fn(r) || '-'); (m[k] = m[k] || {})[r[AC.VID]] = 1; });
  return Object.keys(m).map(k => ({ key: k, users: Object.keys(m[k]).length })).sort((a, b) => b.users - a.users).slice(0, 10);
}
// เซสชันที่เริ่ม แยกตามวันในสัปดาห์ × ชั่วโมง
function heat_(rows) {
  const g = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const ss = sessions_(rows);
  Object.keys(ss).forEach(k => {
    const x = ss[k], d = x.date;
    const wd = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))).getUTCDay();
    const h = Number(x.hour) || 0;
    if (h >= 0 && h < 24) g[wd][h]++;
  });
  return g;
}
// ขั้นตอนส่งรายงาน (หน้าผู้ใช้สิทธิ์): เซสชันที่ไปถึงแต่ละขั้น
function funnel_(rows) {
  const steps = [['form_view', 'เปิดหน้าส่งรายงาน'], ['location_ok', 'ระบุตำแหน่งแล้ว'], ['type_select', 'เลือกประเภทการขาย'], ['photo_ok', 'ถ่ายภาพแล้ว'], ['submit', 'กดบันทึก'], ['submit_success', 'ส่งสำเร็จ']];
  const has = steps.map(() => ({}));
  rows.forEach(r => {
    if (r[AC.APP] !== 'user') return;
    const e = r[AC.EVENT] === 'page_view' && r[AC.PAGE] === 'form' ? 'form_view' : r[AC.EVENT];
    const i = steps.findIndex(s => s[0] === e);
    if (i !== -1) has[i][r[AC.SID]] = 1;
  });
  return steps.map((s, i) => ({ step: s[0], label: s[1], sessions: Object.keys(has[i]).length }));
}
function outcomes_(rows) {
  const n = ev => rows.filter(r => r[AC.EVENT] === ev).length;
  const fails = {};
  rows.forEach(r => { if (r[AC.EVENT] === 'submit_fail') fails[r[AC.LABEL] || 'ไม่ทราบสาเหตุ'] = (fails[r[AC.LABEL] || 'ไม่ทราบสาเหตุ'] || 0) + 1; });
  return { submitSuccess: n('submit_success'), submitFail: n('submit_fail'), queued: n('submit_queued'), loginFail: n('login_fail'), errors: n('js_error'),
    failReasons: Object.keys(fails).map(k => ({ label: k, count: fails[k] })).sort((a, b) => b.count - a.count).slice(0, 6) };
}

// ---------- ลบข้อมูลเก่า (เรียกจาก morningHealthCheck ทุกเช้า) ----------
function pruneAnalytics() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID), sh = ss.getSheetByName(ANALYTICS_SHEET);
  if (!sh || sh.getLastRow() < 2) return 0;
  const cut = addDays_(fmtDate_(new Date()), -ANALYTICS_KEEP_DAYS);
  const dates = sh.getRange(2, AC.DATE + 1, sh.getLastRow() - 1, 1).getValues();
  let n = 0;
  while (n < dates.length && String(dates[n][0]) < cut) n++;
  if (n) sh.deleteRows(2, n);
  return n;
}
