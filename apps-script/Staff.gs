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
      return { success: true, staff: staffDto_(staff), token: renewedToken_(staff) };
    case 'staff.logout':
      if (req.everywhere) return staffLogoutEverywhere_(staff, ua);
      log_(staff, 'staff.logout', staff.email || staff.name, '', ua);
      return { success: true };
    case 'staff.notify.config':
    case 'staff.notify.subscribe':
    case 'staff.notify.unsubscribe':
    case 'staff.notify.test':
    case 'staff.notify.email':
      if (typeof handleNotifyRequest_ !== 'function') return { success: false, message: 'ระบบแจ้งเตือนยังไม่ได้ติดตั้ง (เพิ่มไฟล์ Notify.gs ใน Apps Script)' };
      return handleNotifyRequest_(req, { type: 'staff', id: staff.id, email: staff.email || '' });
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
    case 'staff.participants.delete':
      requirePerm_(staff, 'participants.edit');
      return staffParticipantDelete_(req, staff, ua);
    case 'staff.contacts.list':
      requirePerm_(staff, 'participants.view');
      return { success: true, contacts: readContacts_(String(req.participantId || '').toUpperCase(), 50) };
    case 'staff.contacts.add':
      requirePerm_(staff, 'participants.view');
      return staffContactAdd_(req, staff, ua);
    case 'staff.report.section35':
      requirePerm_(staff, 'export');
      return staffSection35_(req);
    case 'staff.report.monthly':
      requirePerm_(staff, 'export');
      return { success: true, report: monthlyReport_(req.month) };
    case 'staff.report.monthly.send':
      requirePerm_(staff, 'admin');
      if (typeof sendMonthlyReport === 'function') return sendMonthlyReport(req.month, staff);
      return { success: false, message: 'ต้องอัปเดตไฟล์ Notify.gs ก่อน' };
    case 'staff.analytics.report':
      requirePerm_(staff, 'admin');
      if (typeof analyticsReport_ !== 'function') return { success: false, message: 'ต้องเพิ่มไฟล์ Analytics.gs ใน Apps Script ก่อน' };
      return analyticsReport_(req);
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
    case 'admin.security.status':
      requirePerm_(staff, 'admin');
      return guardStatus_();
    case 'admin.security.shield':
      requirePerm_(staff, 'admin');
      return guardSetShield_(!!req.on, staff, ua);
    case 'admin.security.block':
      requirePerm_(staff, 'admin');
      if (typeof threatBlock_ !== 'function') return { success: false, message: 'ต้องเพิ่มไฟล์ Threats.gs ใน Apps Script ก่อน' };
      return threatBlock_(req.device, !!req.on, req.reason, staff, ua, Number(req.days) || 30);
    case 'admin.security.threat':
      requirePerm_(staff, 'admin');
      if (typeof threatSetStatus_ !== 'function') return { success: false, message: 'ต้องเพิ่มไฟล์ Threats.gs ใน Apps Script ก่อน' };
      return threatSetStatus_(req.row, req.status, staff, ua);
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
  const records = readRows_(SHEET.RECORDS, R_HEADERS.length).map((r, i) => {
    const ts = toDate_(r[RCOL.TS], r[RCOL.DATE]);
    if (!ts) return null;
    const userId = String(r[RCOL.USER_ID] || '').trim().toUpperCase();
    const u = users[userId];
    const lat = num_(r[RCOL.LAT]), lng = num_(r[RCOL.LNG]);
    const hasGps = lat !== null && lng !== null;
    const distance = hasGps && u && u.siteLat !== null && u.siteLng !== null ? distanceM_(lat, lng, u.siteLat, u.siteLng) : null;
    return {
      row: i + 2, ts: ts, date: fmtDate_(ts), time: fmtDate_(ts, 'HH:mm'), userId: userId,
      userName: u ? u.name : String(r[RCOL.USER_NAME] || ''), userPicRaw: u ? u.picRaw : '', site: u ? u.site : '',
      type: String(r[RCOL.TYPE] || ''), imageRaw: String(r[RCOL.IMAGE] || ''),
      lat: lat, lng: lng, hasGps: hasGps, distance: distance, anomaly: distance !== null && distance > radius,
      note: String(r[RCOL.NOTE] || ''), status: r[RCOL.STATUS] === 'deleted' ? 'deleted' : 'active',
      updatedBy: String(r[RCOL.UPDATED_BY] || ''), updatedAt: toDate_(r[RCOL.UPDATED_AT]), source: String(r[RCOL.SOURCE] || 'app'),
      accuracy: num_(r[RCOL.ACCURACY]), photoHash: String(r[RCOL.PHOTO_HASH] || ''), receivedAt: toDate_(r[RCOL.RECEIVED_AT])
    };
  }).filter(Boolean);
  markQuality_(records);
  return records;
}

