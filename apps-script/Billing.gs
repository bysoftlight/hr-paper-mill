// Billing.gs — Dev console: องค์กร (บริษัทลูกค้า) · แพลน · ทดลองใช้ฟรี · การสมัครสมาชิก · บัญชีรับเงิน · ใบแจ้งหนี้/การชำระเงิน
// เฉพาะบัญชีบทบาท dev (ดู Auth.gs) · ผู้ใช้สิทธิ์และเจ้าหน้าที่ผูกกับองค์กรด้วยคอลัมน์ "องค์กร" ในชีต Users / Staff
// สถานะองค์กร:
//   trial      ทดลองใช้ฟรี ถึง "สิ้นสุดทดลอง" (ค่าเริ่มต้น 30 วัน) — หมดแล้วใช้งานไม่ได้จนกว่าจะชำระเงิน
//   active     ใช้งานตามรอบบิล ถึง "สิ้นสุดรอบบิล" — เลยกำหนดยังใช้ได้อีก GRACE_DAYS วัน (แสดงเตือนค้างชำระ)
//   past_due   ค้างชำระ (ตั้งเอง) — ใช้ได้ถึงสิ้นสุดรอบบิล + GRACE_DAYS
//   suspended  ระงับ — ใช้งานไม่ได้ทันที · cancelled ยกเลิกแล้ว — ใช้งานไม่ได้
// บัญชีที่ไม่ได้ผูกองค์กร (ข้อมูลเดิม) ใช้งานได้ตามปกติ ไม่จำกัด
// หน้าแพ็กเกจ (packages.html) อ่านแพลนที่ "แสดงในหน้าแพ็กเกจ" และบัญชีรับเงินผ่าน plans.public (ไม่ต้องเข้าสู่ระบบ)

const BILL_SHEET = { ORGS: 'Orgs', PLANS: 'Plans', ACCOUNTS: 'PayAccounts', INVOICES: 'Invoices' };
const BO = { ID: 0, NAME: 1, CONTACT: 2, EMAIL: 3, PHONE: 4, TAX_ID: 5, ADDRESS: 6, PLAN: 7, STATUS: 8, CYCLE: 9, TRIAL_START: 10, TRIAL_END: 11,
  PERIOD_START: 12, PERIOD_END: 13, MAX_USERS: 14, MAX_STAFF: 15, NOTE: 16, CREATED_AT: 17, UPDATED_AT: 18, UPDATED_BY: 19, LOGO: 20 };
const BO_HEADERS = ['รหัส', 'ชื่อบริษัท/องค์กร', 'ผู้ติดต่อ', 'อีเมล', 'โทร', 'เลขผู้เสียภาษี', 'ที่อยู่', 'แพลน', 'สถานะ', 'รอบบิล', 'เริ่มทดลอง', 'สิ้นสุดทดลอง',
  'เริ่มรอบบิล', 'สิ้นสุดรอบบิล', 'ผู้ใช้สิทธิ์สูงสุด (กำหนดเอง)', 'เจ้าหน้าที่สูงสุด (กำหนดเอง)', 'หมายเหตุ', 'สร้างเมื่อ', 'แก้ไขล่าสุด', 'แก้ไขโดย', 'โลโก้'];
const BP = { ID: 0, NAME: 1, TAGLINE: 2, PRICE_M: 3, PRICE_Y: 4, MAX_USERS: 5, MAX_STAFF: 6, FEATURES: 7, HIGHLIGHT: 8, PUBLIC: 9, ORDER: 10, ACTIVE: 11, TRIAL_DAYS: 12, UPDATED_AT: 13, SETUP: 14, FROM: 15 };
const BP_HEADERS = ['รหัส', 'ชื่อแพลน', 'คำโปรย', 'ราคา/เดือน (บาท)', 'ราคา/ปี (บาท)', 'ผู้ใช้สิทธิ์สูงสุด (0 = ไม่จำกัด)', 'เจ้าหน้าที่สูงสุด (0 = ไม่จำกัด)',
  'ฟีเจอร์ (บรรทัดละข้อ)', 'แนะนำ', 'แสดงในหน้าแพ็กเกจ', 'ลำดับ', 'ใช้งาน', 'วันทดลองใช้', 'แก้ไขล่าสุด', 'ค่าติดตั้ง ครั้งเดียว (บาท)', 'แสดงเป็นราคาเริ่มต้น'];
const BA = { ID: 0, TYPE: 1, BANK: 2, NAME: 3, NUMBER: 4, BRANCH: 5, DEFAULT: 6, ACTIVE: 7, NOTE: 8, UPDATED_AT: 9 };
const BA_HEADERS = ['รหัส', 'ประเภท', 'ธนาคาร/ผู้ให้บริการ', 'ชื่อบัญชี', 'เลขบัญชี/พร้อมเพย์', 'สาขา', 'ค่าเริ่มต้น', 'ใช้งาน', 'หมายเหตุ', 'แก้ไขล่าสุด'];
const BI = { ID: 0, ORG: 1, PLAN: 2, CYCLE: 3, PERIOD_START: 4, PERIOD_END: 5, AMOUNT: 6, STATUS: 7, ISSUED: 8, DUE: 9, PAID_AT: 10, ACCOUNT: 11, METHOD: 12, REF: 13, NOTE: 14, BY: 15 };
const BI_HEADERS = ['เลขที่', 'องค์กร', 'แพลน', 'รอบบิล', 'เริ่มรอบ', 'สิ้นสุดรอบ', 'จำนวนเงิน (บาท)', 'สถานะ', 'วันที่ออก', 'ครบกำหนด', 'ชำระเมื่อ', 'บัญชีรับเงิน', 'ช่องทาง', 'เลขอ้างอิง', 'หมายเหตุ', 'บันทึกโดย'];

const ORG_STATUSES = ['trial', 'active', 'past_due', 'suspended', 'cancelled'];
const ORG_STATUS_TH = { trial: 'ทดลองใช้', active: 'ใช้งาน', past_due: 'ค้างชำระ', suspended: 'ระงับ', cancelled: 'ยกเลิก' };
const BILL_CYCLES = ['monthly', 'yearly'];
const INVOICE_STATUSES = ['pending', 'paid', 'void'];
const ACCOUNT_TYPES = ['bank', 'promptpay', 'other'];
const DEFAULT_TRIAL_DAYS = 30;
const GRACE_DAYS = 7;
const DAY_MS_ = 86400000;

