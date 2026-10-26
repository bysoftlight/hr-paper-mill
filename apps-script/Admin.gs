// Admin.gs — จัดการบัญชี/สิทธิ์ของเจ้าหน้าที่ และดู Log (เฉพาะ Admin)

function adminStaffList_() {
  const list = readStaff_().map(staffDto_).sort((a, b) => {
    const order = { pending: 0, active: 1, suspended: 2, rejected: 3 };
    return (order[a.status] - order[b.status]) || ((b.lastLoginAt || 0) - (a.lastLoginAt || 0));
  });
  return { success: true, staff: list, perms: PERMS, roles: ROLES, presets: ROLE_PRESETS };
}

function activeAdmins_(all) {
  return all.filter(s => s.role === 'admin' && s.status === 'active');
}

function adminStaffUpdate_(req, actor, ua) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const all = readStaff_();
    const target = all.filter(s => s.id === req.id)[0];
    if (!target) fail_('INVALID', 'ไม่พบบัญชีนี้');
    const role = req.role !== undefined ? String(req.role) : target.role;
    const status = req.status !== undefined ? String(req.status) : target.status;
    if (ROLES.indexOf(role) === -1) fail_('INVALID', 'บทบาทไม่ถูกต้อง');
    if (STAFF_STATUSES.indexOf(status) === -1) fail_('INVALID', 'สถานะไม่ถูกต้อง');
    if (status === 'active' && role === 'pending') fail_('INVALID', 'กรุณาเลือกบทบาทก่อนอนุมัติ');

    // กันระบบไม่มี Admin เหลืออยู่ และกัน Admin ลดสิทธิ์ตัวเองโดยไม่ตั้งใจ
    const losesAdmin = target.role === 'admin' && target.status === 'active' && (role !== 'admin' || status !== 'active');
    if (losesAdmin && target.id === actor.id) fail_('INVALID', 'ไม่สามารถลดสิทธิ์หรือระงับบัญชีของตัวเองได้');
    if (losesAdmin && activeAdmins_(all).length <= 1) fail_('INVALID', 'ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน');

    let perms = Array.isArray(req.permissions) ? req.permissions.filter(p => PERMS.indexOf(p) !== -1 && p !== 'admin') : target.permissions.filter(p => p !== 'admin');
    if (req.role !== undefined && req.role !== target.role && !Array.isArray(req.permissions)) perms = (ROLE_PRESETS[role] || []).filter(p => p !== 'admin');
    if (role === 'admin') perms = PERMS.slice();

    const sh = sheet_(SHEET.STAFF);
    sh.getRange(target.row, SCOL.ROLE + 1, 1, 3).setValues([[role, perms.join(','), status]]);
    const approving = target.status !== 'active' && status === 'active';
    if (approving) sh.getRange(target.row, SCOL.APPROVED_BY + 1, 1, 2).setValues([[actor.email || actor.name, new Date()]]);
    if (req.note !== undefined) sh.getRange(target.row, SCOL.NOTE + 1).setValue(clean_(req.note, 300));

    const action = approving && target.status === 'pending' ? 'admin.staff.approve'
      : status === 'rejected' && target.status !== 'rejected' ? 'admin.staff.reject'
      : status === 'suspended' && target.status !== 'suspended' ? 'admin.staff.suspend'
      : 'admin.staff.update';
    log_(actor, action, target.email || target.name, {
      role: target.role === role ? role : [target.role, role],
      status: target.status === status ? status : [target.status, status],
      permissions: perms.join(',')
    }, ua);
    return { success: true, staff: staffDto_(findStaffById_(target.id)) };
  } finally {
    lock.releaseLock();
  }
}

// บังคับออกจากระบบทุกอุปกรณ์ (token เดิมใช้ไม่ได้ทันที)
function adminStaffRevoke_(req, actor, ua) {
  const target = findStaffById_(req.id);
  if (!target) fail_('INVALID', 'ไม่พบบัญชีนี้');
  sheet_(SHEET.STAFF).getRange(target.row, SCOL.TOKEN_VER + 1).setValue(target.tokenVersion + 1);
  log_(actor, 'admin.staff.revoke', target.email || target.name, '', ua);
  return { success: true };
}

function adminStaffDelete_(req, actor, ua) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const all = readStaff_();
    const target = all.filter(s => s.id === req.id)[0];
    if (!target) fail_('INVALID', 'ไม่พบบัญชีนี้');
    if (target.id === actor.id) fail_('INVALID', 'ไม่สามารถลบบัญชีของตัวเองได้');
    if (target.role === 'admin' && target.status === 'active' && activeAdmins_(all).length <= 1) fail_('INVALID', 'ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน');
    sheet_(SHEET.STAFF).deleteRow(target.row);
    log_(actor, 'admin.staff.delete', target.email || target.name, { provider: target.provider, role: target.role }, ua);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function adminLogsList_(req) {
  const f = req.filters || {};
  const q = String(f.q || '').trim().toLowerCase();
  const rows = readRows_(SHEET.LOGS, L_HEADERS.length).map(r => {
    const ts = toDate_(r[LCOL.TS]);
    return ts ? {
      ts: ts.getTime(), date: fmtDate_(ts), actorId: String(r[LCOL.ACTOR_ID] || ''), actorName: String(r[LCOL.ACTOR_NAME] || ''),
      actorRole: String(r[LCOL.ACTOR_ROLE] || ''), action: String(r[LCOL.ACTION] || ''), target: String(r[LCOL.TARGET] || ''),
      details: String(r[LCOL.DETAILS] || ''), userAgent: String(r[LCOL.USER_AGENT] || '')
    } : null;
  }).filter(Boolean).filter(l => {
    if (f.from && l.date < f.from) return false;
    if (f.to && l.date > f.to) return false;
    if (f.category && l.action.indexOf(f.category) !== 0) return false;
    if (f.actorId && l.actorId !== f.actorId) return false;
    if (q && (l.actorName + ' ' + l.action + ' ' + l.target + ' ' + l.details).toLowerCase().indexOf(q) === -1) return false;
    return true;
  }).sort((a, b) => b.ts - a.ts);

  const counts = {};
  rows.forEach(l => { const c = l.action.split('.')[0]; counts[c] = (counts[c] || 0) + 1; });
  if (req.all) return { success: true, total: rows.length, rows: rows.slice(0, 20000), counts: counts };
  const pageSize = Math.min(Math.max(Number(req.pageSize) || 50, 10), 200);
  const page = Math.max(Number(req.page) || 1, 1);
  return { success: true, total: rows.length, page: page, pageSize: pageSize, rows: rows.slice((page - 1) * pageSize, page * pageSize), counts: counts };
}