// ---------- ตรวจคุณภาพหลักฐาน: รูปซ้ำ + พิกัดความแม่นยำต่ำ ----------
const DEFAULT_GPS_ACCURACY_MAX = 100; // ม. — GPS บอกความคลาดเคลื่อนมากกว่านี้ถือว่าไม่น่าเชื่อถือ
const DUP_MAX_BITS = 3;               // ลายนิ้วมือรูป (dHash 64 บิต) ต่างกันไม่เกินนี้ = รูปเดียวกัน
function gpsAccuracyMax_() {
  const n = Number(prop_('GPS_ACCURACY_MAX', DEFAULT_GPS_ACCURACY_MAX));
  return isFinite(n) && n > 0 ? n : DEFAULT_GPS_ACCURACY_MAX;
}
function markQuality_(records) {
  const maxAcc = gpsAccuracyMax_();
  records.forEach(r => { r.lowAccuracy = r.hasGps && r.accuracy !== null && r.accuracy > maxAcc; r.dupWith = []; });
  // หาคู่รูปที่คล้ายกัน: แบ่ง hash เป็น 4 ช่วง ช่วงละ 16 บิต — รูปที่ต่างกัน ≤ 3 บิต ต้องมีอย่างน้อย 1 ช่วงที่เหมือนกันทุกบิต
  const withHash = records.filter(r => r.status === 'active' && /^[0-9a-f]{16}$/.test(r.photoHash));
  const buckets = {};
  withHash.forEach((r, i) => { for (let k = 0; k < 4; k++) { const key = k + ':' + r.photoHash.substr(k * 4, 4); (buckets[key] = buckets[key] || []).push(i); } });
  const seen = {};
  Object.keys(buckets).forEach(key => {
    const list = buckets[key];
    if (list.length < 2 || list.length > 200) return; // ช่วงที่ซ้ำเยอะผิดปกติ (เช่น รูปดำล้วน) ข้าม
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const i = list[a], j = list[b], pair = i < j ? i + '-' + j : j + '-' + i;
      if (seen[pair]) continue;
      seen[pair] = true;
      const x = withHash[i], y = withHash[j];
      if (x.date === y.date && x.userId === y.userId) continue;
      if (hammingHex_(x.photoHash, y.photoHash) > DUP_MAX_BITS) continue;
      if (x.dupWith.length < 5) x.dupWith.push({ row: y.row, date: y.date, userId: y.userId, userName: y.userName });
      if (y.dupWith.length < 5) y.dupWith.push({ row: x.row, date: x.date, userId: x.userId, userName: x.userName });
    }
  });
  records.forEach(r => { r.dup = r.dupWith.length > 0; });
}
function hammingHex_(a, b) {
  let n = 0;
  for (let k = 0; k < 16; k += 4) {
    let v = parseInt(a.substr(k, 4), 16) ^ parseInt(b.substr(k, 4), 16);
    while (v) { v &= v - 1; n++; }
  }
  return n;
}

