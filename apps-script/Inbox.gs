// Inbox.gs — กล่องการแจ้งเตือนในแอป (ปุ่มกระดิ่ง) ของผู้ใช้สิทธิ์และเจ้าหน้าที่ + ประกาศ/ข่าวสารจากผู้ดูแลระบบ
//
// รายการที่ระบบสร้างให้ (ไม่ต้องตั้งค่า):
//   ผู้ใช้สิทธิ์ — เจ้าหน้าที่แก้ไข/ลบ/กู้คืนรายงานของคุณ · ข้อมูลบัญชีถูกปรับปรุง · เรื่องที่แจ้งมีความคืบหน้า · ประกาศ
//   เจ้าหน้าที่ — ประกาศ · เรื่องที่ตัวเองแจ้งมีความคืบหน้า · (ผู้ดูแลระบบ) แจ้งปัญหาใหม่ · บัญชีรออนุมัติ
//   ส่วน "อัปเดตแอป", "ยังไม่ได้ส่งรายงานวันนี้", "แบบสอบถามรอทำ" หน้าเว็บสร้างเอง (js/inbox.js)
// สถานะ "อ่านแล้ว" ซิงก์ทุกอุปกรณ์ของบัญชีเดียวกัน (แผ่นงาน InboxState) — ดูส่วน "สถานะอ่านแล้ว" ด้านล่าง
//
// ประกาศ: ผู้ดูแลระบบ › ประกาศ → แผ่นงาน "Announcements" (สร้างให้อัตโนมัติ) · เลือกส่งแจ้งเตือนบนมือถือได้

const NEWS_SHEET = 'Announcements';
const NWCOL = { ID: 0, TS: 1, TITLE: 2, BODY: 3, AUDIENCE: 4, LINK: 5, EXPIRES: 6, BY: 7, STATUS: 8, PUSHED: 9, UPDATED_AT: 10, IMAGE: 11, KIND: 12, ORG: 13,
  PUBLISH_AT: 14, BANNER: 15, ACK: 16, TARGET: 17, PUSH_PENDING: 18 };
// องค์กร: ว่าง = ประกาศส่วนกลาง (Dev ส่งถึงทุกองค์กร) · มีรหัส = เฉพาะผู้ใช้/เจ้าหน้าที่ขององค์กรนั้น
const NW_HEADERS = ['news_id', 'timestamp', 'title', 'body', 'audience', 'link', 'expires_at', 'created_by', 'status', 'push_sent', 'updated_at', 'image', 'kind', 'org_id',
  'publish_at', 'urgent_banner', 'require_ack', 'target_json', 'push_pending'];
// status: active (เผยแพร่) · draft (ฉบับร่าง ผู้รับยังไม่เห็น) · deleted
// publish_at: ตั้งเวลาเผยแพร่ (ว่าง = ทันที) · urgent_banner: แถบประกาศด่วนบนหน้าแรกจนหมดเวลา · require_ack: ต้องกด "รับทราบ"
// target_json: ส่งเฉพาะกลุ่มผู้ใช้สิทธิ์ {"sites":[...],"ids":[...],"label":"..."} (ว่าง = ทุกคนตาม audience)
const NEWS_KINDS = { news: 'ข่าวสาร', system: 'ระบบ' }; // ระบบ = แจ้งเรื่องสำคัญของระบบ เช่น ปิดปรับปรุง ขัดข้อง (หมวด "ระบบ" ในกล่องแจ้งเตือน)
const NEWS_AUDIENCES = { all: 'ทุกคน', participants: 'ผู้ใช้สิทธิ์', staff: 'เจ้าหน้าที่' };
const INBOX_DAYS = 45; // แสดงย้อนหลังกี่วัน

function inboxSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(NEWS_SHEET);
  if (!sh) { sh = ss.insertSheet(NEWS_SHEET); sh.getRange(1, 1, 1, NW_HEADERS.length).setValues([NW_HEADERS]); sh.setFrozenRows(1); }
  else if (sh.getLastColumn() < NW_HEADERS.length) sh.getRange(1, 1, 1, NW_HEADERS.length).setValues([NW_HEADERS]);
  return sh;
}
const ibTime_ = v => { const d = toDate_(v); return d ? d.getTime() : null; };
const ibThDate_ = ts => Utilities.formatDate(new Date(ts), TZ, 'd/M/') + (Number(Utilities.formatDate(new Date(ts), TZ, 'yyyy')) + 543);