// แพลนตั้งต้น (สร้างเมื่อยังไม่มีชีต Plans) — แก้ได้ใน Dev console · ราคาอ้างอิงใบเสนอราคา QT-2569-001
// คอลัมน์: รหัส ชื่อ คำโปรย ราคา/เดือน ราคา/ปี ผู้ใช้สิทธิ์ เจ้าหน้าที่ ฟีเจอร์ แนะนำ แสดง ลำดับ ใช้งาน วันทดลอง | (แก้ไขล่าสุด) ค่าติดตั้ง ราคาเริ่มต้น
const DEFAULT_PLANS_ = [
  ['lite', 'Lite', 'เริ่มต้นสำหรับโครงการไม่เกิน 50 คน', 1900, 19000, 50, 3,
    'แอปส่งรายงาน: GPS · ประเภทการขาย · ถ่ายรูปหลักฐาน · ประวัติ\nกล้องพร้อมกรอบนำถ่าย + ประทับวันเวลา/พิกัด\nDashboard ภาพรวมวันนี้ + รายชื่อผู้ยังไม่ส่ง\nรายงานพร้อมตัวกรอง · ส่งออก Excel / PDF รายเดือน\nจัดการผู้ใช้สิทธิ์ · เจ้าหน้าที่เข้าสู่ระบบด้วย Google\nติดตั้ง + อบรมการใช้งาน 1 ชม.\nดูแลระบบ · อัปเดตฟังก์ชัน · สำรองข้อมูลรายสัปดาห์', false, true, 1, true, 30, 5000, false],
  ['pro', 'Pro', 'คุ้มที่สุด รวมฟังก์ชันเสริมครบ', 3900, 39000, 200, 10,
    'ทุกอย่างใน Lite\nแจ้งเตือนผู้ที่ยังไม่ส่งรายงานทาง LINE และ Push\nส่งรายงานได้แม้สัญญาณหลุด + ติดตั้งเป็นแอป\nโหมดตรวจรูปและอนุมัติรายงาน · ตรวจรูปซ้ำ / พิกัดผิดปกติ\nโหมดอ่านง่ายสำหรับผู้พิการ\nสถิติการใช้งานเรียลไทม์ · อีเมลรายงานประจำเดือน\nอบรม 2 ชม. · ช่วยเหลือในวันทำการ', true, true, 2, true, 30, 5000, false],
  ['enterprise', 'Enterprise', 'สำหรับองค์กรหลายโครงการ ปรับแต่งได้', 7900, 79000, 0, 0,
    'ทุกอย่างใน Pro\nผู้ใช้สิทธิ์และเจ้าหน้าที่ไม่จำกัด · แยกหลายโครงการ/สาขา\nแยกเก็บข้อมูลรายเดือน · ส่งออกข้อมูลทั้งหมดได้ทุกเมื่อ\nดูแลระบบรายปี (MA) รวมในแพ็กเกจ\nปรับแต่งรายงาน แบรนด์ และฟังก์ชันตามองค์กร\nผู้ดูแลเฉพาะ · ตอบกลับภายใน 4 ชม. ทำการ', false, true, 3, true, 30, 15000, true]
];
const planRow_ = (p, now) => p.slice(0, 13).concat([now, p[13], p[14]]);
const PLANS_VERSION = '2';

// ---------- ชีต ----------
function billSheet_(name, headers) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    if (name === BILL_SHEET.PLANS) {
      const now = new Date();
      DEFAULT_PLANS_.forEach(p => sh.appendRow(planRow_(p, now)));
    }
    if (name === BILL_SHEET.PLANS) PropertiesService.getScriptProperties().setProperty('PLANS_V', PLANS_VERSION);
  } else if (name === BILL_SHEET.PLANS) migratePlans_(sh);
  return sh;
}
// แพลนรุ่นแรก (Starter 990 / Pro 2,490 / Enterprise) ที่ยังไม่ได้แก้ → เปลี่ยนเป็นชุดใหม่ (Lite / Pro / Enterprise) ครั้งเดียว
//   ถ้า Dev แก้แพลนเองแล้ว ไม่เขียนทับ — เติมเฉพาะหัวคอลัมน์ใหม่ (ค่าติดตั้ง / ราคาเริ่มต้น)
function migratePlans_(sh) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('PLANS_V') === PLANS_VERSION) return;
  sh.getRange(1, 1, 1, BP_HEADERS.length).setValues([BP_HEADERS]);
  const last = sh.getLastRow();
  const rows = last >= 2 ? sh.getRange(2, 1, last - 1, 14).getValues() : [];
  const sig = rows.map(r => String(r[BP.ID]) + ':' + money_(r[BP.PRICE_M]) + ':' + money_(r[BP.PRICE_Y])).sort().join('|');
  if (!rows.length || sig === 'enterprise:0:0|pro:2490:24900|starter:990:9900') {
    if (rows.length) sh.deleteRows(2, rows.length);
    const now = new Date();
    DEFAULT_PLANS_.forEach(p => sh.appendRow(planRow_(p, now)));
    // องค์กร/ใบแจ้งหนี้ที่ใช้แพลน starter → lite
    [[BILL_SHEET.ORGS, BO_HEADERS, BO.PLAN], [BILL_SHEET.INVOICES, BI_HEADERS, BI.PLAN]].forEach(([n, h, col]) => {
      const s2 = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(n);
      if (!s2 || s2.getLastRow() < 2) return;
      const vals = s2.getRange(2, col + 1, s2.getLastRow() - 1, 1).getValues();
      if (vals.some(v => v[0] === 'starter')) s2.getRange(2, col + 1, vals.length, 1).setValues(vals.map(v => [v[0] === 'starter' ? 'lite' : v[0]]));
    });
  }
  props.setProperty('PLANS_V', PLANS_VERSION);
  try { CacheService.getScriptCache().remove('bill:public'); } catch (e) {}
}
function billRows_(name, headers) {
  const sh = billSheet_(name, headers), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, headers.length).getValues().map((r, i) => ({ r: r, row: i + 2 })).filter(x => String(x.r[0] || '').trim());
}
const bool_ = v => v === true || String(v).toUpperCase() === 'TRUE' || v === 1 || String(v) === '1';
const ts_ = v => { const d = toDate_(v); return d ? d.getTime() : null; };
const money_ = v => { const n = Number(String(v === null || v === undefined ? '' : v).replace(/[,\s฿]/g, '')); return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; };
const int_ = v => { const n = Math.floor(Number(v)); return isFinite(n) && n > 0 ? n : 0; };
function billGen_() { try { CacheService.getScriptCache().put('bill:gen', String(Date.now()) + Math.random().toString(36).slice(2, 5), 21600); } catch (e) {} }