function recordDto_(r) {
  return {
    row: r.row, ts: r.ts.getTime(), date: r.date, time: r.time, userId: r.userId, userName: r.userName, userPic: toImageUrl_(r.userPicRaw), site: r.site,
    type: r.type, image: toImageUrl_(r.imageRaw), fileId: toFileId_(r.imageRaw), lat: r.lat, lng: r.lng,
    mapUrl: r.hasGps ? 'https://maps.google.com/maps?q=' + r.lat + ',' + r.lng : '', distance: r.distance, anomaly: r.anomaly,
    hasGps: r.hasGps, note: r.note, status: r.status, source: r.source, updatedBy: r.updatedBy,
    updatedAt: r.updatedAt ? r.updatedAt.getTime() : null,
    accuracy: r.accuracy, lowAccuracy: !!r.lowAccuracy, dup: !!r.dup, dupWith: r.dupWith || [],
    receivedAt: r.receivedAt ? r.receivedAt.getTime() : null
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
    if (f.location === 'duplicate' && !r.dup) return false;
    if (f.location === 'lowacc' && !r.lowAccuracy) return false;
    if (f.location === 'review' && !(r.anomaly || !r.hasGps || r.dup || r.lowAccuracy)) return false;
    if (q && (r.userId + ' ' + r.userName + ' ' + r.note + ' ' + r.site).toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
}

function aggregate_(rows) {
  const users = {}, byDay = {}, bySite = {};
  let agent = 0, anomalies = 0, nogps = 0, dups = 0, lowacc = 0;
  rows.forEach(r => {
    if (r.dup) dups++;
    if (r.lowAccuracy) lowacc++;
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
  return { total: rows.length, users: byUser.length, self: rows.length - agent, agent: agent, anomalies: anomalies, nogps: nogps, duplicates: dups, lowAccuracy: lowacc, byDay: byDay, bySite: bySite, byUser: byUser };
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
  const contacted = contactedToday_();
  const missing = participants.filter(p => !reported[p.id]).map(p => ({ id: p.id, name: p.name, pic: p.pic, site: p.site, phone: p.phone, contact: contacted[p.id] || null }));

  const agentMonth = {};
  records.forEach(r => { if (r.date.slice(0, 7) === month && r.type === SALES_TYPES[1]) agentMonth[r.userId] = (agentMonth[r.userId] || 0) + 1; });
  const pMap = {};
  participants.forEach(p => { pMap[p.id] = p; });
  const agentWatch = Object.keys(agentMonth).filter(id => agentMonth[id] >= Math.ceil(AGENT_LIMIT_PER_MONTH * 0.5))
    .map(id => ({ id: id, name: pMap[id] ? pMap[id].name : id, pic: pMap[id] ? pMap[id].pic : '', site: pMap[id] ? pMap[id].site : '', used: agentMonth[id], limit: AGENT_LIMIT_PER_MONTH }))
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
      duplicatesToday: todayRecs.filter(r => r.dup).length, lowAccToday: todayRecs.filter(r => r.lowAccuracy).length,
      monthRecords: monthRecs.length, monthRate: expected ? Math.round(monthRecs.length / expected * 100) : 0,
      agentOverLimit: agentWatch.filter(a => a.used > AGENT_LIMIT_PER_MONTH).length
    },
    missing: missing,
    agentWatch: agentWatch,
    anomalies: todayRecs.filter(r => r.anomaly || !r.hasGps || r.dup || r.lowAccuracy).map(recordDto_),
    trend: trend,
    compare: overviewCompare_(records, participants.length, today),
    hours: overviewHours_(monthRecs),
    sites: overviewSites_(participants, monthRecs, reported),
    latest: records.slice().sort((a, b) => b.ts - a.ts).slice(0, 8).map(recordDto_)
  };
}

// เทียบเดือนนี้กับเดือนก่อน: จำนวนรายงานรายวัน (วันที่ 1..สิ้นเดือน) และอัตราการส่งช่วงวันเดียวกัน
function overviewCompare_(records, participantCount, today) {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)), dayNow = Number(today.slice(8, 10));
  const prevY = m === 1 ? y - 1 : y, prevM = m === 1 ? 12 : m - 1;
  const key = (yy, mm) => yy + '-' + ('0' + mm).slice(-2);
  const thisKey = key(y, m), prevKey = key(prevY, prevM);
  const daysIn = (yy, mm) => new Date(yy, mm, 0).getDate();
  const cur = new Array(daysIn(y, m)).fill(0), prev = new Array(daysIn(prevY, prevM)).fill(0);
  const agentCur = { n: 0 }, agentPrev = { n: 0 };
  records.forEach(r => {
    const mk = r.date.slice(0, 7), d = Number(r.date.slice(8, 10)) - 1;
    if (mk === thisKey) { cur[d]++; if (r.type === SALES_TYPES[1]) agentCur.n++; }
    else if (mk === prevKey) { prev[d]++; if (r.type === SALES_TYPES[1] && d < dayNow) agentPrev.n++; }
  });
  const sum = (arr, n) => arr.slice(0, n).reduce((a, b) => a + b, 0);
  const span = Math.min(dayNow, prev.length);
  const curTotal = sum(cur, dayNow), prevSame = sum(prev, span);
  return {
    thisMonth: thisKey, lastMonth: prevKey, today: dayNow,
    current: cur.slice(0, dayNow), previous: prev,
    totals: { current: curTotal, previousSamePeriod: prevSame, previousMonth: sum(prev, prev.length) },
    rate: { current: participantCount ? Math.round(curTotal / (participantCount * dayNow) * 100) : 0, previous: participantCount ? Math.round(prevSame / (participantCount * span) * 100) : 0 },
    agent: { current: agentCur.n, previous: agentPrev.n }
  };
}