function readNews_() {
  const sh = inboxSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, NW_HEADERS.length).getValues().map((r, i) => ({
    row: i + 2, id: String(r[NWCOL.ID]), ts: ibTime_(r[NWCOL.TS]), title: plain_(r[NWCOL.TITLE]), body: plain_(r[NWCOL.BODY]),
    audience: NEWS_AUDIENCES[r[NWCOL.AUDIENCE]] ? String(r[NWCOL.AUDIENCE]) : 'all', link: String(r[NWCOL.LINK] || ''), expiresAt: ibTime_(r[NWCOL.EXPIRES]),
    by: String(r[NWCOL.BY] || ''), status: String(r[NWCOL.STATUS] || 'active'), pushed: Number(r[NWCOL.PUSHED]) || 0, updatedAt: ibTime_(r[NWCOL.UPDATED_AT]),
    image: r[NWCOL.IMAGE] ? toImageUrl_(String(r[NWCOL.IMAGE])) : '', kind: NEWS_KINDS[r[NWCOL.KIND]] ? String(r[NWCOL.KIND]) : 'news',
    org: String(r[NWCOL.ORG] || '').trim(),
    publishAt: ibTime_(r[NWCOL.PUBLISH_AT]), banner: newsBool_(r[NWCOL.BANNER]), ack: newsBool_(r[NWCOL.ACK]), target: newsTarget_(r[NWCOL.TARGET]),
    pushPending: newsBool_(r[NWCOL.PUSH_PENDING])
  })).filter(n => n.id).map(n => Object.assign(n, { at: n.publishAt || n.ts })); // at = เวลาที่ผู้รับเห็นว่าประกาศ (ตั้งเวลา = เวลาเผยแพร่)
}
const newsBool_ = v => v === true || String(v).toUpperCase() === 'TRUE' || String(v) === '1';
function newsTarget_(v) {
  if (!v) return null;
  try {
    const t = JSON.parse(String(v));
    const sites = (Array.isArray(t.sites) ? t.sites : []).map(x => String(x).trim()).filter(Boolean).slice(0, 100);
    const ids = (Array.isArray(t.ids) ? t.ids : []).map(x => String(x).trim().toUpperCase()).filter(Boolean).slice(0, 2000);
    return sites.length || ids.length ? { sites: sites, ids: ids, label: clean_(t.label, 80) } : null;
  } catch (e) { return null; }
}
// ผู้ใช้สิทธิ์คนนี้อยู่ในกลุ่มเป้าหมายของประกาศไหม (ไม่ระบุกลุ่ม = ทุกคน)
function newsTargetOk_(n, user) {
  if (!n.target) return true;
  const id = String(user.id || '').toUpperCase(), site = String(user.site || '').trim();
  return n.target.ids.indexOf(id) !== -1 || (!!site && n.target.sites.indexOf(site) !== -1);
}
// ผู้รับที่เห็นประกาศได้: เผยแพร่แล้ว (ไม่ใช่ร่าง · ถึงเวลาแล้ว) · ยังไม่หมดอายุ
const newsLive_ = (n, now) => n.status === 'active' && n.at && n.at <= now && (!n.expiresAt || n.expiresAt > now);
// org = องค์กรของผู้อ่าน: เห็นประกาศส่วนกลาง + ประกาศขององค์กรตัวเอง
// who = { key, user? } — ผู้ใช้สิทธิ์ส่ง user (ใช้กรองกลุ่มเป้าหมาย) · เจ้าหน้าที่ไม่ถูกกรองกลุ่ม
function newsFor_(audience, org, who) {
  const now = Date.now(), since = now - INBOX_DAYS * 86400000;
  org = String(org || '').trim();
  const acks = who && who.key ? newsAcksFor_(who.key) : {};
  return readNews_().filter(n => newsLive_(n, now) && (!n.org || n.org === org) && (n.audience === 'all' || n.audience === audience) && n.at >= since &&
      (audience !== 'participants' || !who || !who.user || newsTargetOk_(n, who.user)))
    .map(n => {
      const it = { id: 'news-' + n.id, ts: n.at, cat: n.kind === 'system' ? 'update' : 'news', icon: n.kind === 'system' ? 'alert' : 'megaphone', tone: n.kind === 'system' ? 'warn' : '', title: plain_(n.title), body: plain_(n.body), link: n.link, image: n.image };
      if (n.banner) { it.banner = true; it.until = n.expiresAt || null; }
      if (n.ack) { it.ack = true; if (acks[n.id]) it.ackAt = acks[n.id]; }
      return it;
    });
}

// ---------- รับทราบ (แผ่นงาน NewsAcks: หนึ่งแถวต่อคนต่อประกาศ) ----------
const ACK_SHEET = 'NewsAcks';
const ACK_HEADERS = ['news_id', 'account', 'name', 'org_id', 'acked_at'];
function ackSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(ACK_SHEET);
  if (!sh) { sh = ss.insertSheet(ACK_SHEET); sh.getRange(1, 1, 1, ACK_HEADERS.length).setValues([ACK_HEADERS]); sh.setFrozenRows(1); }
  return sh;
}
function readAcks_() {
  const sh = ackSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, ACK_HEADERS.length).getValues().map(r => ({ news: String(r[0]), key: String(r[1]), name: String(r[2] || ''), org: String(r[3] || ''), at: ibTime_(r[4]) })).filter(a => a.news && a.key);
}
// ประกาศที่บัญชีนี้กดรับทราบแล้ว { newsId: เวลา }
function newsAcksFor_(key) {
  const out = {};
  readAcks_().forEach(a => { if (a.key === key) out[a.news] = a.at; });
  return out;
}
function newsAck_(key, name, org, newsId, audience, who) {
  const n = readNews_().filter(x => 'news-' + x.id === String(newsId) || x.id === String(newsId))[0];
  const now = Date.now();
  if (!n || !newsLive_(n, now) || !n.ack || (n.org && n.org !== String(org || '')) || (n.audience !== 'all' && n.audience !== audience) ||
      (audience === 'participants' && who && !newsTargetOk_(n, who))) fail_('NOT_FOUND', 'ไม่พบประกาศนี้ หรือประกาศไม่ต้องกดรับทราบ');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const had = readAcks_().filter(a => a.news === n.id && a.key === key)[0];
    if (had) return { success: true, ackAt: had.at };
    ackSheet_().appendRow([n.id, key, clean_(name, 120), String(org || ''), new Date(now)]);
    return { success: true, ackAt: now };
  } finally { lock.releaseLock(); }
}

