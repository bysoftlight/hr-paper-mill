// Export.gs — ส่งออกข้อมูลเป็น Google Sheets และสรุปรายวันทางอีเมล (ตั้งเวลาได้)

// สร้างไฟล์ Google Sheets จากผลการกรอง แล้วแชร์ให้เจ้าหน้าที่ที่สั่งส่งออก (ถ้ามีอีเมล)
function staffExportGsheet_(req, staff, ua) {
  const rows = filterRecords_(readRecords_(), req.filters).sort((a, b) => a.ts - b.ts);
  if (rows.length > 20000) fail_('INVALID', 'ข้อมูลมากเกินไป (เกิน 20,000 รายการ) กรุณากรองช่วงเวลาให้แคบลง');
  const agg = aggregate_(rows);
  const title = 'HR Paper Mill — ' + clean_(req.title || 'รายงานการขาย', 120) + ' (' + fmtDate_(new Date(), 'yyyy-MM-dd HH:mm') + ')';
  const ss = SpreadsheetApp.create(title);

  const detail = ss.getSheets()[0];
  detail.setName('รายการ');
  const head = ['วันที่', 'เวลา', 'รหัส', 'ชื่อ-สกุล', 'จุดขาย', 'ประเภทการขาย', 'ละติจูด', 'ลองจิจูด', 'ห่างจากจุดขาย (ม.)', 'ตำแหน่งผิดปกติ', 'แผนที่', 'รูปหลักฐาน', 'หมายเหตุ', 'สถานะ', 'ที่มา'];
  // ข้อความจากผู้ใช้ผ่าน clean_ เสมอ กันการถูกตีความเป็นสูตรในไฟล์ใหม่
  const data = rows.map(r => [r.date, r.time, r.userId, clean_(r.userName), clean_(r.site), r.type, r.lat === null ? '' : r.lat, r.lng === null ? '' : r.lng,
    r.distance === null ? '' : r.distance, r.anomaly ? 'ใช่' : '', r.hasGps ? 'https://maps.google.com/maps?q=' + r.lat + ',' + r.lng : '',
    r.imageRaw, clean_(r.note), r.status === 'deleted' ? 'ลบแล้ว' : 'ใช้งาน', r.source === 'staff' ? 'เจ้าหน้าที่' : 'แอป']);
  detail.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#E7EDFB');
  if (data.length) detail.getRange(2, 1, data.length, head.length).setValues(data);
  detail.setFrozenRows(1);

  const people = ss.insertSheet('สรุปรายบุคคล');
  const pHead = ['รหัส', 'ชื่อ-สกุล', 'จุดขาย', 'จำนวนรายงาน', 'จำนวนวันที่ส่ง', 'ขายโดยตัวแทน', 'ตำแหน่งผิดปกติ'];
  const pData = agg.byUser.map(u => [u.id, clean_(u.name), clean_(u.site), u.count, u.days, u.agent, u.anomalies]);
  people.getRange(1, 1, 1, pHead.length).setValues([pHead]).setFontWeight('bold').setBackground('#E7EDFB');
  if (pData.length) people.getRange(2, 1, pData.length, pHead.length).setValues(pData);
  people.setFrozenRows(1);

  const daily = ss.insertSheet('สรุปรายวัน');
  const dData = Object.keys(agg.byDay).sort().map(d => [d, agg.byDay[d]]);
  daily.getRange(1, 1, 1, 2).setValues([['วันที่', 'จำนวนรายงาน']]).setFontWeight('bold').setBackground('#E7EDFB');
  if (dData.length) daily.getRange(2, 1, dData.length, 2).setValues(dData);

  const file = DriveApp.getFileById(ss.getId());
  const folderId = prop_('EXPORT_FOLDER_ID');
  if (folderId) { try { file.moveTo(DriveApp.getFolderById(folderId)); } catch (e) { console.warn('ย้ายไฟล์ไปโฟลเดอร์ส่งออกไม่ได้: ' + e); } }
  let shared = false;
  if (staff.email) { try { file.addEditor(staff.email); shared = true; } catch (e) { console.warn('แชร์ไฟล์ไม่ได้: ' + e); } }

  log_(staff, 'export.gsheet', title, { rows: rows.length, filters: req.filters, url: ss.getUrl() }, ua);
  return { success: true, url: ss.getUrl(), shared: shared, rows: rows.length };
}

// สรุปประจำวันทางอีเมล (ตั้ง Script Property SUMMARY_EMAILS แล้วรัน installDailySummaryTrigger ครั้งเดียว)
function sendDailySummary() {
  const to = prop_('SUMMARY_EMAILS');
  if (!to) return;
  const o = staffOverview_();
  const lines = [
    'สรุปการส่งรายงาน ' + o.today,
    'ส่งแล้ว ' + o.kpi.reportedToday + ' / ' + o.kpi.participants + ' คน · ยังไม่ส่ง ' + o.kpi.missingToday + ' คน',
    'ขายโดยตัวแทนวันนี้ ' + o.kpi.agentToday + ' · ตำแหน่งผิดปกติ ' + o.kpi.anomaliesToday + ' · ไม่มี GPS ' + o.kpi.nogpsToday,
    '',
    'ยังไม่ส่งรายงาน:',
  ].concat(o.missing.map(m => '- ' + m.id + ' ' + m.name + (m.site ? ' (' + m.site + ')' : '') + (m.phone ? ' โทร ' + m.phone : '')));
  if (o.agentWatch.length) {
    lines.push('', 'เฝ้าระวังขายโดยตัวแทน (เดือนนี้):');
    o.agentWatch.forEach(a => lines.push('- ' + a.id + ' ' + a.name + ' ' + a.used + '/' + a.limit + ' ครั้ง'));
  }
  MailApp.sendEmail(to, 'HR Paper Mill — สรุปรายงานวันที่ ' + o.today, lines.join('\n'));
  log_({ id: 'system', name: 'ระบบ', role: 'system' }, 'system.daily_summary', to, { reported: o.kpi.reportedToday, missing: o.kpi.missingToday }, '');
}

function installDailySummaryTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sendDailySummary').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendDailySummary').timeBased().everyDays(1).atHour(18).inTimezone(TZ).create();
  Logger.log('ตั้งเวลาส่งสรุปทุกวัน 18:00 น. แล้ว');
}