// ช่วงเวลาที่ส่งรายงาน (เดือนนี้) แยกรายชั่วโมง
function overviewHours_(monthRecs) {
  const h = new Array(24).fill(0);
  monthRecs.forEach(r => { const n = Number(String(r.time).slice(0, 2)); if (n >= 0 && n < 24) h[n]++; });
  return h;
}

// จุดขาย: พิกัด จำนวนผู้ใช้สิทธิ์ รายงานเดือนนี้ และวันนี้ (ใช้ทำแผนที่ความหนาแน่น)
function overviewSites_(participants, monthRecs, reported) {
  const sites = {};
  participants.forEach(p => {
    const name = p.site || 'ไม่ระบุจุดขาย';
    const s = sites[name] || (sites[name] = { site: name, lat: null, lng: null, people: 0, today: 0, month: 0, pts: [] });
    s.people++;
    if (reported[p.id]) s.today++;
    if (p.siteLat !== null && p.siteLng !== null && s.lat === null) { s.lat = p.siteLat; s.lng = p.siteLng; }
  });
  const siteOf = {};
  participants.forEach(p => { siteOf[p.id] = p.site || 'ไม่ระบุจุดขาย'; });
  monthRecs.forEach(r => {
    const s = sites[siteOf[r.userId]];
    if (!s) return;
    s.month++;
    if (r.hasGps && s.pts.length < 200) s.pts.push([r.lat, r.lng]);
  });
  return Object.keys(sites).map(k => {
    const s = sites[k];
    // ไม่มีพิกัดจุดขาย: ใช้ค่าเฉลี่ยพิกัดรายงานเดือนนี้แทน
    if (s.lat === null && s.pts.length) {
      s.lat = s.pts.reduce((a, p) => a + p[0], 0) / s.pts.length;
      s.lng = s.pts.reduce((a, p) => a + p[1], 0) / s.pts.length;
    }
    delete s.pts;
    return s;
  }).sort((a, b) => b.month - a.month);
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
    const s = stats[r.userId] || (stats[r.userId] = { days: {}, agentDays: {}, month: 0, monthAgent: 0, year: 0, last: null, today: false, anomalies: 0, lastLat: null, lastLng: null });
    if (r.date.slice(0, 4) === year) s.year++;
    // นับเป็น "วัน" ที่ส่ง (วันละครั้ง) — ส่งซ้ำ/ส่งหลายรายการในวันเดียวไม่ทำให้เกินจำนวนวันของเดือน
    if (r.date.slice(0, 7) === month) {
      if (!s.days[r.date]) { s.days[r.date] = 1; s.month++; }
      if (r.type === SALES_TYPES[1] && !s.agentDays[r.date]) { s.agentDays[r.date] = 1; s.monthAgent++; }
      if (r.anomaly) s.anomalies++;
    }
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
    const isNew = !req.originalId;
    const oldId = isNew ? id : String(req.originalId).trim().toUpperCase();
    const existing = isNew ? null : all.filter(x => x.id === oldId)[0];
    if (!isNew && !existing) fail_('INVALID', 'ไม่พบผู้ใช้สิทธิ์นี้ (อาจถูกลบหรือเปลี่ยนรหัสไปแล้ว) กรุณารีเฟรชข้อมูล');
    // รหัสห้ามซ้ำกับผู้ใช้สิทธิ์คนอื่น
    if (all.some(x => x.id === id && x !== existing)) fail_('INVALID', 'รหัส ' + id + ' มีผู้ใช้สิทธิ์คนอื่นใช้อยู่แล้ว');
    const renaming = !isNew && oldId !== id;
    // กันประวัติปนกัน: รหัสใหม่ต้องไม่เคยมีรายงาน (เช่น รหัสของผู้ใช้สิทธิ์ที่ถูกลบไปแล้ว)
    if (renaming && countRecordsOf_(id) > 0) fail_('INVALID', 'รหัส ' + id + ' มีประวัติรายงานของผู้ใช้สิทธิ์เดิมอยู่ กรุณาใช้รหัสอื่น');

    let picRaw = clean_(p.picRaw, 500);
    if (renaming) renameProfilePhoto_(picRaw, oldId, id);
    // อัปโหลดรูปใหม่ (ถ้ามี) ไปโฟลเดอร์รูปโปรไฟล์ แล้วใช้ลิงก์ Drive แทนลิงก์ที่กรอก
    if (req.photo) picRaw = saveProfilePhoto_(id, req.photo);
    const values = [id, clean_(p.name, 120), clean_(p.status, 120), picRaw, clean_(p.site, 120),
      siteLat === null ? '' : siteLat, siteLng === null ? '' : siteLng, clean_(p.phone, 40), p.active === false ? false : true,
      clean_(p.note, 500), new Date(), staff.email || staff.name];
    if (isNew) sh.appendRow(values);
    else sh.getRange(existing.row, 1, 1, values.length).setValues([values]);
    // เปลี่ยนรหัส: ย้ายประวัติรายงานทั้งหมดไปรหัสใหม่
    const moved = renaming ? renameRecordsUser_(oldId, id) : 0;

    const changes = {};
    if (existing) {
      [['name', 'name'], ['status', 'status'], ['site', 'site'], ['phone', 'phone'], ['active', 'active'], ['siteLat', 'siteLat'], ['siteLng', 'siteLng']].forEach(([k]) => {
        const nv = k === 'active' ? values[UCOL.ACTIVE] : k === 'siteLat' ? siteLat : k === 'siteLng' ? siteLng : String(p[k] || '');
        if (String(existing[k] === null ? '' : existing[k]) !== String(nv === null ? '' : nv)) changes[k] = [existing[k], nv];
      });
    }
    if (existing && existing.picRaw !== picRaw) changes.pic = req.photo ? 'อัปโหลดรูปใหม่' : 'เปลี่ยนลิงก์รูป';
    if (renaming) { changes.id = [oldId, id]; changes.recordsMoved = moved; }
    log_(staff, isNew ? 'participants.create' : renaming ? 'participants.rename' : 'participants.update', id + ' ' + p.name,
      isNew ? { site: p.site, pic: req.photo ? 'อัปโหลดรูป' : '' } : changes, ua);
    return { success: true, picRaw: picRaw, id: id, recordsMoved: moved };
  } finally {
    lock.releaseLock();
  }
}