// ---------- ผู้ใช้สิทธิ์ ----------
function inboxForUser_(user) {
  const out = [], since = Date.now() - INBOX_DAYS * 86400000, uid = String(user.id).toUpperCase();
  try { out.push.apply(out, newsFor_('participants', user.org, { key: 'u:' + String(user.id).toUpperCase(), user: user })); } catch (e) { console.warn('อ่านประกาศไม่สำเร็จ', e); }
  // รายงานที่เจ้าหน้าที่แก้ไข/ลบ/กู้คืน (คอลัมน์ แก้ไขโดย/แก้ไขล่าสุด)
  try {
    readRows_(SHEET.RECORDS, R_HEADERS.length).forEach((r, i) => {
      if (String(r[RCOL.USER_ID]).trim().toUpperCase() !== uid || !r[RCOL.UPDATED_BY]) return;
      const at = ibTime_(r[RCOL.UPDATED_AT]), ts = toDate_(r[RCOL.TS]);
      if (!at || at < since || !ts) return;
      const day = ibThDate_(ts.getTime()), deleted = r[RCOL.STATUS] === 'deleted';
      out.push({ id: 'rec-' + (i + 2) + '-' + at, ts: at, cat: 'usage', icon: deleted ? 'trash' : 'edit', tone: deleted ? 'bad' : '',
        title: deleted ? 'เจ้าหน้าที่ลบรายงานวันที่ ' + day : 'เจ้าหน้าที่แก้ไขรายงานวันที่ ' + day,
        body: deleted ? 'รายงานนี้ไม่นับเป็นการส่งแล้ว หากมีข้อสงสัยกรุณาติดต่อเจ้าหน้าที่' : 'ข้อมูลรายงาน (เช่น ประเภทการขายหรือหมายเหตุ) ถูกปรับให้ถูกต้อง ดูได้ในประวัติ',
        action: { kind: 'tab', value: 'history', label: 'ดูประวัติ' } });
    });
  } catch (e) { console.warn('อ่านรายงานไม่สำเร็จ', e); }
  // ข้อมูลบัญชีที่เจ้าหน้าที่ปรับปรุง
  try {
    const p = readParticipants_().filter(x => x.id === uid)[0];
    if (p && p.updatedBy && p.updatedAt && p.updatedAt.getTime() >= since)
      out.push({ id: 'acct-' + p.updatedAt.getTime(), ts: p.updatedAt.getTime(), cat: 'usage', icon: 'user', title: 'ข้อมูลบัญชีของคุณถูกปรับปรุง',
        body: 'เจ้าหน้าที่อัปเดตข้อมูล เช่น ชื่อ จุดขาย หรือรูปโปรไฟล์ ตรวจดูได้ที่หน้าบัญชี', action: { kind: 'tab', value: 'account', label: 'ดูบัญชี' } });
  } catch (e) { console.warn('อ่านบัญชีไม่สำเร็จ', e); }
  out.push.apply(out, problemUpdatesFor_(uid, since));
  return out.sort((a, b) => b.ts - a.ts).slice(0, 60);
}

// เรื่องที่แจ้ง (Feedback.gs) ที่ผู้ดูแลเปลี่ยนสถานะแล้ว
function problemUpdatesFor_(reporterId, since) {
  if (typeof feedbackRows_ !== 'function') return [];
  try {
    const key = String(reporterId).toLowerCase(), out = [];
    feedbackRows_(PROBLEM_SHEET, P_HEADERS).forEach(r => {
      if (String(r[PCOL.REPORTER_ID]).toLowerCase() !== key) return;
      const at = ibTime_(r[PCOL.HANDLED_AT]);
      if (!at || at < since) return;
      const st = String(r[PCOL.STATUS]), note = String(r[PCOL.ADMIN_NOTE] || '');
      out.push({ id: 'prob-' + r[PCOL.ID] + '-' + at, ts: at, cat: 'usage', icon: st === PROBLEM_STATUS.done ? 'check-circle' : 'alert', tone: st === PROBLEM_STATUS.done ? 'ok' : '',
        title: 'เรื่องที่แจ้ง: ' + st, body: (String(r[PCOL.TITLE] || r[PCOL.CATEGORY]) + (note ? ' · ' + note : '')).slice(0, 220) });
    });
    return out;
  } catch (e) { console.warn('อ่านเรื่องที่แจ้งไม่สำเร็จ', e); return []; }
}