const LOGO_INLINE_MAX = 40000; // ตัวอักษร (1 ช่องในชีตเก็บได้ 50,000)
function orgFromRow_(x) {
  const r = x.r;
  return {
    row: x.row, id: String(r[BO.ID]).trim(), name: plain_(r[BO.NAME]), contact: plain_(r[BO.CONTACT]), email: String(r[BO.EMAIL] || ''), phone: plain_(r[BO.PHONE]),
    taxId: plain_(r[BO.TAX_ID]), address: plain_(r[BO.ADDRESS]), plan: String(r[BO.PLAN] || ''),
    status: ORG_STATUSES.indexOf(r[BO.STATUS]) === -1 ? 'trial' : r[BO.STATUS], cycle: BILL_CYCLES.indexOf(r[BO.CYCLE]) === -1 ? 'monthly' : r[BO.CYCLE],
    trialStart: ts_(r[BO.TRIAL_START]), trialEnd: ts_(r[BO.TRIAL_END]), periodStart: ts_(r[BO.PERIOD_START]), periodEnd: ts_(r[BO.PERIOD_END]),
    maxUsers: int_(r[BO.MAX_USERS]), maxStaff: int_(r[BO.MAX_STAFF]), note: plain_(r[BO.NOTE]),
    createdAt: ts_(r[BO.CREATED_AT]), updatedAt: ts_(r[BO.UPDATED_AT]), updatedBy: String(r[BO.UPDATED_BY] || ''),
    // โลโก้เก็บเป็นรูปเล็ก (data URL) ในชีต: รักษาพื้นโปร่งใสของ PNG — รูปย่อของ Drive ทำพื้นโปร่งใสเป็นสีดำ
    logo: r[BO.LOGO] ? (/^data:image\//.test(String(r[BO.LOGO])) ? String(r[BO.LOGO]) : toImageUrl_(String(r[BO.LOGO])).replace('sz=w1000', 'sz=w256')) : ''
  };
}
function planFromRow_(x) {
  const r = x.r;
  return {
    row: x.row, id: String(r[BP.ID]).trim(), name: plain_(r[BP.NAME]), tagline: plain_(r[BP.TAGLINE]), priceMonthly: money_(r[BP.PRICE_M]), priceYearly: money_(r[BP.PRICE_Y]),
    maxUsers: int_(r[BP.MAX_USERS]), maxStaff: int_(r[BP.MAX_STAFF]),
    features: plain_(r[BP.FEATURES]).split('\n').map(s => s.trim()).filter(Boolean),
    highlight: bool_(r[BP.HIGHLIGHT]), public: bool_(r[BP.PUBLIC]), order: Number(r[BP.ORDER]) || 0, active: r[BP.ACTIVE] === '' ? true : bool_(r[BP.ACTIVE]),
    trialDays: r[BP.TRIAL_DAYS] === '' ? DEFAULT_TRIAL_DAYS : Math.max(0, Math.floor(Number(r[BP.TRIAL_DAYS]) || 0)), updatedAt: ts_(r[BP.UPDATED_AT]),
    setupFee: money_(r[BP.SETUP]), fromPrice: bool_(r[BP.FROM])
  };
}
function accountFromRow_(x) {
  const r = x.r;
  return { row: x.row, id: String(r[BA.ID]).trim(), type: ACCOUNT_TYPES.indexOf(r[BA.TYPE]) === -1 ? 'bank' : r[BA.TYPE], bank: plain_(r[BA.BANK]), name: plain_(r[BA.NAME]),
    number: plain_(r[BA.NUMBER]), branch: plain_(r[BA.BRANCH]), isDefault: bool_(r[BA.DEFAULT]), active: r[BA.ACTIVE] === '' ? true : bool_(r[BA.ACTIVE]), note: plain_(r[BA.NOTE]) };
}
function invoiceFromRow_(x) {
  const r = x.r;
  return { row: x.row, id: String(r[BI.ID]).trim(), org: String(r[BI.ORG] || ''), plan: String(r[BI.PLAN] || ''), cycle: String(r[BI.CYCLE] || 'monthly'),
    periodStart: ts_(r[BI.PERIOD_START]), periodEnd: ts_(r[BI.PERIOD_END]), amount: money_(r[BI.AMOUNT]),
    status: INVOICE_STATUSES.indexOf(r[BI.STATUS]) === -1 ? 'pending' : r[BI.STATUS], issued: ts_(r[BI.ISSUED]), due: ts_(r[BI.DUE]), paidAt: ts_(r[BI.PAID_AT]),
    account: String(r[BI.ACCOUNT] || ''), method: plain_(r[BI.METHOD]), ref: plain_(r[BI.REF]), note: plain_(r[BI.NOTE]), by: String(r[BI.BY] || '') };
}
const readOrgs_ = () => billRows_(BILL_SHEET.ORGS, BO_HEADERS).map(orgFromRow_);
const readPlans_ = () => billRows_(BILL_SHEET.PLANS, BP_HEADERS).map(planFromRow_).sort((a, b) => a.order - b.order);
const readAccounts_ = () => billRows_(BILL_SHEET.ACCOUNTS, BA_HEADERS).map(accountFromRow_);
const readInvoices_ = () => billRows_(BILL_SHEET.INVOICES, BI_HEADERS).map(invoiceFromRow_);

// ---------- สิทธิ์การใช้งานขององค์กร (ตรวจทุกคำขอ — จำไว้ 2 นาที ล้างเมื่อแก้ข้อมูล) ----------
function orgAccess_(orgId) {
  orgId = String(orgId || '').trim();
  if (!orgId) return { ok: true, state: 'none' };
  const cache = CacheService.getScriptCache();
  let gen = cache.get('bill:gen');
  if (!gen) { gen = String(Date.now()); cache.put('bill:gen', gen, 21600); }
  const key = 'bill:acc:' + gen + ':' + orgId, hit = cache.get(key);
  let o, plan;
  if (hit) { const c = JSON.parse(hit); o = c.o; plan = c.p; }
  else {
    o = readOrgs_().filter(x => x.id === orgId)[0] || null;
    plan = o ? readPlans_().filter(p => p.id === o.plan)[0] || null : null;
    try { cache.put(key, JSON.stringify({ o: o, p: plan }), 120); } catch (e) {}
  }
  if (!o) return { ok: true, state: 'none' }; // รหัสองค์กรไม่มีในระบบ: ไม่จำกัด (กันล็อกทุกคนเพราะพิมพ์ผิด)
  return orgState_(o, plan, Date.now());
}
function orgState_(o, plan, now) {
  const base = { org: { id: o.id, name: o.name, logo: o.logo || '' }, plan: plan ? { id: plan.id, name: plan.name } : null, status: o.status };
  const dayIdx = t => Math.floor((t + 7 * 3600000) / DAY_MS_); // วันตามเวลาไทย
  const daysTo = t => dayIdx(t) - dayIdx(now);
  const contact = 'กรุณาติดต่อผู้ให้บริการเพื่อชำระเงิน';
  if (o.status === 'suspended') return Object.assign(base, { ok: false, state: 'suspended', message: `องค์กร ${o.name} ถูกระงับการใช้งาน ${contact}`, userMessage: 'ระบบขององค์กรถูกระงับชั่วคราว กรุณาติดต่อเจ้าหน้าที่' });
  if (o.status === 'cancelled') return Object.assign(base, { ok: false, state: 'cancelled', message: `องค์กร ${o.name} ยกเลิกการใช้งานแล้ว`, userMessage: 'ระบบขององค์กรปิดใช้งานแล้ว กรุณาติดต่อเจ้าหน้าที่' });
  if (o.status === 'trial') {
    const end = o.trialEnd || ((o.trialStart || o.createdAt || now) + DEFAULT_TRIAL_DAYS * DAY_MS_);
    const left = daysTo(end);
    if (now > end) return Object.assign(base, { ok: false, state: 'trial_expired', endsAt: end, daysLeft: 0, message: `ช่วงทดลองใช้ฟรีของ ${o.name} สิ้นสุดแล้ว ${contact}เพื่อใช้งานต่อ`, userMessage: 'ช่วงทดลองใช้ของระบบสิ้นสุดแล้ว กรุณาติดต่อเจ้าหน้าที่' });
    return Object.assign(base, { ok: true, state: 'trial', endsAt: end, daysLeft: left, warn: left <= 7, message: `ทดลองใช้ฟรี เหลืออีก ${left} วัน` });
  }
  // active / past_due: ตามรอบบิล
  const end = o.periodEnd;
  if (!end) return Object.assign(base, { ok: true, state: o.status, message: o.status === 'past_due' ? 'ค้างชำระ' : 'ใช้งาน' });
  const graceEnd = end + GRACE_DAYS * DAY_MS_;
  if (now > graceEnd) return Object.assign(base, { ok: false, state: 'expired', endsAt: end, daysLeft: 0, message: `รอบบิลของ ${o.name} หมดอายุแล้ว (ค้างชำระเกิน ${GRACE_DAYS} วัน) ${contact}`, userMessage: 'ระบบขององค์กรหมดอายุการใช้งาน กรุณาติดต่อเจ้าหน้าที่' });
  if (now > end || o.status === 'past_due') return Object.assign(base, { ok: true, state: 'past_due', endsAt: end, graceEndsAt: graceEnd, daysLeft: Math.max(0, daysTo(graceEnd)), warn: true, message: `ค้างชำระ — ใช้งานได้อีก ${Math.max(0, daysTo(graceEnd))} วัน กรุณาชำระเงินเพื่อใช้งานต่อเนื่อง` });
  const left = daysTo(end);
  return Object.assign(base, { ok: true, state: 'active', endsAt: end, daysLeft: left, warn: left <= 7, message: left <= 7 ? `รอบบิลจะสิ้นสุดในอีก ${left} วัน` : 'ใช้งาน' });
}
// ส่งให้หน้าเว็บ (ไม่มีข้อมูลภายใน)
function orgAccessDto_(a) {
  if (!a || a.state === 'none') return null;
  return { ok: a.ok, state: a.state, status: a.status, org: a.org, plan: a.plan, endsAt: a.endsAt || null, daysLeft: a.daysLeft === undefined ? null : a.daysLeft, warn: !!a.warn, message: a.message };
}

// จำนวนผู้ใช้สิทธิ์ / เจ้าหน้าที่ ตามแพลน (ค่ากำหนดเองขององค์กรมาก่อน) — เกินแล้วเพิ่มไม่ได้
// ข้อมูลองค์กรสำหรับผู้ใช้ (ชื่อ + โลโก้) — ไม่มีข้อมูลการชำระเงิน
function orgPublic_(orgId) {
  if (!orgId) return null;
  const a = orgAccess_(orgId);
  return a && a.org ? { id: a.org.id, name: a.org.name, logo: a.org.logo || '' } : null;
}
// ข้อมูลการเงินขององค์กรตัวเอง (ผู้ดูแลระบบ / ผู้ดูแลการเงิน): แพลน · สถานะ · จำนวนที่ใช้ · ใบแจ้งหนี้ · ช่องทางชำระเงิน
function orgBillingInfo_(staff) {
  const o = staff.org ? readOrgs_().filter(x => x.id === staff.org)[0] : null;
  if (!o) return { success: true, org: null };
  const plan = readPlans_().filter(p => p.id === o.plan)[0] || null;
  const counts = orgCounts_(), lim = orgLimits_(o, plan);
  const invoices = readInvoices_().filter(i => i.org === o.id && i.status !== 'void').sort((a, b) => (b.issued || 0) - (a.issued || 0)).slice(0, 24)
    .map(i => ({ id: i.id, plan: i.plan, cycle: i.cycle, periodStart: i.periodStart, periodEnd: i.periodEnd, amount: i.amount, status: i.status, issued: i.issued, due: i.due, paidAt: i.paidAt, method: i.method, ref: i.ref }));
  const accounts = readAccounts_().filter(a => a.active).sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
    .map(a => ({ type: a.type, bank: a.bank, name: a.name, number: a.number, branch: a.branch, isDefault: a.isDefault, note: a.note }));
  return {
    success: true, org: { id: o.id, name: o.name, logo: o.logo || '', cycle: o.cycle, status: o.status },
    plan: plan ? { id: plan.id, name: plan.name, priceMonthly: plan.priceMonthly, priceYearly: plan.priceYearly } : null,
    access: orgAccessDto_(orgAccess_(o.id)), limits: lim, usage: { users: counts.users[o.id] || 0, staff: counts.staff[o.id] || 0 },
    invoices: invoices, accounts: accounts, salesPhone: prop_('SALES_PHONE'), salesEmail: prop_('SALES_EMAIL')
  };
}
function orgLimits_(o, plan) {
  return { users: o.maxUsers || (plan ? plan.maxUsers : 0), staff: o.maxStaff || (plan ? plan.maxStaff : 0) };
}
function orgSeatCheck_(orgId, kind, list) {
  const o = readOrgs_().filter(x => x.id === orgId)[0];
  if (!o) return;
  const lim = orgLimits_(o, readPlans_().filter(p => p.id === o.plan)[0]);
  if (kind === 'participants') {
    const n = (list || readParticipants_(true)).filter(p => p.org === orgId).length;
    if (lim.users && n >= lim.users) fail_('LIMIT', `แพลนขององค์กรรองรับผู้ใช้สิทธิ์สูงสุด ${lim.users} คน (มีแล้ว ${n} คน) — อัปเกรดแพลนเพื่อเพิ่ม`);
  } else {
    const n = (list || readStaff_()).filter(s => s.org === orgId && s.status === 'active').length;
    if (lim.staff && n >= lim.staff) fail_('LIMIT', `แพลนขององค์กรรองรับเจ้าหน้าที่สูงสุด ${lim.staff} บัญชี (ใช้งานอยู่ ${n} บัญชี) — อัปเกรดแพลนเพื่อเพิ่ม`);
  }
}

// ---------- หน้าแพ็กเกจ (สาธารณะ) ----------
function billingPublic_(req) {
  const cache = CacheService.getScriptCache(), hit = cache.get('bill:public');
  if (hit) return JSON.parse(hit);
  const plans = readPlans_().filter(p => p.active && p.public).map(p => ({ id: p.id, name: p.name, tagline: p.tagline, priceMonthly: p.priceMonthly, priceYearly: p.priceYearly,
    maxUsers: p.maxUsers, maxStaff: p.maxStaff, features: p.features, highlight: p.highlight, trialDays: p.trialDays, setupFee: p.setupFee, fromPrice: p.fromPrice }));
  const accounts = readAccounts_().filter(a => a.active).sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
    .map(a => ({ type: a.type, bank: a.bank, name: a.name, number: a.number, branch: a.branch, isDefault: a.isDefault }));
  const out = { success: true, plans: plans, accounts: accounts, trialDays: DEFAULT_TRIAL_DAYS, contact: { email: prop_('SALES_EMAIL'), phone: prop_('SALES_PHONE'), line: prop_('SALES_LINE') } };
  try { cache.put('bill:public', JSON.stringify(out), 300); } catch (e) {}
  return out;
}

// ---------- Dev console ----------
function handleDev_(req, staff, ua) {
  switch (req.action) {
    case 'dev.overview': return devOverview_();
    case 'dev.orgs.list': return devOrgsList_();
    case 'dev.orgs.save': return devLocked_(() => devOrgSave_(req, staff, ua));
    case 'dev.orgs.trial': return devLocked_(() => devOrgTrial_(req, staff, ua));
    case 'dev.orgs.status': return devLocked_(() => devOrgStatus_(req, staff, ua));
    case 'dev.orgs.delete': return devLocked_(() => devOrgDelete_(req, staff, ua));
    case 'dev.plans.list': return { success: true, plans: readPlans_().map(stripRow_) };
    case 'dev.plans.save': return devLocked_(() => devPlanSave_(req, staff, ua));
    case 'dev.accounts.list': return { success: true, accounts: readAccounts_().map(stripRow_) };
    case 'dev.accounts.save': return devLocked_(() => devAccountSave_(req, staff, ua));
    case 'dev.accounts.delete': return devLocked_(() => devAccountDelete_(req, staff, ua));
    case 'dev.invoices.list': return devInvoicesList_(req);
    case 'dev.invoices.create': return devLocked_(() => devInvoiceCreate_(req, staff, ua));
    case 'dev.invoices.pay': return devLocked_(() => devInvoicePay_(req, staff, ua));
    case 'dev.invoices.void': return devLocked_(() => devInvoiceVoid_(req, staff, ua));
    case 'dev.users.list': return devUsersList_();
    case 'dev.users.assign': return devLocked_(() => devUsersAssign_(req, staff, ua));
    case 'dev.staff.role': return devLocked_(() => devStaffRole_(req, staff, ua));
  }
  fail_('INVALID', 'ไม่รู้จักคำสั่ง: ' + req.action);
}
function devLocked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { const out = fn(); billGen_(); try { CacheService.getScriptCache().remove('bill:public'); } catch (e) {} return out; }
  finally { lock.releaseLock(); }
}
const stripRow_ = x => { const o = Object.assign({}, x); delete o.row; return o; };
const who_ = s => s.email || s.name;
function newId_(prefix) { return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase(); }
function dateArg_(v) { if (!v) return null; const d = /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? new Date(v + 'T00:00:00+07:00') : new Date(Number(v)); return isNaN(d) ? null : d; }
function endOfDay_(d) { return new Date(new Date(fmtDate_(d) + 'T23:59:59+07:00').getTime()); }
function addMonths_(t, n) {
  const d = new Date(t + 7 * 3600000); const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const dim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, dim));
  return d.getTime() - 7 * 3600000;
}
const monthlyOf_ = (plan, cycle) => !plan ? 0 : cycle === 'yearly' ? (plan.priceYearly || plan.priceMonthly * 12) / 12 : plan.priceMonthly;

