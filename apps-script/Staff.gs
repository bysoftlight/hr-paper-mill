// Staff.gs — API สำหรับหน้า Dashboard ของเจ้าหน้าที่ (staff.html)
// ทุกคำสั่ง (ยกเว้น config / auth) ต้องมี token และสิทธิ์ตามที่กำหนด

function handleStaffRequest_(req) {
  const ua = String(req.userAgent || '').slice(0, 200);
  switch (req.action) {
    case 'staff.config':
      return {
        success: true,
        googleClientId: prop_('GOOGLE_CLIENT_ID'),
        lineChannelId: prop_('LINE_CHANNEL_ID'),
        agentLimit: AGENT_LIMIT_PER_MONTH,
        anomalyRadius: anomalyRadius_(),
        salesTypes: SALES_TYPES
      };
    case 'staff.auth.google':
      return loginStaff_(verifyGoogle_(req.credential), ua);
    case 'staff.auth.line':
      return loginStaff_(verifyLine_(req.code, req.codeVerifier, req.redirectUri), ua);
  }

  const staff = staffFromToken_(req.token);
  switch (req.action) {
    case 'staff.me':
      return { success: true, staff: staffDto_(staff) };
    case 'staff.logout':
      log_(staff, 'staff.logout', staff.email || staff.name, '', ua);
      return { success: true };
    case 'staff.overview':
      requirePerm_(staff, 'records.view');
      return staffOverview_();
    case 'staff.records.list':
      requirePerm_(staff, 'records.view');
      return staffRecordsList_(req, staff);
    case 'staff.records.latest':
      requirePerm_(staff, 'records.view');
      return staffRecordsLatest_(req.since);
    case 'staff.records.save':
      requirePerm_(staff, 'records.edit');
      return staffRecordSave_(req, staff, ua);
    case 'staff.records.delete':
      requirePerm_(staff, 'records.edit');
      return staffRecordSetStatus_(req, staff, 'deleted', ua);
    case 'staff.records.restore':
      requirePerm_(staff, 'records.edit');
      return staffRecordSetStatus_(req, staff, 'active', ua);
    case 'staff.participants.list':
      requirePerm_(staff, 'participants.view');
      return staffParticipantsList_();
    case 'staff.participants.save':
      requirePerm_(staff, 'participants.edit');
      return staffParticipantSave_(req, staff, ua);
    case 'staff.image':
      requirePerm_(staff, 'records.view');
      return staffImage_(req.fileId, req.thumb);
    case 'staff.export.gsheet':
      requirePerm_(staff, 'export');
      return staffExportGsheet_(req, staff, ua);
    case 'staff.log.client':
      requirePerm_(staff, 'export');
      if (['export.pdf', 'export.xlsx', 'export.logs'].indexOf(req.logAction) === -1) fail_('INVALID', 'ไม่รู้จักการกระทำ');
      log_(staff, req.logAction, req.target || '', req.details || '', ua);
      return { success: true };
    case 'admin.staff.list':
      requirePerm_(staff, 'admin');
      return adminStaffList_();
    case 'admin.staff.update':
      requirePerm_(staff, 'admin');
      return adminStaffUpdate_(req, staff, ua);
    case 'admin.staff.revoke':
      requirePerm_(staff, 'admin');
      return adminStaffRevoke_(req, staff, ua);
    case 'admin.staff.delete':
      requirePerm_(staff, 'admin');
      return adminStaffDelete_(req, staff, ua);
    case 'admin.logs.list':
      requirePerm_(staff, 'admin');
      return adminLogsList_(req);
    default:
      fail_('INVALID', 'ไม่รู้จักคำสั่ง: ' + req.action);
  }
}

// ---------- อ่านข้อมูล ----------
function readParticipants_() {
  return readRows_(SHEET.USERS, U_HEADERS.length).map((r, i) => {
    const id = String(r[UCOL.ID] || '').trim().toUpperCase();
    if (!id) return null;
    const active = r[UCOL.ACTIVE];
    return {
      row: i + 2, id: id, name: String(r[UCOL.NAME] || ''), status: String(r[UCOL.STATUS] || ''),
      pic: toImageUrl_(r[UCOL.PIC]), picRaw: String(r[UCOL.PIC] || ''), site: String(r[UCOL.SITE] || '').trim(),
      siteLat: num_(r[UCOL.SITE_LAT]), siteLng: num_(r[UCOL.SITE_LNG]), phone: String(r[UCOL.PHONE] || ''),
      active: !(active === false || String(active).toUpperCase() === 'FALSE' || active === 0 || String(active) === '0'),
      note: String(r[UCOL.NOTE] || ''), updatedAt: toDate_(r[UCOL.UPDATED_AT]), updatedBy: String(r[UCOL.UPDATED_BY] || '')
    };
  }).filter(Boolean);
}