// ---------- เจ้าหน้าที่ ----------
function inboxForStaff_(staff) {
  const out = [], since = Date.now() - INBOX_DAYS * 86400000, admin = can_(staff, 'admin');
  if (staff.status === 'active') { try { out.push.apply(out, newsFor_('staff', staff.org, { key: 's:' + staff.id })); } catch (e) { console.warn(e); } }
  out.push.apply(out, problemUpdatesFor_(staff.email || staff.id, since));
  if (admin) {
    // แจ้งปัญหาใหม่ (ยังไม่จัดการ) 14 วันล่าสุด
    if (typeof feedbackRows_ === 'function') {
      try {
        feedbackRows_(PROBLEM_SHEET, P_HEADERS).forEach(r => {
          const ts = ibTime_(r[PCOL.TS]);
          if (!ts || ts < Date.now() - 14 * 86400000 || String(r[PCOL.STATUS] || PROBLEM_STATUS.new) !== PROBLEM_STATUS.new) return;
          if (typeof PCOL.ORG === 'number' && !orgScopeOk_(staff, r[PCOL.ORG])) return; // แจ้งปัญหาขององค์กรอื่น
          out.push({ id: 'newprob-' + r[PCOL.ID], ts: ts, cat: 'usage', icon: 'alert', tone: 'bad', title: 'แจ้งปัญหาใหม่: ' + String(r[PCOL.TITLE] || r[PCOL.CATEGORY]),
            body: (String(r[PCOL.REPORTER_NAME] || r[PCOL.REPORTER_ID] || 'ไม่ระบุ') + ' · ' + String(r[PCOL.DETAIL])).slice(0, 200), action: { kind: 'admin', value: 'problems', label: 'เปิดดู' } });
        });
      } catch (e) { console.warn(e); }
    }
    // บัญชีเจ้าหน้าที่รออนุมัติ
    try {
      const pend = readStaff_().filter(s => s.status === 'pending' && orgScopeOk_(staff, s.org));
      if (pend.length) {
        const newest = Math.max.apply(null, pend.map(s => (s.createdAt ? s.createdAt.getTime() : 0)));
        out.push({ id: 'pend-' + pend.map(s => s.id).sort().join(','), ts: newest || Date.now(), cat: 'usage', icon: 'users', tone: 'warn',
          title: 'บัญชีรออนุมัติ ' + pend.length + ' บัญชี', body: pend.slice(0, 3).map(s => s.name || s.email).join(', ') + (pend.length > 3 ? ' และอื่นๆ' : ''),
          action: { kind: 'admin', value: 'staff', label: 'อนุมัติ' } });
      }
    } catch (e) { console.warn(e); }
  }
  // Dev: สลิปโอนเงินที่รอตรวจสอบ
  if (typeof isDev_ === 'function' && isDev_(staff) && typeof readInvoices_ === 'function') {
    try {
      const orgs = {};
      readOrgs_().forEach(o => { orgs[o.id] = o.name; });
      readInvoices_().filter(i => i.status === 'pending' && i.slip).forEach(i => {
        out.push({ id: 'slip-' + i.id + '-' + (i.slipAt || 0), ts: i.slipAt || Date.now(), cat: 'usage', icon: 'file', tone: 'warn',
          title: 'สลิปรอตรวจสอบ ' + i.id, body: (orgs[i.org] || i.org) + ' · ' + i.amount.toLocaleString('th-TH') + ' บาท' + (i.slipBy ? ' · ' + i.slipBy : ''),
          action: { kind: 'dev', value: 'invoices', label: 'ตรวจสอบ' } });
      });
    } catch (e) { console.warn(e); }
  }
  return out.sort((a, b) => b.ts - a.ts).slice(0, 60);
}

