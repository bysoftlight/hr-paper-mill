// js/staff/reports.js — รายงานสำเร็จรูป: รายงานประจำเดือน (เทียบเดือนก่อน) และรายงานการให้สิทธิ์ตามมาตรา 35
// "ดู / พิมพ์ PDF" เปิดหน้าพร้อมพิมพ์ในแท็บใหม่ (สั่งพิมพ์ → บันทึกเป็น PDF ได้ทุกเครื่อง)

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const thMonthKey = k => `${TH_MONTHS[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(0, 4)) + 543}`;

VIEWS.reports = {
    init() {
        const now = bkkParts();
        const prev = new Date(now.y, now.m - 1, 1);
        $('repMonth').value = `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}`;
        $('repMonth').max = `${now.y}-${pad2(now.m + 1)}`;
        $('repYear').innerHTML = [0, 1, 2].map(i => `<option value="${now.y - i}">ปี ${now.y - i + 543}</option>`).join('');
        document.querySelectorAll('[data-report]').forEach(b => b.addEventListener('click', () => this.run(b.dataset.report, b.dataset.out, b)));
    },

    async run(kind, out, btn) {
        if (!can('export')) return toast('ไม่มีสิทธิ์ส่งออกข้อมูล');
        // เปิดแท็บไว้ก่อน (เบราว์เซอร์บล็อกหน้าต่างที่เปิดหลังรอข้อมูล)
        const win = out === 'view' ? window.open('', '_blank') : null;
        if (win) win.document.write('<meta charset="utf-8"><p style="font-family:sans-serif;padding:24px">กำลังสร้างรายงาน…</p>');
        btn.disabled = true; btn.classList.add('is-busy');
        try {
            if (kind === 'monthly') {
                const month = $('repMonth').value;
                if (out === 'email') {
                    const ok = await showMessage({ title: 'ส่งรายงานทางอีเมล?', text: `ส่งรายงานประจำเดือน ${thMonthKey(month)} ไปยังผู้รับที่ตั้งไว้ (REPORT_EMAILS) ตอนนี้`, okText: 'ส่ง', cancelText: 'ยกเลิก' });
                    if (!ok) return;
                    const r = await api('staff.report.monthly.send', { month });
                    return r.success ? toast(`ส่งแล้วถึง ${r.sentTo.length} อีเมล`) : showMessage({ title: 'ส่งไม่สำเร็จ', text: r.message || '', tone: 'bad' });
                }
                const r = await api('staff.report.monthly', { month });
                if (!r.success) throw new Error(r.message || 'โหลดรายงานไม่สำเร็จ');
                if (out === 'xlsx') return this.monthlyXlsx(r.report);
                this.write(win, `รายงานประจำเดือน ${thMonthKey(r.report.month)}`, this.monthlyHtml(r.report));
            } else {
                const r = await api('staff.report.section35', { year: $('repYear').value });
                if (!r.success) throw new Error(r.message || 'โหลดรายงานไม่สำเร็จ');
                if (out === 'xlsx') return this.s35Xlsx(r);
                this.write(win, `รายงานการให้สิทธิ์ตามมาตรา 35 ปี ${Number(r.year) + 543}`, this.s35Html(r));
            }
            api('staff.log.client', { logAction: out === 'xlsx' ? 'export.xlsx' : 'export.pdf', target: kind === 'monthly' ? 'รายงานประจำเดือน ' + $('repMonth').value : 'รายงานมาตรา 35 ปี ' + $('repYear').value, details: {} });
        } catch (e) {
            if (win) win.close();
            showMessage({ title: 'สร้างรายงานไม่สำเร็จ', text: e.message, tone: 'bad' });
        } finally {
            btn.disabled = false; btn.classList.remove('is-busy');
        }
    },

    write(win, title, body) {
        if (!win) return;
        win.document.open();
        win.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&display=swap">
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; background: #F0F4F9; font: 13px/1.5 'Noto Sans Thai', Tahoma, sans-serif; color: #1F1F1F; }
  .bar { position: sticky; top: 0; display: flex; gap: 8px; justify-content: center; padding: 10px; background: rgba(255,255,255,.95); border-bottom: 1px solid #DDE3EA; }
  .bar button { font: inherit; font-weight: 500; border: 0; border-radius: 999px; padding: 10px 20px; background: #0850D1; color: #fff; cursor: pointer; }
  .bar button.alt { background: #fff; color: #0850D1; border: 1px solid #ABB0B6; }
  .page { max-width: 210mm; margin: 16px auto; padding: 14mm 12mm; background: #fff; border-radius: 16px; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 2px; } h2 { font-size: 15px; font-weight: 600; margin: 18px 0 8px; }
  .sub { color: #5F6368; margin: 0 0 14px; }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .card { padding: 10px 12px; border-radius: 12px; background: #F0F4F9; } .card small { display: block; color: #5F6368; font-size: 11px; }
  .card b { font-size: 20px; font-weight: 600; } .up { color: #146C2E; } .down { color: #B3261E; } .muted { color: #5F6368; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; } th { background: #F0F4F9; color: #444746; font-weight: 500; text-align: left; padding: 6px; }
  td { padding: 5px 6px; border-bottom: 1px solid #E9EEF6; vertical-align: top; } td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  tr { break-inside: avoid; } .bad { color: #B3261E; font-weight: 600; }
  .kv { display: grid; grid-template-columns: 160px 1fr; gap: 4px 12px; } .kv span:nth-child(odd) { color: #5F6368; }
  .fill { display: inline-block; min-width: 180px; border-bottom: 1px dotted #5F6368; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 36px; text-align: center; break-inside: avoid; }
  .sign div { padding-top: 40px; border-top: 0; } .sign .line { border-bottom: 1px dotted #1F1F1F; height: 40px; margin-bottom: 6px; }
  .note { font-size: 11px; color: #5F6368; margin-top: 12px; }
  @media print { body { background: #fff; } .bar { display: none; } .page { margin: 0; padding: 0; border-radius: 0; max-width: none; } }
  @media (max-width: 640px) { .page { margin: 0; border-radius: 0; padding: 18px 14px; } .cards { grid-template-columns: 1fr 1fr; } .kv { grid-template-columns: 1fr; } table { font-size: 11px; } }
</style></head><body><div class="bar"><button onclick="print()">พิมพ์ / บันทึกเป็น PDF</button><button class="alt" onclick="close()">ปิด</button></div><div class="page">${body}</div></body></html>`);
        win.document.close();
    },

    monthlyHtml(r) {
        const c = r.current, b = r.before;
        const d = (a, z, u = '') => { const v = Math.round((a - z) * 10) / 10; return v ? `<span class="${v > 0 ? 'up' : 'down'}">${v > 0 ? '▲' : '▼'} ${Math.abs(v)}${u}</span>` : '<span class="muted">เท่าเดิม</span>'; };
        return `<h1>รายงานประจำเดือน ${thMonthKey(r.month)}</h1>
          <p class="sub">HR Paper Mill · โครงการใช้สิทธิ์สัมปทานผู้พิการตามมาตรา 35 · เทียบกับ ${thMonthKey(r.previous)} · สร้างเมื่อ ${thDateTime(r.generatedAt)}</p>
          <div class="cards">
            <div class="card"><small>อัตราการส่ง</small><b>${c.rate}%</b><br>${d(c.rate, b.rate, ' จุด')}</div>
            <div class="card"><small>จำนวนรายงาน</small><b>${fmtNum(c.records)}</b><br>${d(c.records, b.records)}</div>
            <div class="card"><small>ส่งครบทุกวัน</small><b>${r.perfect}/${c.participants}</b><br><span class="muted">คน (${c.days} วัน)</span></div>
            <div class="card"><small>ขายโดยตัวแทน</small><b>${fmtNum(c.agent)}</b><br>${d(c.agent, b.agent)}</div>
            <div class="card"><small>ต้องตรวจสอบ</small><b>${fmtNum(c.anomalies + c.nogps + c.duplicates + c.lowAccuracy)}</b><br><span class="muted">ตำแหน่ง ${c.anomalies} · ไม่มี GPS ${c.nogps} · รูปซ้ำ ${c.duplicates} · GPS ไม่แม่น ${c.lowAccuracy}</span></div>
            <div class="card"><small>เกินโควตาตัวแทน</small><b>${r.overAgent} คน</b><br><span class="muted">ติดต่อ ${r.contacts} ครั้ง · ส่งย้อนหลัง ${c.offline}</span></div>
          </div>
          <h2>รายบุคคล (เรียงจากอัตราการส่งน้อยไปมาก)</h2>
          <table><thead><tr><th>#</th><th>ผู้ใช้สิทธิ์</th><th>จุดขาย</th><th class="n">วันที่ส่ง</th><th class="n">ขาด</th><th class="n">อัตรา</th><th class="n">เทียบเดือนก่อน</th><th class="n">ตัวแทน</th><th class="n">ต้องตรวจ</th></tr></thead><tbody>
          ${r.people.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}<br><span class="muted">${esc(p.id)}</span></td><td>${esc(p.site || '-')}</td><td class="n">${p.sent}/${c.days}</td><td class="n ${p.missed ? 'bad' : ''}">${p.missed}</td><td class="n">${p.rate}%</td><td class="n">${d(p.sent, p.prevSent, ' วัน')}</td><td class="n ${p.overAgent ? 'bad' : ''}">${p.agent}</td><td class="n">${p.issues || '-'}</td></tr>`).join('')}
          </tbody></table>
          <p class="note">อัตราการส่ง = จำนวนรายงาน ÷ (ผู้ใช้สิทธิ์ที่ใช้งาน × จำนวนวันในเดือน) · ตัวแทนเกิน ${10} ครั้ง/เดือน แสดงเป็นสีแดง (ข้อ 1.3)</p>`;
    },

    s35Html(r) {
        const co = r.company, f = v => (v ? esc(v) : '<span class="fill"></span>');
        const yearTh = Number(r.year) + 543;
        return `<h1>รายงานผลการให้สิทธิ์แก่คนพิการตามมาตรา 35</h1>
          <p class="sub">การให้สัมปทาน / จัดสถานที่จำหน่ายสินค้าหรือบริการ · ประจำปี ${yearTh} (ข้อมูล ${thDate(r.from)} – ${thDate(r.to)})</p>
          <h2>1. ข้อมูลสถานประกอบการ</h2>
          <div class="kv"><span>ชื่อสถานประกอบการ</span><span>${f(co.name)}</span><span>เลขประจำตัวผู้เสียภาษี</span><span>${f(co.taxId)}</span>
            <span>เลขที่บัญชีนายจ้าง (ประกันสังคม)</span><span>${f(co.employerNo)}</span><span>ที่อยู่</span><span>${f(co.address)}</span><span>ผู้ประสานงาน / โทร</span><span>${f(co.contact)}</span></div>
          <h2>2. สรุป</h2>
          <div class="kv"><span>จำนวนคนพิการที่ได้รับสิทธิ์</span><span>${r.totals.participants} คน</span><span>รูปแบบการให้สิทธิ์</span><span>จัดสถานที่จำหน่ายสินค้าหรือบริการ (มาตรา 35)</span>
            <span>รวมวันที่ปฏิบัติ</span><span>${fmtNum(r.totals.daysWorked)} วัน จากที่ควรปฏิบัติ ${fmtNum(r.totals.daysExpected)} วัน</span></div>
          <h2>3. รายชื่อคนพิการที่ได้รับสิทธิ์</h2>
          <table><thead><tr><th>#</th><th>ชื่อ-สกุล</th><th>เลขประจำตัวประชาชน</th><th>ประเภทความพิการ</th><th>สถานที่จำหน่าย</th><th>ระยะเวลา</th><th class="n">วันที่ปฏิบัติ</th><th class="n">ร้อยละ</th></tr></thead><tbody>
          ${r.rows.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}<br><span class="muted">รหัส ${esc(p.id)}${p.active ? '' : ' · ปิดใช้งาน'}</span></td><td><span class="fill" style="min-width:110px"></span></td><td><span class="fill" style="min-width:70px"></span></td><td>${esc(p.site || '-')}${p.siteLat !== null && p.siteLat !== undefined ? `<br><span class="muted">${Number(p.siteLat).toFixed(5)}, ${Number(p.siteLng).toFixed(5)}</span>` : ''}</td><td>${p.start ? `${thDate(p.start)} –<br>${thDate(p.end)}` : '-'}</td><td class="n">${p.daysWorked}/${p.daysExpected}</td><td class="n">${p.rate}%</td></tr>`).join('')}
          </tbody></table>
          <p class="note">ข้อมูลจากระบบ HR Paper Mill (รายงานประจำวันพร้อมภาพถ่ายและพิกัด GPS) · ช่องเลขประจำตัวประชาชนและประเภทความพิการ ระบบไม่ได้เก็บไว้ กรุณากรอกตามบัตรประจำตัวคนพิการ · ตรวจรูปแบบแบบฟอร์มกับหน่วยงานที่ยื่นอีกครั้งก่อนส่ง · สร้างเมื่อ ${thDateTime(r.generatedAt)}</p>
          <div class="sign"><div><div class="line"></div>ผู้จัดทำรายงาน<br>(....................................................)<br>ตำแหน่ง ........................................</div><div><div class="line"></div>ผู้มีอำนาจลงนาม<br>(....................................................)<br>ตำแหน่ง ........................................</div></div>`;
    },

    async monthlyXlsx(r) {
        await VIEWS.exporter.loadXlsx();
        const c = r.current, b = r.before, wb = XLSX.utils.book_new();
        const summary = [['รายงานประจำเดือน', thMonthKey(r.month), 'เทียบกับ', thMonthKey(r.previous)], [],
            ['ตัวชี้วัด', thMonthKey(r.month), thMonthKey(r.previous)],
            ['ผู้ใช้สิทธิ์ (คน)', c.participants, b.participants], ['จำนวนวัน', c.days, b.days], ['จำนวนรายงาน', c.records, b.records],
            ['อัตราการส่ง (%)', c.rate, b.rate], ['ขายโดยตัวแทน', c.agent, b.agent], ['ตำแหน่งผิดปกติ', c.anomalies, b.anomalies],
            ['ไม่มี GPS', c.nogps, b.nogps], ['รูปซ้ำ', c.duplicates, b.duplicates], ['GPS ไม่แม่น', c.lowAccuracy, b.lowAccuracy], ['ส่งย้อนหลัง (ออฟไลน์)', c.offline, b.offline],
            [], ['ส่งครบทุกวัน (คน)', r.perfect], ['เกินโควตาตัวแทน (คน)', r.overAgent], ['บันทึกการติดต่อ (ครั้ง)', r.contacts]];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'สรุป');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['รหัส', 'ชื่อ', 'จุดขาย', 'วันที่ส่ง', 'ขาด', 'อัตรา (%)', 'วันที่ส่งเดือนก่อน', 'ขายโดยตัวแทน', 'เกินโควตา', 'ต้องตรวจสอบ']]
            .concat(r.people.map(p => [p.id, p.name, p.site, p.sent, p.missed, p.rate, p.prevSent, p.agent, p.overAgent ? 'เกิน' : '', p.issues]))), 'รายบุคคล');
        XLSX.writeFile(wb, `รายงานประจำเดือน-${r.month}.xlsx`);
        toast('ดาวน์โหลดไฟล์ Excel แล้ว');
    },

    async s35Xlsx(r) {
        await VIEWS.exporter.loadXlsx();
        const co = r.company, wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
            ['รายงานผลการให้สิทธิ์แก่คนพิการตามมาตรา 35', `ปี ${Number(r.year) + 543}`], [],
            ['ชื่อสถานประกอบการ', co.name], ['เลขประจำตัวผู้เสียภาษี', co.taxId], ['เลขที่บัญชีนายจ้าง', co.employerNo], ['ที่อยู่', co.address], ['ผู้ประสานงาน', co.contact], [],
            ['จำนวนคนพิการที่ได้รับสิทธิ์', r.totals.participants], ['รวมวันที่ปฏิบัติ', r.totals.daysWorked], ['วันที่ควรปฏิบัติ', r.totals.daysExpected]]), 'สถานประกอบการ');
        const months = Array.from({ length: 12 }, (_, i) => `${r.year}-${pad2(i + 1)}`);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ลำดับ', 'รหัส', 'ชื่อ-สกุล', 'เลขประจำตัวประชาชน', 'ประเภทความพิการ', 'การใช้สิทธิ์', 'สถานที่จำหน่าย', 'ละติจูด', 'ลองจิจูด', 'โทร', 'วันเริ่ม', 'วันล่าสุด', 'วันที่ปฏิบัติ', 'วันที่ควรปฏิบัติ', 'ร้อยละ', 'ขายโดยตัวแทน (ครั้ง)'].concat(months.map(thMonthKey))]
            .concat(r.rows.map((p, i) => [i + 1, p.id, p.name, '', '', p.status, p.site, p.siteLat, p.siteLng, p.phone, p.start, p.end, p.daysWorked, p.daysExpected, p.rate, p.agentDays].concat(months.map(m => p.months[m] || 0))))), 'รายชื่อผู้ได้รับสิทธิ์');
        XLSX.writeFile(wb, `รายงานมาตรา35-${r.year}.xlsx`);
        toast('ดาวน์โหลดไฟล์ Excel แล้ว');
    }
};
