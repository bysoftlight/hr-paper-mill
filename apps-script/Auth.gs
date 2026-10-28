// Auth.gs — เข้าสู่ระบบของเจ้าหน้าที่ด้วย Google หรือ LINE, session token และสิทธิ์
// บัญชีใหม่ทุกบัญชีมีสถานะ "pending" (ยังไม่มีสิทธิ์) จนกว่า Admin จะอนุมัติ
// ยกเว้นอีเมลที่อยู่ใน Script Property ADMIN_EMAILS ซึ่งจะเป็น Admin ตั้งแต่ครั้งแรก (ใช้ตั้งต้นระบบ)

// จดจำการเข้าสู่ระบบ: token มีอายุ SESSION_DAYS วัน (ตั้งได้ด้วย Script Property) และต่ออายุให้อัตโนมัติทุกครั้งที่เปิดเว็บ
// จึงไม่ต้องเข้าสู่ระบบใหม่ เว้นแต่กดออกจากระบบเอง ไม่ได้เปิดใช้นานเกินกำหนด หรือ Admin บังคับออก/ระงับบัญชี (มีผลทันที)
const DEFAULT_SESSION_DAYS = 90;
function sessionMs_() {
  const days = Number(prop_('SESSION_DAYS', DEFAULT_SESSION_DAYS));
  return (days > 0 ? Math.min(days, 365) : DEFAULT_SESSION_DAYS) * 86400000;
}

const PERMS = ['records.view', 'records.edit', 'participants.view', 'participants.edit', 'export', 'admin'];
const ROLE_PRESETS = {
  viewer: ['records.view', 'participants.view'],
  editor: ['records.view', 'records.edit', 'participants.view', 'participants.edit', 'export'],
  admin: PERMS.slice()
};
const ROLES = ['pending', 'viewer', 'editor', 'admin'];
const STAFF_STATUSES = ['pending', 'active', 'suspended', 'rejected'];

// --- ตรวจตัวตนกับผู้ให้บริการ ---
function verifyGoogle_(credential) {
  const clientId = prop_('GOOGLE_CLIENT_ID');
  if (!clientId) fail_('CONFIG', 'ระบบยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID');
  if (!credential) fail_('INVALID', 'ไม่พบข้อมูลการเข้าสู่ระบบจาก Google');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) fail_('AUTH', 'ยืนยันตัวตนกับ Google ไม่สำเร็จ กรุณาลองใหม่');
  const info = JSON.parse(res.getContentText());
  if (info.aud !== clientId) fail_('AUTH', 'Token ไม่ได้ออกให้ระบบนี้');
  if (['accounts.google.com', 'https://accounts.google.com'].indexOf(info.iss) === -1) fail_('AUTH', 'ผู้ออก Token ไม่ถูกต้อง');
  if (String(info.email_verified) !== 'true') fail_('AUTH', 'อีเมล Google ยังไม่ได้ยืนยัน');
  if (Number(info.exp) * 1000 < Date.now()) fail_('AUTH', 'Token หมดอายุ กรุณาเข้าสู่ระบบใหม่');
  return { provider: 'google', sub: String(info.sub), email: String(info.email || '').toLowerCase(), name: info.name || info.email, picture: info.picture || '' };
}

function verifyLine_(code, codeVerifier, redirectUri) {
  const channelId = prop_('LINE_CHANNEL_ID'), channelSecret = prop_('LINE_CHANNEL_SECRET');
  if (!channelId || !channelSecret) fail_('CONFIG', 'ระบบยังไม่ได้ตั้งค่า LINE_CHANNEL_ID / LINE_CHANNEL_SECRET');
  const allowed = prop_('LINE_REDIRECT_URIS', 'https://bysoftlight.github.io/hr-paper-mill/staff.html').split(',').map(s => s.trim());
  if (allowed.indexOf(redirectUri) === -1) fail_('AUTH', 'Redirect URI ไม่ได้รับอนุญาต');
  if (!code || !codeVerifier) fail_('INVALID', 'ไม่พบข้อมูลการเข้าสู่ระบบจาก LINE');

  const tokenRes = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'authorization_code', code: code, redirect_uri: redirectUri, client_id: channelId, client_secret: channelSecret, code_verifier: codeVerifier }
  });
  if (tokenRes.getResponseCode() !== 200) fail_('AUTH', 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ กรุณาลองใหม่');
  const idToken = JSON.parse(tokenRes.getContentText()).id_token;

  const verifyRes = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post', muteHttpExceptions: true, payload: { id_token: idToken, client_id: channelId }
  });
  if (verifyRes.getResponseCode() !== 200) fail_('AUTH', 'ตรวจสอบ Token ของ LINE ไม่ผ่าน');
  const info = JSON.parse(verifyRes.getContentText());
  return { provider: 'line', sub: String(info.sub), email: String(info.email || '').toLowerCase(), name: info.name || 'ผู้ใช้ LINE', picture: info.picture || '' };
}