// ---------- ผู้ดูแลระบบ: ประกาศ ----------
// ขอบเขตองค์กรตามบัญชี (ใช้ได้ทั้งตอนที่ SCOPE_ORG_ ถูกตั้ง/ยังไม่ถูกตั้ง)
function orgScopeOk_(staff, org) {
  const scope = isDev_(staff) ? null : (staff.org || null);
  return !scope || String(org || '').trim() === scope;
}
function adminNewsList_(staff) {
  const dev = isDev_(staff), names = {};
  if (dev && typeof readOrgs_ === 'function') { try { readOrgs_().forEach(o => { names[o.id] = o.name; }); } catch (e) {} }
  const now = Date.now(), states = allInboxStates_(), acks = readAcks_(), ctx = newsRecipientsCtx_();
  const news = readNews_().filter(n => n.status !== 'deleted' && orgScopeOk_(staff, n.org)).map(n => {
    const o = Object.assign({}, n, { orgName: n.org ? (names[n.org] || n.org) : '', scheduled: n.status === 'active' && n.publishAt > now });
    delete o.row;
    if (n.status === 'active' && n.at <= now) o.stats = newsStats_(n, ctx, states, acks); // เผยแพร่แล้ว: ยอดผู้รับ/อ่าน/รับทราบ
    return o;
  }).sort((a, b) => (b.at || 0) - (a.at || 0));
  return { success: true, news: news, audiences: NEWS_AUDIENCES, scope: dev ? 'all' : (staff.org ? 'org' : 'all'),
    orgs: dev ? Object.keys(names).map(id => ({ id: id, name: names[id] })) : [] };
}
// ---------- ยอดคนอ่าน / รับทราบ ----------
// อ่านแล้ว = เปิด/กดอ่านรายการนี้ (read_ids) หรือประกาศเก่ากว่าเวลาเริ่มใช้กล่องของบัญชีนั้น (first)
function allInboxStates_() {
  const sh = stateSheet_(), last = sh.getLastRow(), out = {};
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, ST_HEADERS.length).getValues().forEach(r => {
    let read = [];
    try { read = JSON.parse(r[3] || '[]'); } catch (e) { read = []; }
    out[String(r[0])] = { first: Number(r[1]) || 0, read: Array.isArray(read) ? read : [] };
  });
  return out;
}
function newsRecipientsCtx_() {
  return { participants: readParticipants_(true).filter(p => p.active), staff: readStaff_().filter(st => st.status === 'active' && (st.permissions || []).length) };
}
// ผู้รับของประกาศ (ตามกลุ่ม · องค์กร · กลุ่มเป้าหมาย) — ไม่รวมคนที่ถูกปิดใช้งาน
function newsRecipients_(n, ctx) {
  const out = [];
  if (n.audience !== 'staff') ctx.participants.forEach(p => { if ((!n.org || p.org === n.org) && newsTargetOk_(n, p)) out.push({ key: 'u:' + p.id, name: p.name || p.id, sub: p.id + (p.site ? ' · ' + p.site : ''), kind: 'participant' }); });
  if (n.audience !== 'participants') ctx.staff.forEach(st => { if (!n.org || st.org === n.org) out.push({ key: 's:' + st.id, name: st.name || st.email, sub: st.email || '', kind: 'staff' }); });
  return out;
}
const newsRead_ = (n, st) => !!st && (st.read.indexOf('news-' + n.id) !== -1 || (!!st.first && n.at <= st.first));
function newsStats_(n, ctx, states, acks) {
  const rec = newsRecipients_(n, ctx), ackKeys = {};
  acks.forEach(a => { if (a.news === n.id) ackKeys[a.key] = true; });
  return { recipients: rec.length, read: rec.filter(r => newsRead_(n, states[r.key]) || ackKeys[r.key]).length, acked: n.ack ? rec.filter(r => ackKeys[r.key]).length : null };
}
// รายชื่อ: อ่านแล้ว/ยังไม่อ่าน · รับทราบแล้ว (เวลา)/ยังไม่รับทราบ
function adminNewsReaders_(req, staff) {
  const n = readNews_().filter(x => x.id === String(req.id) && x.status !== 'deleted' && orgScopeOk_(staff, x.org))[0];
  if (!n) fail_('NOT_FOUND', 'ไม่พบประกาศนี้');
  const states = allInboxStates_(), ackAt = {};
  readAcks_().forEach(a => { if (a.news === n.id) ackAt[a.key] = a.at; });
  const rows = newsRecipients_(n, newsRecipientsCtx_()).map(r => ({ name: r.name, sub: r.sub, kind: r.kind, read: newsRead_(n, states[r.key]) || !!ackAt[r.key], ackAt: ackAt[r.key] || null }));
  rows.sort((a, b) => String(a.name).localeCompare(String(b.name), 'th'));
  return { success: true, id: n.id, title: n.title, ack: n.ack, people: rows.slice(0, 3000) };
}