function readRecords_(participants) {
  const radius = anomalyRadius_();
  const users = {};
  (participants || readParticipants_()).forEach(u => { users[u.id] = u; });
  return readRows_(SHEET.RECORDS, R_HEADERS.length).map((r, i) => {
    const ts = toDate_(r[RCOL.TS], r[RCOL.DATE]);
    if (!ts) return null;
    const userId = String(r[RCOL.USER_ID] || '').trim().toUpperCase();
    const u = users[userId];
    const lat = num_(r[RCOL.LAT]), lng = num_(r[RCOL.LNG]);
    const hasGps = lat !== null && lng !== null;
    const distance = hasGps && u && u.siteLat !== null && u.siteLng !== null ? distanceM_(lat, lng, u.siteLat, u.siteLng) : null;
    return {
      row: i + 2, ts: ts, date: fmtDate_(ts), time: fmtDate_(ts, 'HH:mm'), userId: userId,
      userName: u ? u.name : String(r[RCOL.USER_NAME] || ''), site: u ? u.site : '',
      type: String(r[RCOL.TYPE] || ''), imageRaw: String(r[RCOL.IMAGE] || ''),
      lat: lat, lng: lng, hasGps: hasGps, distance: distance, anomaly: distance !== null && distance > radius,
      note: String(r[RCOL.NOTE] || ''), status: r[RCOL.STATUS] === 'deleted' ? 'deleted' : 'active',
      updatedBy: String(r[RCOL.UPDATED_BY] || ''), updatedAt: toDate_(r[RCOL.UPDATED_AT]), source: String(r[RCOL.SOURCE] || 'app')
    };
  }).filter(Boolean);
}

function recordDto_(r) {
  return {
    row: r.row, ts: r.ts.getTime(), date: r.date, time: r.time, userId: r.userId, userName: r.userName, site: r.site,
    type: r.type, image: toImageUrl_(r.imageRaw), fileId: toFileId_(r.imageRaw), lat: r.lat, lng: r.lng,
    mapUrl: r.hasGps ? 'https://maps.google.com/maps?q=' + r.lat + ',' + r.lng : '', distance: r.distance, anomaly: r.anomaly,
    hasGps: r.hasGps, note: r.note, status: r.status, source: r.source, updatedBy: r.updatedBy,
    updatedAt: r.updatedAt ? r.updatedAt.getTime() : null
  };
}