// --- บัญชีเจ้าหน้าที่ ---
function rowToStaff_(r, row) {
  const role = ROLES.indexOf(r[SCOL.ROLE]) === -1 ? 'pending' : r[SCOL.ROLE];
  const stored = String(r[SCOL.PERMS] || '').split(',').map(s => s.trim()).filter(p => PERMS.indexOf(p) !== -1);
  return {
    row: row, id: String(r[SCOL.ID]), provider: r[SCOL.PROVIDER], sub: String(r[SCOL.SUB]), email: r[SCOL.EMAIL], name: r[SCOL.NAME],
    picture: r[SCOL.PICTURE], role: role, permissions: stored.length ? stored : (ROLE_PRESETS[role] || []),
    status: STAFF_STATUSES.indexOf(r[SCOL.STATUS]) === -1 ? 'pending' : r[SCOL.STATUS],
    tokenVersion: Number(r[SCOL.TOKEN_VER]) || 1,
    createdAt: toDate_(r[SCOL.CREATED_AT]), lastLoginAt: toDate_(r[SCOL.LAST_LOGIN]),
    approvedBy: r[SCOL.APPROVED_BY], approvedAt: toDate_(r[SCOL.APPROVED_AT]), note: r[SCOL.NOTE]
  };
}

function readStaff_() {
  return readRows_(SHEET.STAFF, S_HEADERS.length).map((r, i) => rowToStaff_(r, i + 2)).filter(s => s.id);
}

function findStaffById_(id) {
  return readStaff_().filter(s => s.id === id)[0] || null;
}

// ใช้ตอนตรวจ token ทุกคำขอ: เก็บแถวของบัญชีไว้ใน Cache 2 นาที ไม่ต้องเปิดแผ่นงาน Staff ทุกครั้ง
// ทุกครั้งที่แก้แผ่นงาน Staff ผ่านระบบ ให้เรียก clearStaffCache_() (สิทธิ์/การระงับจึงมีผลทันที)
const STAFF_CACHE_TTL_ = 120;
function staffCacheGen_() {
  const cache = CacheService.getScriptCache();
  let gen = cache.get('staff:gen');
  if (!gen) { gen = String(Date.now()); cache.put('staff:gen', gen, 21600); }
  return gen;
}
function clearStaffCache_() {
  try { CacheService.getScriptCache().put('staff:gen', String(Date.now()) + Math.random().toString(36).slice(2, 6), 21600); } catch (e) { console.warn('ล้าง cache ไม่สำเร็จ: ' + e); }
}
function findStaffByIdCached_(id) {
  let cache, key;
  try {
    cache = CacheService.getScriptCache();
    key = 'staff:' + staffCacheGen_() + ':' + id;
    const hit = cache.get(key);
    if (hit) { const c = JSON.parse(hit); return rowToStaff_(c.r, c.row); }
  } catch (e) { cache = null; }
  const sh = sheet_(SHEET.STAFF);
  const last = sh.getLastRow();
  if (last < 2) return null;
  const rows = sh.getRange(2, 1, last - 1, S_HEADERS.length).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][SCOL.ID] !== id) continue;
    if (cache) { try { cache.put(key, JSON.stringify({ r: rows[i], row: i + 2 }), STAFF_CACHE_TTL_); } catch (e) {} }
    return rowToStaff_(rows[i], i + 2);
  }
  return null;
}

// สิทธิ์ที่ใช้งานได้จริง: ต้องเป็นบัญชี active เท่านั้น, Admin ได้ทุกสิทธิ์
function effectivePerms_(staff) {
  if (!staff || staff.status !== 'active' || staff.role === 'pending') return [];
  if (staff.role === 'admin') return PERMS.slice();
  return staff.permissions.filter(p => p !== 'admin');
}

function can_(staff, perm) {
  return effectivePerms_(staff).indexOf(perm) !== -1;
}

function requirePerm_(staff, perm) {
  if (staff.status === 'pending') fail_('PENDING', 'บัญชีของคุณยังรอการอนุมัติจากผู้ดูแลระบบ');
  if (staff.status !== 'active') fail_('FORBIDDEN', 'บัญชีของคุณถูกระงับการใช้งาน');
  if (!can_(staff, perm)) fail_('FORBIDDEN', 'คุณไม่มีสิทธิ์ทำรายการนี้ กรุณาติดต่อผู้ดูแลระบบ');
}

// ข้อมูลบัญชีที่ส่งให้หน้าเว็บ
function staffDto_(s) {
  return {
    id: s.id, provider: s.provider, email: s.email, name: s.name, picture: s.picture, role: s.role,
    permissions: effectivePerms_(s), storedPermissions: s.permissions, status: s.status,
    createdAt: s.createdAt ? s.createdAt.getTime() : null, lastLoginAt: s.lastLoginAt ? s.lastLoginAt.getTime() : null,
    approvedBy: s.approvedBy || '', approvedAt: s.approvedAt ? s.approvedAt.getTime() : null, note: s.note || ''
  };
}