// ประกาศของใคร: ผู้ดูแลองค์กร = องค์กรตัวเองเสมอ · Dev เลือกได้ (ว่าง = ส่วนกลาง ทุกองค์กร)
function newsOrgFor_(req, staff) {
  if (!isDev_(staff)) return staff.org || '';
  const o = String(req.org || '').trim();
  if (o && typeof readOrgs_ === 'function' && !readOrgs_().some(x => x.id === o)) fail_('INVALID', 'ไม่พบองค์กรนี้');
  return o;
}
// ผู้รับการแจ้งเตือนบนมือถือ: เฉพาะคนในองค์กรของประกาศ (ประกาศส่วนกลาง = ทุกคน)
function newsPushTargets_(audience, org, item) {
  const staffIds = typeof activeStaffIds_ === 'function' ? activeStaffIds_() : {};
  const pOrg = org ? participantOrgMap_() : null, sOrg = {}, pAll = {};
  if (org) readStaff_().forEach(s => { sOrg[s.id] = s.org || ''; });
  if (item && item.target) readParticipants_(true).forEach(p => { pAll[p.id] = p; });
  const inTarget = id => !item || !item.target || (pAll[id] && newsTargetOk_(item, pAll[id]));
  return readNotify_().filter(n => n.channel === 'push' && (
    (audience !== 'staff' && n.ownerType === 'user' && (!org || pOrg[String(n.ownerId).toUpperCase()] === org) && inTarget(String(n.ownerId).toUpperCase())) ||
    (audience !== 'participants' && n.ownerType === 'staff' && staffIds[n.ownerId] && (!org || sOrg[n.ownerId] === org))));
}
function adminNewsSave_(req, staff, ua) {
  const title = clean_(req.title, 120), body = clean_(req.body, 1500), draft = !!req.draft;
  if (!title) fail_('INVALID', 'กรุณาใส่หัวข้อประกาศ');
  if (!draft && !body) fail_('INVALID', 'กรุณาใส่ข้อความประกาศ');
  const audience = NEWS_AUDIENCES[req.audience] ? req.audience : 'all';
  let link = String(req.link || '').trim();
  if (link && !/^https:\/\/[^\s"'<>]+$/i.test(link)) fail_('INVALID', 'ลิงก์ต้องขึ้นต้นด้วย https://');
  link = link.slice(0, 300);
  const nowMs = Date.now();
  const expires = req.expiresAt ? new Date(Number(req.expiresAt)) : '';
  if (expires && isNaN(expires)) fail_('INVALID', 'วันหมดอายุไม่ถูกต้อง');
  if (expires && !draft && expires.getTime() < nowMs) fail_('INVALID', 'วันหมดอายุต้องเป็นอนาคต');
  // ตั้งเวลาเผยแพร่ (ว่าง/อดีต = ทันที)
  const publishAt = req.publishAt && Number(req.publishAt) > nowMs + 60000 ? new Date(Number(req.publishAt)) : '';
  if (publishAt && expires && expires.getTime() <= publishAt.getTime()) fail_('INVALID', '"แสดงถึง" ต้องหลังเวลาเผยแพร่');
  const banner = !!req.banner, ack = !!req.ack;
  if (banner && !expires) fail_('INVALID', 'ประกาศด่วนต้องกำหนด "แสดงถึง" (แถบจะแสดงบนหน้าแรกจนถึงเวลานั้น)');
  const kind = NEWS_KINDS[req.kind] ? req.kind : 'news';
  // กลุ่มเป้าหมาย (เฉพาะผู้ใช้สิทธิ์): จุดขาย / รายคน
  const target = audience !== 'staff' && req.target ? newsTarget_(JSON.stringify(req.target)) : null;
  if (req.target && audience === 'staff') fail_('INVALID', 'เลือกกลุ่มเป้าหมายได้เฉพาะประกาศถึงผู้ใช้สิทธิ์');
  const sh = inboxSheet_(), now = new Date(nowMs);
  if (sh.getLastColumn() < NW_HEADERS.length) sh.getRange(1, 1, 1, NW_HEADERS.length).setValues([NW_HEADERS]);
  const wantPush = !!req.push && !draft, later = !!publishAt;
  let item, wasDraft = false;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const extra = [publishAt, banner, ack, target ? JSON.stringify(target) : '', wantPush && later ? 1 : 0];
    if (req.id) {
      item = readNews_().filter(n => n.id === String(req.id) && n.status !== 'deleted' && orgScopeOk_(staff, n.org))[0];
      if (!item) fail_('NOT_FOUND', 'ไม่พบประกาศนี้ (อาจถูกลบ)');
      wasDraft = item.status === 'draft';
      if (isDev_(staff) && req.org !== undefined) sh.getRange(item.row, NWCOL.ORG + 1).setValue(newsOrgFor_(req, staff));
      sh.getRange(item.row, NWCOL.TITLE + 1, 1, 5).setValues([[title, body, audience, link, expires]]);
      sh.getRange(item.row, NWCOL.UPDATED_AT + 1).setValue(now);
      sh.getRange(item.row, NWCOL.KIND + 1).setValue(kind);
      sh.getRange(item.row, NWCOL.STATUS + 1).setValue(draft ? 'draft' : 'active');
      if (wasDraft && !draft) sh.getRange(item.row, NWCOL.TS + 1).setValue(now); // เผยแพร่ร่าง: เวลาประกาศ = ตอนเผยแพร่
      sh.getRange(item.row, NWCOL.PUBLISH_AT + 1, 1, 5).setValues([extra]);
      if (req.removeImage) sh.getRange(item.row, NWCOL.IMAGE + 1).setValue('');
    } else {
      item = { id: 'N' + Utilities.formatDate(now, TZ, 'yyMMdd') + '-' + Utilities.getUuid().slice(0, 4).toUpperCase(), row: sh.getLastRow() + 1, pushed: 0, org: newsOrgFor_(req, staff) };
      sh.getRange(item.row, 1, 1, NW_HEADERS.length).setValues([[item.id, now, title, body, audience, link, expires, staff.name || staff.email, draft ? 'draft' : 'active', 0, now, '', kind, item.org].concat(extra)]);
    }
  } finally { lock.releaseLock(); }
  // รูปประกาศ (ไม่บังคับ) — บันทึกนอก lock เพราะอัปโหลดนาน
  if (req.image && req.image.data) {
    const url = saveNamedImage_('NEWS_' + item.id, req.image);
    sh.getRange(item.row, NWCOL.IMAGE + 1).setValue(url);
  }
  let pushed = null;
  if (wantPush && !later) pushed = newsPushNow_(sh, item.row);
  if (wantPush && later) ensureNewsTick_();
  log_(staff, req.id ? (wasDraft && !draft ? 'admin.news_publish' : 'admin.news_update') : (draft ? 'admin.news_draft' : 'admin.news_create'), item.id,
    { title: title, audience: audience, org: item.org || String(sh.getRange(item.row, NWCOL.ORG + 1).getValue() || '') || 'ทุกองค์กร', push: wantPush ? 1 : 0,
      scheduled: publishAt ? fmtDate_(publishAt, 'yyyy-MM-dd HH:mm') : '', banner: banner ? 1 : 0, ack: ack ? 1 : 0, target: target ? (target.label || (target.sites.length + ' จุด/' + target.ids.length + ' คน')) : '' }, ua);
  return { success: true, id: item.id, pushed: pushed, scheduled: publishAt ? publishAt.getTime() : null, draft: draft };
}
// ส่งแจ้งเตือนมือถือของประกาศแถวนี้ (ตามกลุ่ม/องค์กร/กลุ่มเป้าหมาย) แล้วบันทึกจำนวนที่ส่ง
function newsPushNow_(sh, row) {
  if (typeof readNotify_ !== 'function' || typeof sendPush_ !== 'function') return null;
  try {
    const n = readNews_().filter(x => x.row === row)[0];
    if (!n) return null;
    const subs = newsPushTargets_(n.audience, n.org, n);
    const res = subs.length ? sendPush_(subs, { title: plain_(n.title), body: plain_(n.body).slice(0, 160), url: './#inbox', tag: 'news' }) : { sent: 0 };
    sh.getRange(row, NWCOL.PUSHED + 1).setValue((n.pushed || 0) + (res.sent || 0));
    sh.getRange(row, NWCOL.PUSH_PENDING + 1).setValue(0);
    return res;
  } catch (e) { console.warn('ส่งแจ้งเตือนประกาศไม่สำเร็จ', e); return null; }
}
// ประกาศที่ตั้งเวลาไว้: ถึงเวลาแล้วส่งแจ้งเตือนมือถือ (ตั้งเวลาทุก 15 นาที + ตรวจเมื่อมีคนเปิดกล่องแจ้งเตือน)
function newsTick() {
  const now = Date.now(), due = readNews_().filter(n => n.status === 'active' && n.pushPending && n.publishAt && n.publishAt <= now);
  if (!due.length) return 0;
  const sh = inboxSheet_();
  due.forEach(n => { sh.getRange(n.row, NWCOL.PUSH_PENDING + 1).setValue(0); newsPushNow_(sh, n.row); });
  return due.length;
}
function newsTickSoon_() {
  const c = CacheService.getScriptCache();
  if (c.get('newsTick')) return;
  try { c.put('newsTick', '1', 300); } catch (e) {}
  try { newsTick(); } catch (e) { console.warn('newsTick', e); }
}
function ensureNewsTick_() {
  try {
    if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'newsTick')) ScriptApp.newTrigger('newsTick').timeBased().everyMinutes(15).create();
  } catch (e) { console.warn('ตั้งเวลา newsTick ไม่สำเร็จ (จะส่งเมื่อมีคนเปิดกล่องแจ้งเตือนแทน): ' + e); }
}
function adminNewsDelete_(req, staff, ua) {
  const item = readNews_().filter(n => n.id === String(req.id) && n.status !== 'deleted' && orgScopeOk_(staff, n.org))[0];
  if (!item) fail_('NOT_FOUND', 'ไม่พบประกาศนี้');
  inboxSheet_().getRange(item.row, NWCOL.STATUS + 1).setValue('deleted');
  log_(staff, 'admin.news_delete', item.id, { title: item.title }, ua);
  return { success: true };
}