function orgCounts_() {
  const users = {}, staff = {};
  readParticipants_(true).forEach(p => { const k = p.org || ''; users[k] = (users[k] || 0) + 1; });
  readStaff_().forEach(s => { const k = s.org || ''; if (s.status === 'active') staff[k] = (staff[k] || 0) + 1; });
  return { users, staff };
}
function orgDto_(o, plans, counts, now) {
  const plan = plans.filter(p => p.id === o.plan)[0] || null;
  const acc = orgState_(o, plan, now);
  const lim = orgLimits_(o, plan);
  return Object.assign(stripRow_(o), {
    planName: plan ? plan.name : (o.plan || '-'), access: orgAccessDto_(acc), limits: lim,
    users: counts.users[o.id] || 0, staffCount: counts.staff[o.id] || 0, mrr: o.status === 'active' || o.status === 'past_due' ? Math.round(monthlyOf_(plan, o.cycle)) : 0
  });
}

function devOverview_() {
  const now = Date.now(), plans = readPlans_(), orgs = readOrgs_(), inv = readInvoices_(), counts = orgCounts_();
  const list = orgs.map(o => orgDto_(o, plans, counts, now));
  const byStatus = {};
  ORG_STATUSES.forEach(s => { byStatus[s] = 0; });
  list.forEach(o => { byStatus[o.status]++; });
  const month = fmtDate_(new Date(now)).slice(0, 7);
  const paidMonth = inv.filter(i => i.status === 'paid' && i.paidAt && fmtDate_(new Date(i.paidAt)).slice(0, 7) === month).reduce((a, i) => a + i.amount, 0);
  const unpaid = inv.filter(i => i.status === 'pending');
  // รายได้ 6 เดือนล่าสุด (ชำระแล้ว)
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(fmtDate_(new Date(addMonths_(now, -i))).slice(0, 7));
  const revenue = months.map(m => ({ month: m, amount: inv.filter(i => i.status === 'paid' && i.paidAt && fmtDate_(new Date(i.paidAt)).slice(0, 7) === m).reduce((a, i) => a + i.amount, 0) }));
  return {
    success: true, generatedAt: now,
    totals: { orgs: list.length, byStatus: byStatus, mrr: list.reduce((a, o) => a + o.mrr, 0), arr: list.reduce((a, o) => a + o.mrr, 0) * 12,
      paidMonth: paidMonth, unpaidCount: unpaid.length, unpaidAmount: unpaid.reduce((a, i) => a + i.amount, 0),
      users: Object.keys(counts.users).reduce((a, k) => a + counts.users[k], 0), unassignedUsers: counts.users[''] || 0 },
    trialsEnding: list.filter(o => o.access && o.access.state === 'trial' && o.access.daysLeft <= 7).sort((a, b) => a.access.daysLeft - b.access.daysLeft).slice(0, 8),
    attention: list.filter(o => o.access && (o.access.state === 'past_due' || o.access.state === 'expired' || o.access.state === 'trial_expired')).slice(0, 8),
    revenue: revenue,
    plans: plans.filter(p => p.active).map(p => ({ id: p.id, name: p.name, orgs: list.filter(o => o.plan === p.id && ['trial', 'active', 'past_due'].indexOf(o.status) !== -1).length }))
  };
}
function devOrgsList_() {
  const now = Date.now(), plans = readPlans_(), counts = orgCounts_();
  return { success: true, orgs: readOrgs_().map(o => orgDto_(o, plans, counts, now)), plans: plans.map(stripRow_), statuses: ORG_STATUSES, unassigned: { users: counts.users[''] || 0, staff: counts.staff[''] || 0 } };
}