// เข้าสู่ระบบ/สมัครอัตโนมัติจากตัวตนที่ยืนยันแล้ว
function loginStaff_(identity, userAgent) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_(SHEET.STAFF);
    const now = new Date();
    let staff = readStaff_().filter(s => s.provider === identity.provider && s.sub === identity.sub)[0];
    if (!staff) {
      const admins = prop_('ADMIN_EMAILS').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      const isBootstrapAdmin = identity.email && admins.indexOf(identity.email) !== -1;
      const id = 'S' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
      const row = new Array(S_HEADERS.length).fill('');
      row[SCOL.ID] = id; row[SCOL.PROVIDER] = identity.provider; row[SCOL.SUB] = identity.sub;
      row[SCOL.EMAIL] = clean_(identity.email, 200); row[SCOL.NAME] = clean_(identity.name, 120); row[SCOL.PICTURE] = clean_(identity.picture, 500);
      row[SCOL.ROLE] = isBootstrapAdmin ? 'admin' : 'pending';
      row[SCOL.STATUS] = isBootstrapAdmin ? 'active' : 'pending';
      row[SCOL.TOKEN_VER] = 1; row[SCOL.CREATED_AT] = now; row[SCOL.LAST_LOGIN] = now;
      if (isBootstrapAdmin) { row[SCOL.APPROVED_BY] = 'ADMIN_EMAILS'; row[SCOL.APPROVED_AT] = now; }
      sh.appendRow(row);
      staff = rowToStaff_(row, sh.getLastRow());
      log_(staff, isBootstrapAdmin ? 'staff.signup_admin' : 'staff.signup', staff.email || staff.name, { provider: identity.provider }, userAgent);
    } else {
      // อัปเดตชื่อ/รูป/อีเมลล่าสุดจากผู้ให้บริการ
      sh.getRange(staff.row, SCOL.EMAIL + 1, 1, 3).setValues([[clean_(identity.email || staff.email, 200), clean_(identity.name, 120), clean_(identity.picture, 500)]]);
      sh.getRange(staff.row, SCOL.LAST_LOGIN + 1).setValue(now);
      staff.email = identity.email || staff.email; staff.name = identity.name; staff.picture = identity.picture; staff.lastLoginAt = now;
      clearStaffCache_();
      log_(staff, 'staff.login', staff.email || staff.name, { provider: identity.provider, status: staff.status }, userAgent);
    }
    return { success: true, token: signToken_(staff), staff: staffDto_(staff) };
  } finally {
    lock.releaseLock();
  }
}

// --- Session token: payload.signature (HMAC-SHA256) ---
function sessionSecret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('SESSION_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('SESSION_SECRET', s); }
  return s;
}

function b64url_(v) {
  return Utilities.base64EncodeWebSafe(v).replace(/=+$/, '');
}

function b64urlDecode_(s) {
  while (s.length % 4) s += '=';
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(s)).getDataAsString();
}

function signToken_(staff) {
  const payload = b64url_(JSON.stringify({ sid: staff.id, tv: staff.tokenVersion, exp: Date.now() + sessionMs_() }));
  const sig = b64url_(Utilities.computeHmacSha256Signature(payload, sessionSecret_()));
  return payload + '.' + sig;
}

// ตรวจ token แล้วคืนบัญชีล่าสุดจากแผ่นงาน (สิทธิ์ที่เปลี่ยน/การระงับมีผลทันที)
function staffFromToken_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) fail_('AUTH', 'กรุณาเข้าสู่ระบบ');
  const expected = b64url_(Utilities.computeHmacSha256Signature(parts[0], sessionSecret_()));
  if (expected !== parts[1]) fail_('AUTH', 'Session ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่');
  let payload;
  try { payload = JSON.parse(b64urlDecode_(parts[0])); } catch (e) { fail_('AUTH', 'Session ไม่ถูกต้อง'); }
  if (!payload.exp || payload.exp < Date.now()) fail_('AUTH', 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
  const staff = findStaffByIdCached_(payload.sid);
  if (!staff) fail_('AUTH', 'ไม่พบบัญชีนี้แล้ว กรุณาเข้าสู่ระบบใหม่');
  if (staff.tokenVersion !== payload.tv) fail_('AUTH', 'Session ถูกยกเลิก กรุณาเข้าสู่ระบบใหม่');
  staff.tokenExp = payload.exp;
  return staff;
}

// token ใหม่ (ต่ออายุ) ถ้า token เดิมออกมานานกว่า 1 วันแล้ว — ใช้ตอนเปิดเว็บ (staff.me)
function renewedToken_(staff) {
  return staff.tokenExp - Date.now() < sessionMs_() - 86400000 ? signToken_(staff) : undefined;
}