// ---------- ตัวกรอง ----------
function filterRecords_(records, f) {
  f = f || {};
  const ids = (f.userIds || []).map(s => String(s).toUpperCase());
  const types = f.types || [];
  const sites = f.sites || [];
  const q = String(f.q || '').trim().toLowerCase();
  const status = f.status || 'active';
  return records.filter(r => {
    if (status !== 'all' && r.status !== status) return false;
    if (f.from && r.date < f.from) return false;
    if (f.to && r.date > f.to) return false;
    if (ids.length && ids.indexOf(r.userId) === -1) return false;
    if (types.length && types.indexOf(r.type) === -1) return false;
    if (sites.length && sites.indexOf(r.site || '(ไม่ระบุ)') === -1) return false;
    if (f.location === 'anomaly' && !r.anomaly) return false;
    if (f.location === 'normal' && !(r.hasGps && !r.anomaly)) return false;
    if (f.location === 'nogps' && r.hasGps) return false;
    if (q && (r.userId + ' ' + r.userName + ' ' + r.note + ' ' + r.site).toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
}

function aggregate_(rows) {
  const users = {}, byDay = {}, bySite = {};
  let agent = 0, anomalies = 0, nogps = 0;
  rows.forEach(r => {
    const isAgent = r.type === SALES_TYPES[1];
    if (isAgent) agent++;
    if (r.anomaly) anomalies++;
    if (!r.hasGps) nogps++;
    byDay[r.date] = (byDay[r.date] || 0) + 1;
    const site = r.site || '(ไม่ระบุ)';
    bySite[site] = (bySite[site] || 0) + 1;
    const u = users[r.userId] || (users[r.userId] = { id: r.userId, name: r.userName, site: r.site, count: 0, agent: 0, anomalies: 0, days: {} });
    u.count++; if (isAgent) u.agent++; if (r.anomaly) u.anomalies++; u.days[r.date] = 1;
  });
  const byUser = Object.keys(users).map(k => {
    const u = users[k];
    return { id: u.id, name: u.name, site: u.site, count: u.count, agent: u.agent, anomalies: u.anomalies, days: Object.keys(u.days).length };
  }).sort((a, b) => b.count - a.count);
  return { total: rows.length, users: byUser.length, self: rows.length - agent, agent: agent, anomalies: anomalies, nogps: nogps, byDay: byDay, bySite: bySite, byUser: byUser };
}

function staffRecordsList_(req) {
  const rows = filterRecords_(readRecords_(), req.filters);
  const sort = req.sort || 'ts_desc';
  rows.sort((a, b) => sort === 'ts_asc' ? a.ts - b.ts : sort === 'name' ? a.userName.localeCompare(b.userName, 'th') || b.ts - a.ts : b.ts - a.ts);
  const agg = aggregate_(rows);
  if (req.all) {
    if (rows.length > 20000) fail_('INVALID', 'ข้อมูลมากเกินไป (เกิน 20,000 รายการ) กรุณากรองช่วงเวลาให้แคบลง');
    return { success: true, total: rows.length, rows: rows.map(recordDto_), agg: agg };
  }
  const pageSize = Math.min(Math.max(Number(req.pageSize) || 50, 10), 200);
  const page = Math.max(Number(req.page) || 1, 1);
  return { success: true, total: rows.length, page: page, pageSize: pageSize, rows: rows.slice((page - 1) * pageSize, page * pageSize).map(recordDto_), agg: agg };
}

// สำหรับอัปเดตสด: อ่านเฉพาะท้ายแผ่นงาน (รายการใหม่ต่อท้ายเสมอ)
function staffRecordsLatest_(since) {
  since = Number(since) || 0;
  const sh = sheet_(SHEET.RECORDS);
  const last = sh.getLastRow();
  if (last < 2) return { success: true, count: 0, newest: since };
  const start = Math.max(2, last - 299);
  const data = sh.getRange(start, 1, last - start + 1, R_HEADERS.length).getValues();
  let count = 0, newest = since;
  data.forEach(r => {
    const ts = toDate_(r[RCOL.TS], r[RCOL.DATE]);
    const changed = toDate_(r[RCOL.UPDATED_AT]);
    const t = Math.max(ts ? ts.getTime() : 0, changed ? changed.getTime() : 0);
    if (t > since) { count++; newest = Math.max(newest, t); }
  });
  return { success: true, count: count, newest: newest };
}

// ---------- ภาพรวม ----------
function staffOverview_() {
  const now = new Date();
  const today = fmtDate_(now);
  const month = today.slice(0, 7);
  const allParticipants = readParticipants_();
  const participants = allParticipants.filter(p => p.active);
  const records = readRecords_(allParticipants).filter(r => r.status === 'active');

  const todayRecs = records.filter(r => r.date === today);
  const reported = {};
  todayRecs.forEach(r => { reported[r.userId] = r; });
  const missing = participants.filter(p => !reported[p.id]).map(p => ({ id: p.id, name: p.name, site: p.site, phone: p.phone }));

  const agentMonth = {};
  records.forEach(r => { if (r.date.slice(0, 7) === month && r.type === SALES_TYPES[1]) agentMonth[r.userId] = (agentMonth[r.userId] || 0) + 1; });
  const pMap = {};
  participants.forEach(p => { pMap[p.id] = p; });
  const agentWatch = Object.keys(agentMonth).filter(id => agentMonth[id] >= Math.ceil(AGENT_LIMIT_PER_MONTH * 0.5))
    .map(id => ({ id: id, name: pMap[id] ? pMap[id].name : id, site: pMap[id] ? pMap[id].site : '', used: agentMonth[id], limit: AGENT_LIMIT_PER_MONTH }))
    .sort((a, b) => b.used - a.used);

  const byDate = {};
  records.forEach(r => {
    const t = byDate[r.date] || (byDate[r.date] = { count: 0, agent: 0 });
    t.count++;
    if (r.type === SALES_TYPES[1]) t.agent++;
  });
  const trend = [];
  for (let i = 29; i >= 0; i--) {
    const d = fmtDate_(new Date(now.getTime() - i * 86400000));
    trend.push({ date: d, count: byDate[d] ? byDate[d].count : 0, agent: byDate[d] ? byDate[d].agent : 0 });
  }

  const monthRecs = records.filter(r => r.date.slice(0, 7) === month);
  const daysSoFar = Number(today.slice(8, 10));
  const expected = participants.length * daysSoFar;

  return {
    success: true, today: today, generatedAt: now.getTime(),
    kpi: {
      participants: participants.length, reportedToday: Object.keys(reported).filter(id => pMap[id]).length, missingToday: missing.length,
      agentToday: todayRecs.filter(r => r.type === SALES_TYPES[1]).length, anomaliesToday: todayRecs.filter(r => r.anomaly).length,
      nogpsToday: todayRecs.filter(r => !r.hasGps).length,
      monthRecords: monthRecs.length, monthRate: expected ? Math.round(monthRecs.length / expected * 100) : 0,
      agentOverLimit: agentWatch.filter(a => a.used > AGENT_LIMIT_PER_MONTH).length
    },
    missing: missing,
    agentWatch: agentWatch,
    anomalies: todayRecs.filter(r => r.anomaly || !r.hasGps).map(recordDto_),
    trend: trend,
    latest: records.slice().sort((a, b) => b.ts - a.ts).slice(0, 8).map(recordDto_)
  };
}

// ---------- แก้ไข/เพิ่ม/ลบ รายการ ----------
function getRecordAt_(row, ts) {
  const sh = sheet_(SHEET.RECORDS);
  row = Number(row);
  if (!row || row < 2 || row > sh.getLastRow()) fail_('INVALID', 'ไม่พบรายการนี้');
  const values = sh.getRange(row, 1, 1, R_HEADERS.length).getValues()[0];
  const current = toDate_(values[RCOL.TS], values[RCOL.DATE]);
  // กันแก้ผิดแถว (เช่น ข้อมูลในชีตถูกเรียงใหม่ระหว่างใช้งาน)
  if (!current || current.getTime() !== Number(ts)) fail_('CONFLICT', 'รายการนี้ถูกเปลี่ยนแปลงแล้ว กรุณารีเฟรชข้อมูล');
  return values;
}

function uploadImage_(imageFile, userId, when) {
  if (!imageFile || !imageFile.data) return '';
  const bytes = Utilities.base64Decode(imageFile.data);
  if (bytes.length > MAX_IMAGE_BYTES) fail_('INVALID', 'ไฟล์ภาพใหญ่เกินไป');
  const file = DriveApp.getFolderById(IMAGE_FOLDER_ID).createFile(Utilities.newBlob(bytes, 'image/jpeg', userId + '_' + fmtDate_(when, 'yyyyMMdd_HHmmss') + '_staff.jpg'));
  shareFile_(file);
  return file.getDownloadUrl();
}

function staffRecordSave_(req, staff, ua) {
  const rec = req.record || {};
  const userId = String(rec.userId || '').trim().toUpperCase();
  const participant = readParticipants_().filter(p => p.id === userId)[0];
  if (!participant) fail_('INVALID', 'ไม่พบผู้ใช้สิทธิ์รหัสนี้');
  if (SALES_TYPES.indexOf(rec.type) === -1) fail_('INVALID', 'กรุณาเลือกประเภทการขาย');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.date || '') || !/^\d{2}:\d{2}$/.test(rec.time || '')) fail_('INVALID', 'วันที่หรือเวลาไม่ถูกต้อง');
  const ts = Utilities.parseDate(rec.date + ' ' + rec.time, TZ, 'yyyy-MM-dd HH:mm');
  if (ts.getTime() > Date.now() + 5 * 60000) fail_('INVALID', 'ไม่สามารถบันทึกรายการล่วงหน้าได้');
  const lat = num_(rec.lat), lng = num_(rec.lng);
  if ((lat === null) !== (lng === null)) fail_('INVALID', 'กรุณากรอกทั้งละติจูดและลองจิจูด หรือเว้นว่างทั้งคู่');
  if (lat !== null && (Math.abs(lat) > 90 || Math.abs(lng) > 180)) fail_('INVALID', 'พิกัดไม่ถูกต้อง');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_(SHEET.RECORDS);
    const isNew = !rec.row;
    let before = null;
    if (!isNew) before = getRecordAt_(rec.row, rec.originalTs);

    // วันละ 1 รายการต่อคน (ยกเว้นยืนยันด้วย force) — ตรวจเฉพาะรายการใหม่ หรือเมื่อย้ายไปคน/วันอื่น
    const movedDay = !before || String(before[RCOL.USER_ID]).toUpperCase() !== userId || fmtDate_(toDate_(before[RCOL.TS], before[RCOL.DATE])) !== rec.date;
    const sameDay = movedDay ? readRecords_().filter(r => r.status === 'active' && r.userId === userId && r.date === rec.date && r.row !== Number(rec.row)) : [];
    if (sameDay.length && !req.force) {
      return { success: false, code: 'DUPLICATE', message: participant.name + ' มีรายงานของวันที่นี้แล้ว (' + sameDay[0].time + ' น.) ต้องการบันทึกเพิ่มหรือไม่?' };
    }

    const now = new Date();
    const imageUrl = rec.imageFile ? uploadImage_(rec.imageFile, userId, ts) : (before ? before[RCOL.IMAGE] : '');
    const values = [ts, rec.date, rec.time + ':00', userId, clean_(participant.name, 120), rec.type, imageUrl,
      lat === null ? '' : lat, lng === null ? '' : lng, lat === null ? '' : 'https://maps.google.com/maps?q=' + lat + ',' + lng,
      clean_(rec.note, 500), before ? (before[RCOL.STATUS] || 'active') : 'active', staff.email || staff.name, now,
      before ? (before[RCOL.SOURCE] || 'app') : 'staff'];

    let row;
    if (isNew) {
      sh.appendRow(values);
      row = sh.getLastRow();
    } else {
      row = Number(rec.row);
      sh.getRange(row, 1, 1, values.length).setValues([values]);
    }
    const changes = {};
    if (before) {
      ['USER_ID', 'TYPE', 'LAT', 'LNG', 'NOTE'].forEach(k => {
        if (String(before[RCOL[k]]) !== String(values[RCOL[k]])) changes[k.toLowerCase()] = [before[RCOL[k]], values[RCOL[k]]];
      });
      const oldTs = toDate_(before[RCOL.TS]);
      if (oldTs && oldTs.getTime() !== ts.getTime()) changes.time = [fmtDate_(oldTs, 'yyyy-MM-dd HH:mm'), rec.date + ' ' + rec.time];
      if (rec.imageFile) changes.image = 'replaced';
    }
    log_(staff, isNew ? 'records.create' : 'records.update', userId + ' ' + rec.date, isNew ? { type: rec.type, time: rec.time, force: !!req.force } : changes, ua);
    const saved = readRecords_().filter(r => r.row === row)[0];
    return { success: true, record: saved ? recordDto_(saved) : null };
  } finally {
    lock.releaseLock();
  }
}