function devOrgSave_(req, staff, ua) {
  const o = req.org || {};
  const name = clean_(o.name, 160);
  if (!String(name).trim()) fail_('INVALID', 'กรุณากรอกชื่อบริษัท/องค์กร');
  const plans = readPlans_();
  const plan = plans.filter(p => p.id === o.plan)[0];
  if (!plan) fail_('INVALID', 'กรุณาเลือกแพลน');
  if (o.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(o.email))) fail_('INVALID', 'อีเมลไม่ถูกต้อง');
  const cycle = BILL_CYCLES.indexOf(o.cycle) === -1 ? 'monthly' : o.cycle;
  const sh = billSheet_(BILL_SHEET.ORGS, BO_HEADERS), all = readOrgs_(), now = new Date();
  const existing = o.id ? all.filter(x => x.id === o.id)[0] : null;
  if (o.id && !existing) fail_('INVALID', 'ไม่พบองค์กรนี้ กรุณารีเฟรช');
  if (all.some(x => x !== existing && x.name.trim().toLowerCase() === String(name).trim().toLowerCase())) fail_('INVALID', 'มีองค์กรชื่อนี้อยู่แล้ว');
  const id = existing ? existing.id : newId_('ORG');
  const row = existing ? existing.row : null;
  const v = new Array(BO_HEADERS.length).fill('');
  if (existing) sh.getRange(row, 1, 1, BO_HEADERS.length).getValues()[0].forEach((x, i) => { v[i] = x; });
  v[BO.ID] = id; v[BO.NAME] = name; v[BO.CONTACT] = clean_(o.contact, 120); v[BO.EMAIL] = clean_(String(o.email || '').toLowerCase(), 160); v[BO.PHONE] = clean_(o.phone, 40);
  v[BO.TAX_ID] = clean_(o.taxId, 30); v[BO.ADDRESS] = clean_(o.address, 400); v[BO.PLAN] = plan.id; v[BO.CYCLE] = cycle;
  v[BO.MAX_USERS] = int_(o.maxUsers) || ''; v[BO.MAX_STAFF] = int_(o.maxStaff) || ''; v[BO.NOTE] = clean_(o.note, 500);
  v[BO.UPDATED_AT] = now; v[BO.UPDATED_BY] = who_(staff);
  // โลโก้องค์กร (แสดงคู่กับชื่อแอปของผู้ใช้ในองค์กร) — อัปโหลดใหม่ / ลบ
  if (o.logo && o.logo.data) {
    const drive = saveNamedImage_('LOGO_' + id, o.logo); // ไฟล์ต้นฉบับเก็บใน Drive
    const small = String(o.logo.small || '');
    v[BO.LOGO] = small && small.length <= LOGO_INLINE_MAX && /^[A-Za-z0-9+/=]+$/.test(small) ? 'data:image/png;base64,' + small : drive;
  }
  else if (o.removeLogo) v[BO.LOGO] = '';
  if (!existing) {
    // องค์กรใหม่: เริ่มทดลองใช้ฟรีทันที (ตามวันทดลองของแพลน) หรือเริ่มใช้งานจริงถ้าเลือก
    const days = o.trialDays !== undefined && o.trialDays !== '' ? Math.max(0, Math.min(365, Math.floor(Number(o.trialDays) || 0))) : plan.trialDays;
    v[BO.CREATED_AT] = now;
    if (o.startActive || !days) {
      v[BO.STATUS] = 'active'; v[BO.PERIOD_START] = now; v[BO.PERIOD_END] = endOfDay_(new Date(addMonths_(now.getTime(), cycle === 'yearly' ? 12 : 1)));
    } else {
      v[BO.STATUS] = 'trial'; v[BO.TRIAL_START] = now; v[BO.TRIAL_END] = endOfDay_(new Date(now.getTime() + days * DAY_MS_));
    }
    sh.appendRow(v);
  } else {
    sh.getRange(row, 1, 1, BO_HEADERS.length).setValues([v]);
  }
  log_(staff, existing ? 'dev.org.update' : 'dev.org.create', id + ' ' + name, { plan: plan.id, cycle: cycle, status: v[BO.STATUS] }, ua);
  return { success: true, id: id };
}