// ---------- สถานะอ่านแล้ว (ซิงก์ทุกอุปกรณ์ของบัญชีเดียวกัน) ----------
// แผ่นงาน "InboxState": หนึ่งแถวต่อบัญชี (u:<รหัสผู้ใช้สิทธิ์> / s:<ID เจ้าหน้าที่>)
//   first = รายการก่อนเวลานี้ถือว่าอ่านแล้ว · seen = เปิดหน้าแจ้งเตือนล่าสุด (ใช้นับเลขบนกระดิ่ง) · read = รหัสรายการที่อ่านแล้ว
// รวมแบบไม่มีวันถอยหลัง: read = รวมกัน · seen = ค่ามากสุด · first = ค่าน้อยสุด — อุปกรณ์ไหนส่งก่อน/หลังก็ได้ผลเดียวกัน
const STATE_SHEET = 'InboxState';
const ST_HEADERS = ['account', 'read_before (first)', 'last_opened (seen)', 'read_ids_json', 'updated_at'];
const STATE_MAX_READ = 400;
function stateSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(STATE_SHEET);
  if (!sh) { sh = ss.insertSheet(STATE_SHEET); sh.getRange(1, 1, 1, ST_HEADERS.length).setValues([ST_HEADERS]); sh.setFrozenRows(1); }
  return sh;
}
function stateFind_(key) {
  const sh = stateSheet_(), last = sh.getLastRow();
  if (last < 2) return null;
  const keys = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) !== key) continue;
    const r = sh.getRange(i + 2, 1, 1, ST_HEADERS.length).getValues()[0];
    let read = [];
    try { read = JSON.parse(r[3] || '[]'); } catch (e) { read = []; }
    return { row: i + 2, first: Number(r[1]) || 0, seen: Number(r[2]) || 0, read: Array.isArray(read) ? read : [], at: Number(r[4]) || 0 };
  }
  return null;
}
function inboxStateGet_(key) {
  const c = CacheService.getScriptCache(), ck = 'ibs:' + key, hit = c.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  const st = stateFind_(key);
  const out = st ? { first: st.first, seen: st.seen, read: st.read, at: st.at } : { first: 0, seen: 0, read: [], at: 0 };
  try { c.put(ck, JSON.stringify(out), 300); } catch (e) {}
  return out;
}
function inboxStateMerge_(key, patch) {
  patch = patch || {};
  const ids = (Array.isArray(patch.read) ? patch.read : []).map(x => String(x).slice(0, 120)).filter(Boolean).slice(0, STATE_MAX_READ);
  const seen = Math.min(Number(patch.seen) || 0, Date.now() + 60000), first = Number(patch.first) || 0;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = stateSheet_(), cur = stateFind_(key);
    const read = cur ? cur.read.slice() : [];
    const have = {};
    read.forEach(x => { have[x] = true; });
    ids.forEach(x => { if (!have[x]) { have[x] = true; read.push(x); } });
    const out = {
      first: cur && cur.first ? (first ? Math.min(cur.first, first) : cur.first) : first,
      seen: Math.max(cur ? cur.seen : 0, seen), read: read.slice(-STATE_MAX_READ), at: Date.now()
    };
    const row = [key, out.first, out.seen, JSON.stringify(out.read), out.at];
    if (cur) sh.getRange(cur.row, 1, 1, ST_HEADERS.length).setValues([row]);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, ST_HEADERS.length).setValues([row]);
    try { CacheService.getScriptCache().put('ibs:' + key, JSON.stringify(out), 300); } catch (e) {}
    return out;
  } finally { lock.releaseLock(); }
}