function staffRecordSetStatus_(req, staff, status, ua) {
  if (status === 'deleted' && !String(req.reason || '').trim()) fail_('INVALID', 'กรุณาระบุเหตุผลในการลบ');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const values = getRecordAt_(req.row, req.ts);
    const sh = sheet_(SHEET.RECORDS);
    sh.getRange(Number(req.row), RCOL.STATUS + 1, 1, 3).setValues([[status, staff.email || staff.name, new Date()]]);
    log_(staff, status === 'deleted' ? 'records.delete' : 'records.restore', values[RCOL.USER_ID] + ' ' + fmtDate_(toDate_(values[RCOL.TS])),
      status === 'deleted' ? { reason: clean_(req.reason, 300) } : '', ua);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

// ---------- ผู้ใช้สิทธิ์ ----------
function staffParticipantsList_() {
  const now = new Date();
  const today = fmtDate_(now), month = today.slice(0, 7), year = today.slice(0, 4);
  const stats = {};
  const participants = readParticipants_();
  readRecords_(participants).forEach(r => {
    if (r.status !== 'active') return;
    const s = stats[r.userId] || (stats[r.userId] = { month: 0, monthAgent: 0, year: 0, last: null, today: false, anomalies: 0, lastLat: null, lastLng: null });
    if (r.date.slice(0, 4) === year) s.year++;
    if (r.date.slice(0, 7) === month) { s.month++; if (r.type === SALES_TYPES[1]) s.monthAgent++; if (r.anomaly) s.anomalies++; }
    if (r.date === today) s.today = true;
    if (!s.last || r.ts > s.last) { s.last = r.ts; if (r.hasGps) { s.lastLat = r.lat; s.lastLng = r.lng; } }
  });
  const list = participants.map(p => {
    const s = stats[p.id] || {};
    return {
      id: p.id, name: p.name, status: p.status, pic: p.pic, picRaw: p.picRaw, site: p.site, siteLat: p.siteLat, siteLng: p.siteLng,
      phone: p.phone, active: p.active, note: p.note, updatedBy: p.updatedBy, updatedAt: p.updatedAt ? p.updatedAt.getTime() : null,
      monthCount: s.month || 0, monthAgent: s.monthAgent || 0, yearCount: s.year || 0, anomaliesMonth: s.anomalies || 0,
      reportedToday: !!s.today, lastReport: s.last ? s.last.getTime() : null, lastLat: s.lastLat, lastLng: s.lastLng
    };
  });
  return { success: true, participants: list, daysSoFar: Number(today.slice(8, 10)), agentLimit: AGENT_LIMIT_PER_MONTH };
}

function staffParticipantSave_(req, staff, ua) {
  const p = req.participant || {};
  const id = String(p.id || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(id)) fail_('INVALID', 'รหัสผู้ใช้สิทธิ์ต้องเป็นตัวอักษรอังกฤษหรือตัวเลข 6 หลัก');
  if (!String(p.name || '').trim()) fail_('INVALID', 'กรุณากรอกชื่อ-สกุล');
  const siteLat = num_(p.siteLat), siteLng = num_(p.siteLng);
  if ((siteLat === null) !== (siteLng === null)) fail_('INVALID', 'กรุณากรอกพิกัดจุดขายให้ครบทั้งสองช่อง หรือเว้นว่างทั้งคู่');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_(SHEET.USERS);
    const all = readParticipants_();
    const existing = all.filter(x => x.id === id)[0];
    const isNew = !req.originalId;
    if (isNew && existing) fail_('INVALID', 'รหัส ' + id + ' มีอยู่แล้ว');
    if (!isNew && String(req.originalId).toUpperCase() !== id) fail_('INVALID', 'ไม่สามารถเปลี่ยนรหัสผู้ใช้สิทธิ์ได้ (ประวัติจะไม่ตรงกัน)');
    if (!isNew && !existing) fail_('INVALID', 'ไม่พบผู้ใช้สิทธิ์นี้');

    const values = [id, clean_(p.name, 120), clean_(p.status, 120), clean_(p.picRaw, 500), clean_(p.site, 120),
      siteLat === null ? '' : siteLat, siteLng === null ? '' : siteLng, clean_(p.phone, 40), p.active === false ? false : true,
      clean_(p.note, 500), new Date(), staff.email || staff.name];
    if (isNew) sh.appendRow(values);
    else sh.getRange(existing.row, 1, 1, values.length).setValues([values]);

    const changes = {};
    if (existing) {
      [['name', 'name'], ['status', 'status'], ['site', 'site'], ['phone', 'phone'], ['active', 'active'], ['siteLat', 'siteLat'], ['siteLng', 'siteLng']].forEach(([k]) => {
        const nv = k === 'active' ? values[UCOL.ACTIVE] : k === 'siteLat' ? siteLat : k === 'siteLng' ? siteLng : String(p[k] || '');
        if (String(existing[k] === null ? '' : existing[k]) !== String(nv === null ? '' : nv)) changes[k] = [existing[k], nv];
      });
    }
    log_(staff, isNew ? 'participants.create' : 'participants.update', id + ' ' + p.name, isNew ? { site: p.site } : changes, ua);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

// รูปหลักฐาน: อนุญาตเฉพาะไฟล์ที่อ้างอิงอยู่ในระบบ (กันการเปิดไฟล์อื่นใน Drive)
// thumb = ใช้รูปย่อของ Drive (เล็กกว่าไฟล์จริงหลายเท่า) สำหรับตาราง
function staffImage_(fileId, thumb) {
  fileId = String(fileId || '');
  if (!/^[\w-]{20,}$/.test(fileId)) fail_('INVALID', 'คำขอไม่ถูกต้อง');
  const known = readRows_(SHEET.RECORDS, RCOL.IMAGE + 1).some(r => toFileId_(r[RCOL.IMAGE]) === fileId) ||
    readRows_(SHEET.USERS, UCOL.PIC + 1).some(r => toFileId_(r[UCOL.PIC]) === fileId);
  if (!known) fail_('INVALID', 'ไม่พบรูป');
  const file = DriveApp.getFileById(fileId);
  let blob = null;
  if (thumb) { try { blob = file.getThumbnail(); } catch (e) { blob = null; } }
  if (!blob) blob = file.getBlob();
  return { success: true, dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
}