function devOrgTrial_(req, staff, ua) {
  const o = readOrgs_().filter(x => x.id === req.id)[0];
  if (!o) fail_('INVALID', 'ไม่พบองค์กรนี้');
  const days = Math.floor(Number(req.days));
  if (!(days >= 1 && days <= 365)) fail_('INVALID', 'จำนวนวันต้องอยู่ระหว่าง 1–365');
  const sh = billSheet_(BILL_SHEET.ORGS, BO_HEADERS), now = Date.now();
  // ขยาย: ต่อจากวันสิ้นสุดเดิม (ถ้ายังไม่หมด) · เริ่มใหม่: นับจากวันนี้
  const from = req.mode === 'extend' && o.status === 'trial' && o.trialEnd && o.trialEnd > now ? o.trialEnd : now;
  const end = endOfDay_(new Date(from + days * DAY_MS_));
  sh.getRange(o.row, BO.STATUS + 1).setValue('trial');
  if (!o.trialStart || req.mode !== 'extend') sh.getRange(o.row, BO.TRIAL_START + 1).setValue(new Date(now));
  sh.getRange(o.row, BO.TRIAL_END + 1).setValue(end);
  sh.getRange(o.row, BO.UPDATED_AT + 1, 1, 2).setValues([[new Date(), who_(staff)]]);
  log_(staff, 'dev.org.trial', o.id + ' ' + o.name, { mode: req.mode === 'extend' ? 'extend' : 'start', days: days, until: fmtDate_(end) }, ua);
  return { success: true, trialEnd: end.getTime() };
}

function devOrgStatus_(req, staff, ua) {
  const o = readOrgs_().filter(x => x.id === req.id)[0];
  if (!o) fail_('INVALID', 'ไม่พบองค์กรนี้');
  const status = String(req.status || '');
  if (ORG_STATUSES.indexOf(status) === -1 || status === 'trial') fail_('INVALID', 'สถานะไม่ถูกต้อง');
  if ((status === 'suspended' || status === 'cancelled') && !String(req.reason || '').trim()) fail_('INVALID', 'กรุณาระบุเหตุผล');
  const sh = billSheet_(BILL_SHEET.ORGS, BO_HEADERS), now = Date.now();
  sh.getRange(o.row, BO.STATUS + 1).setValue(status);
  // เปิดใช้งาน (active) ครั้งแรก/หลังหมดรอบ: เริ่มรอบบิลใหม่จากวันนี้
  if (status === 'active' && (!o.periodEnd || o.periodEnd < now) && req.newPeriod !== false) {
    sh.getRange(o.row, BO.PERIOD_START + 1, 1, 2).setValues([[new Date(now), endOfDay_(new Date(addMonths_(now, o.cycle === 'yearly' ? 12 : 1)))]]);
  }
  if (req.reason) sh.getRange(o.row, BO.NOTE + 1).setValue(clean_((o.note ? o.note + '\n' : '') + fmtDate_(new Date(now)) + ' ' + ORG_STATUS_TH[status] + ': ' + req.reason, 500));
  sh.getRange(o.row, BO.UPDATED_AT + 1, 1, 2).setValues([[new Date(), who_(staff)]]);
  log_(staff, 'dev.org.status', o.id + ' ' + o.name, { status: [o.status, status], reason: clean_(req.reason, 200) }, ua);
  return { success: true };
}

function devOrgDelete_(req, staff, ua) {
  const o = readOrgs_().filter(x => x.id === req.id)[0];
  if (!o) fail_('INVALID', 'ไม่พบองค์กรนี้');
  const c = orgCounts_();
  if ((c.users[o.id] || 0) || readStaff_().some(s => s.org === o.id)) fail_('INVALID', 'ยังมีผู้ใช้สิทธิ์หรือเจ้าหน้าที่อยู่ในองค์กรนี้ — ย้ายออกก่อน หรือเปลี่ยนสถานะเป็น "ยกเลิก" แทน');
  if (readInvoices_().some(i => i.org === o.id)) fail_('INVALID', 'องค์กรนี้มีประวัติใบแจ้งหนี้ — เปลี่ยนสถานะเป็น "ยกเลิก" แทนการลบ');
  billSheet_(BILL_SHEET.ORGS, BO_HEADERS).deleteRow(o.row);
  log_(staff, 'dev.org.delete', o.id + ' ' + o.name, '', ua);
  return { success: true };
}