function countRecordsOf_(id) {
  return readRows_(SHEET.RECORDS, RCOL.USER_ID + 1).filter(r => String(r[RCOL.USER_ID]).trim().toUpperCase() === id).length;
}

// เปลี่ยนรหัสในคอลัมน์รหัสของแผ่น Records ทั้งคอลัมน์ในครั้งเดียว
function renameRecordsUser_(oldId, newId) {
  const sh = sheet_(SHEET.RECORDS);
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const range = sh.getRange(2, RCOL.USER_ID + 1, last - 1, 1);
  const values = range.getValues();
  let n = 0;
  values.forEach(v => { if (String(v[0]).trim().toUpperCase() === oldId) { v[0] = newId; n++; } });
  if (n) range.setValues(values);
  return n;
}

// ลบบัญชีผู้ใช้สิทธิ์: ลบแถวใน Users (เข้าสู่ระบบไม่ได้อีก) — ประวัติรายงานยังอยู่ครบและแสดงชื่อเดิมในรายงาน
function staffParticipantDelete_(req, staff, ua) {
  const id = String(req.id || '').trim().toUpperCase();
  const reason = clean_(req.reason, 300);
  if (!reason) fail_('INVALID', 'กรุณาระบุเหตุผล');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const p = readParticipants_().filter(x => x.id === id)[0];
    if (!p) fail_('INVALID', 'ไม่พบผู้ใช้สิทธิ์นี้ (อาจถูกลบไปแล้ว)');
    sheet_(SHEET.USERS).deleteRow(p.row);
    const photoTrashed = trashProfilePhoto_(p.picRaw, id);
    const records = countRecordsOf_(id);
    log_(staff, 'participants.delete', id + ' ' + p.name, { reason: reason, site: p.site, records: records, photoTrashed: photoTrashed }, ua);
    return { success: true, records: records };
  } finally {
    lock.releaseLock();
  }
}

