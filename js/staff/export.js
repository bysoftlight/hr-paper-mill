// js/staff/export.js — ส่งออกผลการกรองเป็น Excel (.xlsx), PDF (A4) และ Google Sheets

VIEWS.exporter = {
    init() {
        document.querySelectorAll('[data-export]').forEach(b => b.addEventListener('click', () => this.run(b.dataset.export)));
    },

    open() {
        const rec = VIEWS.records;
        const total = rec.data ? rec.data.total : 0;
        $('exportScope').textContent = `${rec.rangeLabel()} · ${fmtNum(total)} รายการ${rec.activeFilterCount() ? ' · มีตัวกรอง ' + rec.activeFilterCount() + ' หมวด' : ''}`;
        showModal('exportModal');
    },

    loadXlsx() { return loadScript('js/vendor/xlsx.full.min.js?v=0.18.5'); },

    async fetchAll() {
        const rec = VIEWS.records;
        const r = await api('staff.records.list', { filters: rec.filters(), all: true, sort: 'ts_asc' });
        if (!r.success) throw new Error(r.message || 'โหลดข้อมูลไม่สำเร็จ');
        return r;
    },

    describeFilters() {
        const rec = VIEWS.records, F = rec.F, out = [['ช่วงเวลา', rec.rangeLabel()]];
        const names = id => { const p = (ST.participants || rec.knownUsers).find(u => u.id === id); return p ? `${p.name} (${id})` : id; };
        if (F.userIds.length) out.push(['ผู้ใช้สิทธิ์', F.userIds.map(names).join(', ')]);
        if (F.types.length) out.push(['ประเภท', F.types.join(', ')]);
        if (F.sites.length) out.push(['จุดขาย', F.sites.join(', ')]);
        if (F.location !== 'all') out.push(['ตำแหน่ง', { normal: 'ตรงจุดขาย', anomaly: 'ผิดปกติ', nogps: 'ไม่มี GPS', lowacc: 'GPS ไม่แม่น', duplicate: 'รูปซ้ำ', review: 'ต้องตรวจสอบทั้งหมด' }[F.location]]);
        if (F.status !== 'active') out.push(['สถานะ', F.status === 'deleted' ? 'ลบแล้ว' : 'ทั้งหมด']);
        if (F.q) out.push(['คำค้น', F.q]);
        return out;
    },

    fileBase() {
        const r = VIEWS.records.range();
        return `HR-PaperMill_รายงาน_${r.from || 'เริ่มต้น'}_${r.to || 'ล่าสุด'}`;
    },

    async run(kind) {
        $('exportModal').close();
        try {
            if (kind === 'gsheet') return await this.gsheet();
            showLoading(true, 'กำลังเตรียมข้อมูล…');
            const r = await this.fetchAll();
            if (!r.rows.length) { showLoading(false); return showMessage({ title: 'ไม่มีข้อมูลให้ส่งออก', text: 'ลองเปลี่ยนช่วงเวลาหรือตัวกรอง', tone: 'warn' }); }
            if (kind === 'xlsx') await this.xlsx(r);
            if (kind === 'pdf') await this.pdf(r);
        } catch (e) {
            showMessage({ title: 'ส่งออกไม่สำเร็จ', text: String(e.message || e), tone: 'bad' });
        } finally {
            showLoading(false);
        }
    },

    // ---------- Excel ----------
    async xlsx(r) {
        showLoading(true, 'กำลังสร้างไฟล์ Excel…');
        await this.loadXlsx();
        const a = r.agg, wb = XLSX.utils.book_new();
        const sheet = (rows, widths) => { const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true }); ws['!cols'] = widths.map(w => ({ wch: w })); return ws; };

        const summary = [['HR Paper Mill — รายงานการส่ง'], ['สร้างเมื่อ', new Date()], ['สร้างโดย', `${ST.me.name}${ST.me.email ? ' (' + ST.me.email + ')' : ''}`], []]
            .concat(this.describeFilters(), [[], ['สรุป'], ['จำนวนรายการ', a.total], ['จำนวนผู้ใช้สิทธิ์', a.users], ['ขายด้วยตัวเอง', a.self], ['ขายโดยตัวแทน', a.agent], ['ตำแหน่งผิดปกติ', a.anomalies], ['ไม่มี GPS', a.nogps]]);
        XLSX.utils.book_append_sheet(wb, sheet(summary, [22, 60]), 'สรุป');

        const detail = [['วันที่', 'เวลา', 'รหัส', 'ชื่อ-สกุล', 'จุดขาย', 'ประเภทการขาย', 'ละติจูด', 'ลองจิจูด', 'ห่างจากจุดขาย (ม.)', 'ตำแหน่งผิดปกติ', 'แผนที่', 'หมายเหตุ', 'สถานะ', 'ที่มา']]
            .concat(r.rows.map(x => [parseIso(x.date), x.time, x.userId, x.userName, x.site, x.type, x.lat, x.lng, x.distance, x.anomaly ? 'ใช่' : '',
                x.mapUrl, x.note, x.status === 'deleted' ? 'ลบแล้ว' : 'ใช้งาน', x.source === 'staff' ? 'เจ้าหน้าที่' : 'แอป']));
        const wsD = sheet(detail, [12, 8, 9, 24, 22, 20, 11, 11, 10, 10, 40, 30, 9, 10]);
        // ลิงก์แผนที่กดได้ใน Excel
        r.rows.forEach((x, i) => { if (x.mapUrl) { const c = wsD[XLSX.utils.encode_cell({ r: i + 1, c: 10 })]; if (c) c.l = { Target: x.mapUrl }; } });
        wsD['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r.rows.length, c: 13 } }) };
        XLSX.utils.book_append_sheet(wb, wsD, 'รายการ');

        XLSX.utils.book_append_sheet(wb, sheet([['รหัส', 'ชื่อ-สกุล', 'จุดขาย', 'จำนวนรายงาน', 'จำนวนวันที่ส่ง', 'ขายโดยตัวแทน', 'ตำแหน่งผิดปกติ']]
            .concat(a.byUser.map(u => [u.id, u.name, u.site, u.count, u.days, u.agent, u.anomalies])), [9, 24, 22, 12, 12, 12, 12]), 'สรุปรายบุคคล');
        XLSX.utils.book_append_sheet(wb, sheet([['วันที่', 'จำนวนรายงาน']].concat(Object.keys(a.byDay).sort().map(d => [parseIso(d), a.byDay[d]])), [14, 14]), 'สรุปรายวัน');
        XLSX.utils.book_append_sheet(wb, sheet([['จุดขาย', 'จำนวนรายงาน']].concat(Object.keys(a.bySite).sort((x, y) => a.bySite[y] - a.bySite[x]).map(s => [s, a.bySite[s]])), [28, 14]), 'ตามจุดขาย');

        XLSX.writeFile(wb, this.fileBase() + '.xlsx', { compression: true });
        api('staff.log.client', { logAction: 'export.xlsx', target: VIEWS.records.rangeLabel(), details: { rows: r.rows.length, filters: VIEWS.records.filters() } });
        toast('ดาวน์โหลดไฟล์ Excel แล้ว');
    },

    // ---------- Google Sheets ----------
    async gsheet() {
        showLoading(true, 'กำลังสร้าง Google Sheets…');
        const rec = VIEWS.records;
        const r = await api('staff.export.gsheet', { filters: rec.filters(), title: 'รายงาน ' + rec.rangeLabel() });
        showLoading(false);
        if (!r.success) return showMessage({ title: 'สร้าง Google Sheets ไม่สำเร็จ', text: r.message, tone: 'bad' });
        const open = await showMessage({
            title: 'สร้าง Google Sheets แล้ว',
            text: `${fmtNum(r.rows)} รายการ · ${r.shared ? 'แชร์สิทธิ์แก้ไขให้อีเมลของคุณแล้ว' : 'บัญชีของคุณไม่มีอีเมล — เปิดไฟล์จาก Drive ของเจ้าของระบบ'}`,
            tone: 'ok', okText: 'เปิดไฟล์', cancelText: 'ปิด'
        });
        if (open) window.open(r.url, '_blank', 'noopener');
    },

    // ---------- PDF ----------
    async pdf(r) {
        const MAX = 2500;
        if (r.rows.length > MAX) throw new Error(`ข้อมูล ${fmtNum(r.rows.length)} รายการ มากเกินไปสำหรับ PDF (สูงสุด ${fmtNum(MAX)}) กรุณากรองให้แคบลง หรือส่งออกเป็น Excel`);
        showLoading(true, 'กำลังเตรียม PDF…');
        await loadScript('js/vendor/html2canvas.min.js?v=1.4.1');
        await loadScript('js/vendor/jspdf.umd.min.js?v=2.5.2');
        const pages = this.buildPages(r);
        const stage = $('pdfStage');
        stage.replaceChildren(...pages);
        await (document.fonts ? document.fonts.ready : Promise.resolve());
        const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
        const mmPerPx = 210 / 794;
        for (let i = 0; i < pages.length; i++) {
            showLoading(true, `กำลังสร้าง PDF… หน้า ${i + 1}/${pages.length}`);
            const canvas = await window.html2canvas(pages[i], { scale: 2, backgroundColor: '#FFFFFF', logging: false });
            if (i) pdf.addPage();
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', 0, 0, 210, 297);
            const base = pages[i].getBoundingClientRect();
            pages[i].querySelectorAll('a[href]').forEach(a => {
                const b = a.getBoundingClientRect();
                pdf.link((b.left - base.left) * mmPerPx, (b.top - base.top) * mmPerPx, b.width * mmPerPx, b.height * mmPerPx, { url: a.href });
            });
        }
        pdf.setProperties({ title: 'HR Paper Mill — รายงาน ' + VIEWS.records.rangeLabel(), author: ST.me.name });
        pdf.save(this.fileBase() + '.pdf');
        stage.replaceChildren();
        api('staff.log.client', { logAction: 'export.pdf', target: VIEWS.records.rangeLabel(), details: { rows: r.rows.length, filters: VIEWS.records.filters() } });
        toast('ดาวน์โหลดไฟล์ PDF แล้ว');
    },

    buildPages(r) {
        const title = 'รายงานการส่ง · ' + VIEWS.records.rangeLabel();
        const FIRST = 16, PER = 27, a = r.agg;
        const chunks = [r.rows.slice(0, FIRST)];
        for (let i = FIRST; i < r.rows.length; i += PER) chunks.push(r.rows.slice(i, i + PER));
        const people = a.byUser.slice(0, 40);
        const total = chunks.length + 1;
        const shell = (n) => {
            const page = document.createElement('section');
            page.className = 'pdf-page';
            page.innerHTML = `<header class="pdf-head"><div class="pdf-brand"><img class="logo" src="img/logo.png" alt=""><span><b>HR Paper Mill</b><small>Dashboard เจ้าหน้าที่ · โครงการมาตรา 35</small></span></div><div class="pdf-title">${esc(title)}</div></header><div class="pdf-body"></div>
              <footer class="pdf-foot"><span>สร้างโดย ${esc(ST.me.name)} · ${thDateTime(Date.now())}</span><span class="mono">หน้า ${n}/${total}</span></footer>`;
            return page;
        };
        const pages = [];
        // หน้า 1: ตัวกรอง + สรุป + รายบุคคล
        const p1 = shell(1);
        p1.querySelector('.pdf-body').innerHTML = `
          <div class="pdf-user">${this.describeFilters().slice(0, 3).map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div>
          <div class="pdf-tiles">
            <div class="pdf-tile"><small>รายการทั้งหมด</small><b>${fmtNum(a.total)}</b><span>${fmtNum(a.users)} คน</span></div>
            <div class="pdf-tile"><small>ขายด้วยตัวเอง</small><b>${fmtNum(a.self)}</b><span>รายการ</span></div>
            <div class="pdf-tile ${a.agent ? 'is-warn' : ''}"><small>ขายโดยตัวแทน</small><b>${fmtNum(a.agent)}</b><span>รายการ</span></div>
            <div class="pdf-tile ${a.anomalies ? 'is-bad' : ''}"><small>ตำแหน่งผิดปกติ</small><b>${fmtNum(a.anomalies)}</b><span>ไม่มี GPS ${fmtNum(a.nogps)}</span></div>
          </div>
          <div><h3 class="pdf-h3">สรุปรายบุคคล${a.byUser.length > people.length ? ` (${people.length} คนแรกจาก ${a.byUser.length})` : ''}</h3>
          <table class="pdf-table"><thead><tr><th>#</th><th>ชื่อ-สกุล</th><th>จุดขาย</th><th>รายงาน</th><th>วันที่ส่ง</th><th>ตัวแทน</th><th>ผิดปกติ</th></tr></thead>
          <tbody>${people.map((u, i) => `<tr><td class="mono">${i + 1}</td><td>${esc(u.name)} <span class="pdf-muted mono">${esc(u.id)}</span></td><td>${esc(u.site || '-')}</td><td class="mono">${u.count}</td><td class="mono">${u.days}</td><td class="mono">${u.agent}</td><td class="mono">${u.anomalies || '-'}</td></tr>`).join('')}</tbody></table></div>`;
        pages.push(p1);
        // หน้าถัดไป: ตารางรายการ
        let no = 0;
        chunks.forEach((rows, ci) => {
            const pg = shell(pages.length + 1);
            pg.querySelector('.pdf-body').innerHTML = `<div><h3 class="pdf-h3">รายการ${ci ? ' (ต่อ)' : ''}</h3>
              <table class="pdf-table"><thead><tr><th>#</th><th>วันที่</th><th>เวลา</th><th>ผู้ใช้สิทธิ์</th><th>ประเภท</th><th>ตำแหน่ง</th></tr></thead>
              <tbody>${rows.map(x => `<tr><td class="mono">${++no}</td><td>${thDate(x.date)}</td><td class="mono">${esc(x.time)}</td><td>${esc(x.userName)} <span class="pdf-muted mono">${esc(x.userId)}</span></td>
                <td><span class="pdf-chip${x.type === AGENT_TYPE ? ' is-agent' : ''}"><span class="pdf-lift">${x.type === AGENT_TYPE ? 'โดยตัวแทน' : 'ขายเอง'}</span></span></td>
                <td>${x.hasGps ? `<a class="mono" href="${esc(x.mapUrl)}">${x.distance !== null ? fmtDistance(x.distance) : 'ดูแผนที่'}</a>${x.anomaly ? ' <b class="pdf-bad">ผิดปกติ</b>' : ''}` : '<span class="pdf-muted">ไม่มี GPS</span>'}</td></tr>`).join('')}</tbody></table></div>`;
            pages.push(pg);
        });
        return pages;
    }
};