function devPlanSave_(req, staff, ua) {
  const p = req.plan || {};
  const id = String(p.id || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,23}$/.test(id)) fail_('INVALID', 'รหัสแพลนใช้ a-z, 0-9, - หรือ _ (2–24 ตัว)');
  if (!String(p.name || '').trim()) fail_('INVALID', 'กรุณากรอกชื่อแพลน');
  const sh = billSheet_(BILL_SHEET.PLANS, BP_HEADERS), all = readPlans_();
  const existing = all.filter(x => x.id === id)[0];
  if (p.isNew && existing) fail_('INVALID', 'มีแพลนรหัส ' + id + ' อยู่แล้ว');
  const features = (Array.isArray(p.features) ? p.features : String(p.features || '').split('\n')).map(s => String(s).trim().slice(0, 120)).filter(Boolean).slice(0, 20).join('\n');
  const v = [id, clean_(p.name, 60), clean_(p.tagline, 160), money_(p.priceMonthly), money_(p.priceYearly), int_(p.maxUsers), int_(p.maxStaff), clean_(features, 2600),
    !!p.highlight, p.public !== false, Number(p.order) || (existing ? existing.order : all.length + 1), p.active !== false,
    p.trialDays === '' || p.trialDays === undefined ? DEFAULT_TRIAL_DAYS : Math.max(0, Math.min(365, Math.floor(Number(p.trialDays) || 0))), new Date(),
    money_(p.setupFee), !!p.fromPrice];
  if (existing) sh.getRange(existing.row, 1, 1, v.length).setValues([v]); else sh.appendRow(v);
  log_(staff, existing ? 'dev.plan.update' : 'dev.plan.create', id + ' ' + p.name, { monthly: v[BP.PRICE_M], yearly: v[BP.PRICE_Y], public: v[BP.PUBLIC], active: v[BP.ACTIVE] }, ua);
  return { success: true, id: id };
}

function devAccountSave_(req, staff, ua) {
  const a = req.account || {};
  if (ACCOUNT_TYPES.indexOf(a.type) === -1) fail_('INVALID', 'กรุณาเลือกประเภทบัญชี');
  if (!String(a.name || '').trim() || !String(a.number || '').trim()) fail_('INVALID', 'กรุณากรอกชื่อบัญชีและเลขบัญชี/พร้อมเพย์');
  if (a.type === 'promptpay' && !/^(\d{10}|\d{13}|\d{15})$/.test(String(a.number).replace(/[\s-]/g, ''))) fail_('INVALID', 'พร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขประจำตัว 13 หลัก');
  const sh = billSheet_(BILL_SHEET.ACCOUNTS, BA_HEADERS), all = readAccounts_();
  const existing = a.id ? all.filter(x => x.id === a.id)[0] : null;
  if (a.id && !existing) fail_('INVALID', 'ไม่พบบัญชีนี้');
  const id = existing ? existing.id : newId_('ACC');
  const isDefault = !!a.isDefault || !all.some(x => x.isDefault && x !== existing);
  if (isDefault) all.forEach(x => { if (x !== existing && x.isDefault) sh.getRange(x.row, BA.DEFAULT + 1).setValue(false); });
  const v = [id, a.type, clean_(a.bank, 80), clean_(a.name, 120), clean_(String(a.number).trim(), 40), clean_(a.branch, 80), isDefault, a.active !== false, clean_(a.note, 200), new Date()];
  if (existing) sh.getRange(existing.row, 1, 1, v.length).setValues([v]); else sh.appendRow(v);
  log_(staff, existing ? 'dev.account.update' : 'dev.account.create', id + ' ' + a.bank + ' ' + String(a.number).slice(-4), { type: a.type, default: isDefault }, ua);
  return { success: true, id: id };
}
function devAccountDelete_(req, staff, ua) {
  const a = readAccounts_().filter(x => x.id === req.id)[0];
  if (!a) fail_('INVALID', 'ไม่พบบัญชีนี้');
  billSheet_(BILL_SHEET.ACCOUNTS, BA_HEADERS).deleteRow(a.row);
  log_(staff, 'dev.account.delete', a.id + ' ' + a.bank + ' ' + a.number.slice(-4), '', ua);
  return { success: true };
}

function devInvoicesList_(req) {
  const orgs = {}, now = Date.now();
  readOrgs_().forEach(o => { orgs[o.id] = o.name; });
  const plans = {};
  readPlans_().forEach(p => { plans[p.id] = p.name; });
  const list = readInvoices_().filter(i => !req.org || i.org === req.org).map(i => Object.assign(stripRow_(i), {
    orgName: orgs[i.org] || i.org, planName: plans[i.plan] || i.plan, overdue: i.status === 'pending' && i.due && i.due < now
  })).sort((a, b) => (b.issued || 0) - (a.issued || 0));
  return { success: true, invoices: list, accounts: readAccounts_().filter(a => a.active).map(stripRow_) };
}

function devInvoiceCreate_(req, staff, ua) {
  const o = readOrgs_().filter(x => x.id === req.org)[0];
  if (!o) fail_('INVALID', 'กรุณาเลือกองค์กร');
  const plan = readPlans_().filter(p => p.id === (req.plan || o.plan))[0];
  if (!plan) fail_('INVALID', 'ไม่พบแพลน');
  const cycle = BILL_CYCLES.indexOf(req.cycle) === -1 ? o.cycle : req.cycle;
  const now = Date.now();
  // รอบถัดไป: ต่อจากสิ้นสุดรอบเดิม (ถ้ายังไม่หมด) ไม่งั้นเริ่มวันนี้
  const startT = dateArg_(req.periodStart) ? dateArg_(req.periodStart).getTime() : (o.periodEnd && o.periodEnd > now ? o.periodEnd + 1000 : now);
  const start = new Date(new Date(fmtDate_(new Date(startT)) + 'T00:00:00+07:00').getTime());
  const end = endOfDay_(new Date(addMonths_(start.getTime(), cycle === 'yearly' ? 12 : 1) - DAY_MS_));
  const auto = cycle === 'yearly' ? (plan.priceYearly || plan.priceMonthly * 12) : plan.priceMonthly;
  // รวมค่าติดตั้งครั้งเดียว (ใบแรกขององค์กร) ถ้าเลือก
  const amount = req.amount !== undefined && req.amount !== '' ? money_(req.amount) : auto + (req.withSetup ? plan.setupFee || 0 : 0);
  if (!(amount > 0)) fail_('INVALID', 'กรุณาระบุจำนวนเงิน (แพลนนี้ไม่มีราคาตั้งไว้)');
  const due = dateArg_(req.due) || new Date(now + 7 * DAY_MS_);
  const sh = billSheet_(BILL_SHEET.INVOICES, BI_HEADERS);
  const ym = fmtDate_(new Date(now)).slice(0, 7).replace('-', '');
  const seq = readInvoices_().filter(i => i.id.indexOf('INV' + ym) === 0).length + 1;
  const id = 'INV' + ym + '-' + String(seq).padStart(3, '0');
  sh.appendRow([id, o.id, plan.id, cycle, start, end, amount, 'pending', new Date(now), endOfDay_(due), '', '', '', '', clean_((req.withSetup && plan.setupFee && (req.amount === undefined || req.amount === '') ? 'รวมค่าติดตั้ง ' + plan.setupFee + ' บาท' + (req.note ? ' · ' : '') : '') + (req.note || ''), 300), who_(staff)]);
  log_(staff, 'dev.invoice.create', id + ' ' + o.name, { amount: amount, plan: plan.id, cycle: cycle }, ua);
  return { success: true, id: id };
}