// รูปโปรไฟล์ผู้ใช้สิทธิ์: ไฟล์ชื่อ IMG_<รหัส> ในโฟลเดอร์รูปโปรไฟล์ (เปลี่ยนได้ด้วย Script Property PROFILE_FOLDER_ID)
const PROFILE_FOLDER_ID = '1-GZAWmJ0daUrM6R9HuiayZzRBQwu_-HE';
const MAX_PROFILE_BYTES = 2 * 1024 * 1024;
function saveProfilePhoto_(id, photo) {
  const mime = /^image\/(jpeg|png|webp)$/.test(String(photo.mimeType)) ? photo.mimeType : 'image/jpeg';
  let bytes;
  try { bytes = Utilities.base64Decode(String(photo.data || '')); } catch (e) { fail_('INVALID', 'ไฟล์รูปไม่ถูกต้อง'); }
  if (!bytes.length) fail_('INVALID', 'ไฟล์รูปไม่ถูกต้อง');
  if (bytes.length > MAX_PROFILE_BYTES) fail_('INVALID', 'รูปมีขนาดใหญ่เกิน 2 MB');
  const name = 'IMG_' + id;
  let folder;
  try { folder = DriveApp.getFolderById(prop_('PROFILE_FOLDER_ID') || PROFILE_FOLDER_ID); }
  catch (e) { fail_('ERROR', 'เปิดโฟลเดอร์รูปโปรไฟล์ไม่ได้ กรุณาตรวจสอบสิทธิ์ของบัญชีที่ Deploy'); }
  const file = folder.createFile(Utilities.newBlob(bytes, mime, name));
  shareFile_(file);
  // เก็บเฉพาะรูปล่าสุด: ไฟล์ชื่อเดียวกันอันเก่าย้ายไปถังขยะ (กู้คืนได้ 30 วัน)
  try {
    const old = folder.getFilesByName(name);
    while (old.hasNext()) { const f = old.next(); if (f.getId() !== file.getId()) f.setTrashed(true); }
  } catch (e) { console.warn('ย้ายรูปเก่าไปถังขยะไม่สำเร็จ: ' + e); }
  return 'https://drive.google.com/file/d/' + file.getId() + '/view?usp=drive_link';
}

// ไฟล์รูปที่ระบบตั้งชื่อไว้ (IMG_<รหัสเดิม>) เท่านั้นที่ถูกเปลี่ยนชื่อ/ลบ — ลิงก์รูปอื่นที่วางเองไม่ถูกแตะ
function ownedProfilePhoto_(picRaw, id) {
  const fileId = toFileId_(picRaw);
  if (!fileId) return null;
  try {
    const f = DriveApp.getFileById(fileId);
    return f.getName() === 'IMG_' + id ? f : null;
  } catch (e) { return null; }
}
function renameProfilePhoto_(picRaw, oldId, newId) {
  const f = ownedProfilePhoto_(picRaw, oldId);
  if (f) { try { f.setName('IMG_' + newId); } catch (e) { console.warn('เปลี่ยนชื่อรูปโปรไฟล์ไม่สำเร็จ: ' + e); } }
}
function trashProfilePhoto_(picRaw, id) {
  const f = ownedProfilePhoto_(picRaw, id);
  if (!f) return false;
  try { f.setTrashed(true); return true; } catch (e) { console.warn('ลบรูปโปรไฟล์ไม่สำเร็จ: ' + e); return false; }
}