// ---------- จุดเข้าใช้งานจาก Code.gs / Staff.gs ----------
function handleInboxPublic_(req) {
  const user = findUser_(req.userId);
  if (!user) return { success: false, code: 'NOT_FOUND', message: 'ไม่พบรหัสผู้ใช้สิทธิ์ กรุณาเข้าสู่ระบบใหม่' };
  const key = 'u:' + String(user.id).toUpperCase();
  if (req.action === 'inbox.list') { newsTickSoon_(); return { success: true, items: inboxForUser_(user), state: inboxStateGet_(key), at: Date.now() }; }
  if (req.action === 'inbox.ack') return newsAck_(key, user.name, user.org, req.id, 'participants', user);
  if (req.action === 'inbox.state') return { success: true, state: inboxStateGet_(key) };
  if (req.action === 'inbox.read') return { success: true, state: inboxStateMerge_(key, req) };
  return { success: false, message: 'ไม่รู้จักคำสั่ง: ' + req.action };
}
function handleInboxStaff_(req, staff, ua) {
  switch (req.action) {
    case 'staff.inbox.list':
      newsTickSoon_();
      return { success: true, items: inboxForStaff_(staff), state: inboxStateGet_('s:' + staff.id), at: Date.now() };
    case 'staff.inbox.ack':
      return newsAck_('s:' + staff.id, staff.name || staff.email, staff.org, req.id, 'staff', null);
    case 'admin.news.readers':
      requirePerm_(staff, 'admin');
      return adminNewsReaders_(req, staff);
    case 'staff.inbox.state':
      return { success: true, state: inboxStateGet_('s:' + staff.id) };
    case 'staff.inbox.read':
      return { success: true, state: inboxStateMerge_('s:' + staff.id, req) };
    case 'admin.news.list':
      requirePerm_(staff, 'admin');
      return adminNewsList_(staff);
    case 'admin.news.save':
      requirePerm_(staff, 'admin');
      return adminNewsSave_(req, staff, ua);
    case 'admin.news.delete':
      requirePerm_(staff, 'admin');
      return adminNewsDelete_(req, staff, ua);
  }
  fail_('INVALID', 'ไม่รู้จักคำสั่ง: ' + req.action);
}