function devInvoicePay_(req, staff, ua) {
  const inv = readInvoices_().filter(i => i.id === req.id)[0];
  if (!inv) fail_('INVALID', 'ไม่พบใบแจ้งหนี้');
  if (inv.status !== 'pending') fail_('INVALID', 'ใบแจ้งหนี้นี้' + (inv.status === 'paid' ? 'ชำระแล้ว' : 'ถูกยกเลิกแล้ว'));
  const acc = req.account ? readAccounts_().filter(a => a.id === req.account)[0] : null;
  const paidAt = dateArg_(req.paidAt) || new Date();
  const sh = billSheet_(BILL_SHEET.INVOICES, BI_HEADERS);
  sh.getRange(inv.row, BI.STATUS + 1, 1, 1).setValue('paid');
  sh.getRange(inv.row, BI.PAID_AT + 1, 1, 4).setValues([[paidAt, acc ? acc.id : '', clean_(req.method || (acc ? acc.bank : ''), 60), clean_(req.ref, 80)]]);
  // ชำระแล้ว → องค์กรใช้งานได้ถึงสิ้นสุดรอบของใบนี้ (ขยายรอบบิล + เปลี่ยนแพลน/รอบตามใบ)
  const o = readOrgs_().filter(x => x.id === inv.org)[0];
  if (o) {
    const osh = billSheet_(BILL_SHEET.ORGS, BO_HEADERS);
    const end = Math.max(o.periodEnd || 0, inv.periodEnd || 0);
    const start = o.periodStart && o.periodEnd && o.periodEnd >= (inv.periodStart || 0) - DAY_MS_ ? o.periodStart : inv.periodStart;
    osh.getRange(o.row, BO.PLAN + 1, 1, 3).setValues([[inv.plan || o.plan, 'active', inv.cycle || o.cycle]]);
    osh.getRange(o.row, BO.PERIOD_START + 1, 1, 2).setValues([[new Date(start || Date.now()), new Date(end)]]);
    osh.getRange(o.row, BO.UPDATED_AT + 1, 1, 2).setValues([[new Date(), who_(staff)]]);
  }
  log_(staff, 'dev.invoice.paid', inv.id + (o ? ' ' + o.name : ''), { amount: inv.amount, account: acc ? acc.bank + ' ' + acc.number.slice(-4) : '', ref: clean_(req.ref, 80) }, ua);
  return { success: true };
}
function devInvoiceVoid_(req, staff, ua) {
  const inv = readInvoices_().filter(i => i.id === req.id)[0];
  if (!inv) fail_('INVALID', 'ไม่พบใบแจ้งหนี้');
  if (inv.status === 'paid') fail_('INVALID', 'ใบแจ้งหนี้ที่ชำระแล้วยกเลิกไม่ได้');
  const sh = billSheet_(BILL_SHEET.INVOICES, BI_HEADERS);
  sh.getRange(inv.row, BI.STATUS + 1).setValue('void');
  if (req.reason) sh.getRange(inv.row, BI.NOTE + 1).setValue(clean_((inv.note ? inv.note + ' · ' : '') + 'ยกเลิก: ' + req.reason, 300));
  log_(staff, 'dev.invoice.void', inv.id, { reason: clean_(req.reason, 200) }, ua);
  return { success: true };
}

// ผู้ใช้ทั้งระบบ: เจ้าหน้าที่ (บทบาท/องค์กร) + ผู้ใช้สิทธิ์ (องค์กร)
function devUsersList_() {
  const orgs = readOrgs_().map(o => ({ id: o.id, name: o.name }));
  const staff = readStaff_().map(s => ({ id: s.id, name: s.name, email: s.email, picture: s.picture, role: s.role, status: s.status, org: s.org, lastLoginAt: s.lastLoginAt ? s.lastLoginAt.getTime() : null }));
  const participants = readParticipants_(true).map(p => ({ id: p.id, name: p.name, site: p.site, active: p.active, org: p.org }));
  return { success: true, orgs: orgs, staff: staff, participants: participants, roles: ROLES };
}
function devUsersAssign_(req, staff, ua) {
  const kind = req.kind === 'staff' ? 'staff' : 'participants';
  const ids = (Array.isArray(req.ids) ? req.ids : []).map(String).slice(0, 2000);
  if (!ids.length) fail_('INVALID', 'กรุณาเลือกผู้ใช้');
  const org = String(req.org || '').trim();
  if (org && !readOrgs_().some(o => o.id === org)) fail_('INVALID', 'ไม่พบองค์กร');
  let n = 0;
  if (kind === 'staff') {
    const sh = sheet_(SHEET.STAFF);
    readStaff_().forEach(s => { if (ids.indexOf(s.id) !== -1 && s.org !== org) { sh.getRange(s.row, SCOL.ORG + 1).setValue(org); n++; } });
    clearStaffCache_();
  } else {
    const sh = sheet_(SHEET.USERS), set = {};
    ids.forEach(i => { set[i.toUpperCase()] = true; });
    const list = readParticipants_(true);
    if (org) {
      const o = readOrgs_().filter(x => x.id === org)[0], lim = orgLimits_(o, readPlans_().filter(p => p.id === o.plan)[0]);
      const after = list.filter(p => p.org === org || set[p.id]).length;
      if (lim.users && after > lim.users && !req.force) fail_('LIMIT', `แพลนขององค์กรรองรับผู้ใช้สิทธิ์สูงสุด ${lim.users} คน (ถ้าย้ายจะมี ${after} คน)`);
    }
    list.forEach(p => { if (set[p.id] && p.org !== org) { sh.getRange(p.row, UCOL.ORG + 1).setValue(org); n++; } });
  }
  log_(staff, 'dev.users.assign', kind + ' → ' + (org || 'ไม่ผูกองค์กร'), { count: n }, ua);
  return { success: true, changed: n };
}
function devStaffRole_(req, staff, ua) {
  const all = readStaff_(), target = all.filter(s => s.id === req.id)[0];
  if (!target) fail_('INVALID', 'ไม่พบบัญชีนี้');
  const role = String(req.role || '');
  if (ROLES.indexOf(role) === -1 || role === 'pending') fail_('INVALID', 'บทบาทไม่ถูกต้อง');
  if (target.id === staff.id && role !== 'dev') fail_('INVALID', 'ไม่สามารถลดบทบาท Dev ของตัวเองได้');
  if (target.role === 'dev' && role !== 'dev' && all.filter(s => isDev_(s)).length <= 1) fail_('INVALID', 'ต้องมีบัญชี Dev อย่างน้อย 1 บัญชี');
  const perms = role === 'admin' || role === 'dev' ? PERMS.slice() : (ROLE_PRESETS[role] || []).filter(p => p !== 'admin');
  sheet_(SHEET.STAFF).getRange(target.row, SCOL.ROLE + 1, 1, 3).setValues([[role, perms.join(','), target.status === 'pending' ? 'active' : target.status]]);
  clearStaffCache_();
  log_(staff, 'dev.staff.role', target.email || target.name, { role: [target.role, role] }, ua);
  return { success: true };
}