// รูปหลักฐาน: อนุญาตเฉพาะไฟล์ที่อ้างอิงอยู่ในระบบ (กันการเปิดไฟล์อื่นใน Drive)
// thumb = ใช้รูปย่อของ Drive (เล็กกว่าไฟล์จริงหลายเท่า) สำหรับตาราง
function staffImage_(fileId, thumb) {
  fileId = String(fileId || '');
  if (!/^[\w-]{20,}$/.test(fileId)) fail_('INVALID', 'คำขอไม่ถูกต้อง');
  // ตรวจแผ่น Users ก่อน (เล็กกว่า) — รูปโปรไฟล์ถูกขอบ่อยที่สุด
  const known = readRows_(SHEET.USERS, UCOL.PIC + 1).some(r => toFileId_(r[UCOL.PIC]) === fileId) ||
    readRows_(SHEET.RECORDS, RCOL.IMAGE + 1).some(r => toFileId_(r[RCOL.IMAGE]) === fileId);
  if (!known) fail_('INVALID', 'ไม่พบรูป');
  const file = DriveApp.getFileById(fileId);
  let blob = null;
  if (thumb) { try { blob = file.getThumbnail(); } catch (e) { blob = null; } }
  if (!blob) blob = file.getBlob();
  return { success: true, dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
}

// ออกจากระบบทุกอุปกรณ์ (จากหน้าตั้งค่าของตัวเอง): เพิ่ม token version ให้ token เดิมทุกเครื่องใช้ไม่ได้ทันที
function staffLogoutEverywhere_(staff, ua) {
  const me = findStaffById_(staff.id); // อ่านใหม่จากชีต (แถวและ token version ล่าสุด)
  if (!me) fail_('INVALID', 'ไม่พบบัญชีนี้');
  sheet_(SHEET.STAFF).getRange(me.row, SCOL.TOKEN_VER + 1).setValue(me.tokenVersion + 1);
  clearStaffCache_();
  log_(staff, 'staff.logout_all', staff.email || staff.name, '', ua);
  return { success: true, everywhere: true };
}

// ---------- บันทึกการติดต่อผู้ใช้สิทธิ์ (แผ่น Contacts สร้างอัตโนมัติ) ----------
const CONTACT_SHEET = 'Contacts';
const C_HEADERS = ['เวลา', 'รหัสผู้ใช้สิทธิ์', 'ผลการติดต่อ', 'เหตุผล/รายละเอียด', 'เจ้าหน้าที่ (ID)', 'เจ้าหน้าที่'];
const CONTACT_RESULTS = { called: 'โทรแล้ว ติดต่อได้', no_answer: 'โทรแล้ว ไม่รับสาย', reason: 'แจ้งเหตุผล', visit: 'ลงพื้นที่/พบตัว', other: 'อื่นๆ' };
function contactSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(CONTACT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONTACT_SHEET);
    sh.getRange(1, 1, 1, C_HEADERS.length).setValues([C_HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function readContacts_(participantId, limit) {
  const sh = contactSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, C_HEADERS.length).getValues()
    .filter(r => !participantId || String(r[1]).toUpperCase() === participantId)
    .map((r, i) => ({ ts: r[0] instanceof Date ? r[0].getTime() : new Date(r[0]).getTime(), i: i, participantId: String(r[1]), result: String(r[2]), resultLabel: CONTACT_RESULTS[r[2]] || String(r[2]), note: String(r[3] || ''), staffName: String(r[5] || '') }))
    .filter(c => isFinite(c.ts))
    .sort((a, b) => b.ts - a.ts || b.i - a.i) // เวลาเท่ากัน: แถวที่บันทึกทีหลังมาก่อน
    .slice(0, limit || 50);
}
function staffContactAdd_(req, staff, ua) {
  const id = String(req.participantId || '').trim().toUpperCase();
  const p = readParticipants_().filter(x => x.id === id)[0];
  if (!p) fail_('INVALID', 'ไม่พบผู้ใช้สิทธิ์นี้');
  if (!CONTACT_RESULTS[req.result]) fail_('INVALID', 'กรุณาเลือกผลการติดต่อ');
  const note = clean_(req.note, 300);
  if (req.result === 'reason' && !note) fail_('INVALID', 'กรุณาระบุเหตุผล');
  contactSheet_().appendRow([new Date(), id, req.result, note, staff.id, staff.name]);
  log_(staff, 'participants.contact', id + ' ' + p.name, { result: CONTACT_RESULTS[req.result], note: note }, ua);
  return { success: true, contacts: readContacts_(id, 50) };
}
// ผู้ที่ติดต่อแล้ววันนี้ (ใช้แสดงในรายชื่อ "ยังไม่ส่งวันนี้")
function contactedToday_() {
  const today = fmtDate_(new Date()), out = {};
  readContacts_('', 500).forEach(c => { if (fmtDate_(new Date(c.ts)) === today && !out[c.participantId]) out[c.participantId] = c; });
  return out;
}

// ---------- รายงานประจำเดือน (เทียบเดือนก่อน) — ใช้ทั้งหน้า Staff และอีเมลอัตโนมัติ ----------
// month = 'yyyy-MM' (ไม่ระบุ = เดือนที่แล้ว)
function monthlyReport_(month) {
  const now = new Date();
  const today = fmtDate_(now);
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) {
    const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
    month = (m === 1 ? y - 1 : y) + '-' + ('0' + (m === 1 ? 12 : m - 1)).slice(-2);
  }
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  const prev = (m === 1 ? y - 1 : y) + '-' + ('0' + (m === 1 ? 12 : m - 1)).slice(-2);
  const daysIn = (yy, mm) => new Date(yy, mm, 0).getDate();
  // เดือนปัจจุบัน: นับถึงวันนี้
  const daysOf = key => (key === today.slice(0, 7) ? Number(today.slice(8, 10)) : daysIn(Number(key.slice(0, 4)), Number(key.slice(5, 7))));
  const participants = readParticipants_();
  const active = participants.filter(p => p.active);
  const records = readRecords_(participants).filter(r => r.status === 'active');
  const stats = key => {
    const rs = records.filter(r => r.date.slice(0, 7) === key);
    const days = daysOf(key), expected = active.length * days;
    return {
      month: key, days: days, participants: active.length, records: rs.length,
      rate: expected ? Math.round(rs.length / expected * 1000) / 10 : 0,
      agent: rs.filter(r => r.type === SALES_TYPES[1]).length,
      anomalies: rs.filter(r => r.anomaly).length, nogps: rs.filter(r => !r.hasGps).length,
      duplicates: rs.filter(r => r.dup).length, lowAccuracy: rs.filter(r => r.lowAccuracy).length,
      offline: rs.filter(r => r.source === 'app-offline').length, rows: rs
    };
  };
  const cur = stats(month), before = stats(prev);
  const people = active.map(p => {
    const rs = cur.rows.filter(r => r.userId === p.id);
    const dates = {};
    rs.forEach(r => { dates[r.date] = 1; });
    const sent = Object.keys(dates).length, agent = rs.filter(r => r.type === SALES_TYPES[1]).length;
    const prevSent = Object.keys(before.rows.filter(r => r.userId === p.id).reduce((a, r) => { a[r.date] = 1; return a; }, {})).length;
    return { id: p.id, name: p.name, site: p.site, sent: sent, missed: Math.max(0, cur.days - sent), agent: agent, overAgent: agent > AGENT_LIMIT_PER_MONTH,
      issues: rs.filter(r => r.anomaly || !r.hasGps || r.dup || r.lowAccuracy).length, prevSent: prevSent,
      rate: cur.days ? Math.round(sent / cur.days * 100) : 0 };
  }).sort((a, b) => a.rate - b.rate || a.name.localeCompare(b.name));
  const contacts = readContacts_('', 2000).filter(c => fmtDate_(new Date(c.ts)).slice(0, 7) === month).length;
  const strip = s => { const o = Object.assign({}, s); delete o.rows; return o; };
  return {
    month: month, previous: prev, generatedAt: now.getTime(),
    current: strip(cur), before: strip(before), people: people, contacts: contacts,
    perfect: people.filter(p => p.missed === 0).length, overAgent: people.filter(p => p.overAgent).length
  };
}

// ---------- รายงานสำหรับยื่นหน่วยงาน (มาตรา 35: การให้สัมปทาน/จัดสถานที่จำหน่ายสินค้า) ----------
// ข้อมูลบริษัทตั้งใน Script Properties: COMPANY_NAME, COMPANY_ADDRESS, COMPANY_TAX_ID, EMPLOYER_ACCOUNT_NO, COMPANY_CONTACT
function staffSection35_(req) {
  const now = new Date(), today = fmtDate_(now);
  const year = /^\d{4}$/.test(String(req.year || '')) ? String(req.year) : today.slice(0, 4);
  const from = year + '-01-01', to = year === today.slice(0, 4) ? today : year + '-12-31';
  const participants = readParticipants_();
  const records = readRecords_(participants).filter(r => r.status === 'active' && r.date >= from && r.date <= to);
  const dayDiff = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000) + 1;
  const rows = participants.filter(p => p.active || records.some(r => r.userId === p.id)).map(p => {
    const rs = records.filter(r => r.userId === p.id);
    const dates = Object.keys(rs.reduce((a, r) => { a[r.date] = 1; return a; }, {})).sort();
    const start = dates[0] || '', end = dates[dates.length - 1] || '';
    const expected = start ? dayDiff(start, to) : 0;
    const months = {};
    rs.forEach(r => { const k = r.date.slice(0, 7); months[k] = (months[k] || 0) + 1; });
    return {
      id: p.id, name: p.name, status: p.status, site: p.site, siteLat: p.siteLat, siteLng: p.siteLng, phone: p.phone, active: p.active,
      start: start, end: end, daysWorked: dates.length, daysExpected: expected, missed: Math.max(0, expected - dates.length),
      rate: expected ? Math.round(dates.length / expected * 1000) / 10 : 0,
      agentDays: rs.filter(r => r.type === SALES_TYPES[1]).length, months: months
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'th'));
  return {
    success: true, year: year, from: from, to: to, generatedAt: now.getTime(),
    company: {
      name: prop_('COMPANY_NAME'), address: prop_('COMPANY_ADDRESS'), taxId: prop_('COMPANY_TAX_ID'),
      employerNo: prop_('EMPLOYER_ACCOUNT_NO'), contact: prop_('COMPANY_CONTACT')
    },
    rows: rows,
    totals: { participants: rows.length, daysWorked: rows.reduce((a, r) => a + r.daysWorked, 0), daysExpected: rows.reduce((a, r) => a + r.daysExpected, 0), agentDays: rows.reduce((a, r) => a + r.agentDays, 0) }
  };
}
