// ใบแจ้งหนี้เป็นไฟล์ PDF (ใช้ได้ทั้ง Dev Console และหน้าบัญชีของผู้ดูแลการเงิน)
// เดิมเปิดหน้าต่างใหม่แล้วสั่งพิมพ์ — แอปบนหน้าจอโฮมของ iPhone/iPad เปิดหน้าต่างใหม่/พิมพ์ไม่ได้ จึงสร้างไฟล์ PDF ในหน้าเดิมแทน
// แล้วให้ผู้ใช้แตะ "บันทึก / แชร์" (การแชร์ไฟล์ต้องเกิดจากการแตะโดยตรง)

// ส่งไฟล์ให้ผู้ใช้: มือถือ/แท็บเล็ต = แผ่นแชร์ของระบบ (บันทึกลงไฟล์/ส่งต่อได้) · คอมพิวเตอร์ = ดาวน์โหลดทันที
const FileOffer = (() => {
    const touch = () => window.matchMedia && matchMedia('(pointer: coarse)').matches;
    function download(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    async function share(blob, name, title) {
        const file = new File([blob], name, { type: blob.type || 'application/pdf' });
        if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
            try { await navigator.share({ files: [file], title }); return true; }
            catch (e) { if (e && e.name === 'AbortError') return true; }
        }
        download(blob, name);
        return true;
    }
    // ไฟล์พร้อมแล้ว → ถามก่อนบนมือถือ (ได้การแตะใหม่ให้ใช้แผ่นแชร์) · คอมพิวเตอร์ดาวน์โหลดเลย
    async function offer(blob, name, title) {
        if (!touch()) { download(blob, name); toast('ดาวน์โหลด ' + name + ' แล้ว'); return; }
        const go = await showMessage({ title: 'ไฟล์พร้อมแล้ว', text: name, tone: 'ok', okText: 'บันทึก / แชร์', cancelText: 'ปิด' });
        if (go) await share(blob, name, title);
    }
    return { offer, download, share };
})();

const Invoice = (() => {
    const CYCLE = { monthly: 'รายเดือน', yearly: 'รายปี' };
    const ACC = { bank: 'บัญชีธนาคาร', promptpay: 'พร้อมเพย์', other: 'อื่นๆ' };
    const money = n => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
    const day = t => (t ? thDate(t, { day: 'numeric', month: 'short', year: '2-digit' }) : '-');
    // inv: { id, status, issued, due, paidAt, ref, amount, planName, cycle, periodStart, periodEnd, note, account }
    // org: { name, address, taxId, contact, phone, email } · accounts: [{ id, bank, type, number, name, branch }]
    function page(inv, org, accounts) {
        const paid = inv.status === 'paid';
        const acc = paid ? accounts.filter(a => a.id && a.id === inv.account) : accounts;
        const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
        const el = document.createElement('section');
        el.className = 'pdf-page inv-page';
        el.innerHTML = `
          <header class="inv-top">
            <div><h1>ใบแจ้งหนี้</h1><p class="inv-muted">HR Paper Mill · พัฒนาและให้บริการโดย softlight</p></div>
            <div class="inv-meta"><b class="mono">${esc(inv.id)}</b><span class="inv-muted">ออกเมื่อ ${day(inv.issued)}</span>
              <span class="inv-stamp ${paid ? 'is-paid' : ''}">${paid ? 'ชำระแล้ว' : 'รอชำระ'}</span></div>
          </header>
          <table class="inv-table">
            ${row('ลูกค้า', `<b>${esc(org.name || inv.orgName || '-')}</b>${org.address ? '<br>' + esc(org.address) : ''}${org.taxId ? '<br>เลขผู้เสียภาษี ' + esc(org.taxId) : ''}`)}
            ${row('ผู้ติดต่อ', esc([org.contact, org.phone, org.email].filter(Boolean).join(' · ') || '-'))}
            ${row('รายการ', `ค่าบริการ HR Paper Mill แพลน ${esc(inv.planName || inv.plan || '')} (${CYCLE[inv.cycle] || inv.cycle || ''})<br><span class="inv-muted">รอบ ${day(inv.periodStart)} – ${day(inv.periodEnd)}</span>`)}
            ${row('ครบกำหนดชำระ', day(inv.due))}
            ${paid ? row('ชำระเมื่อ', `${day(inv.paidAt)}${inv.ref ? ' · อ้างอิง ' + esc(inv.ref) : ''}`) : ''}
            ${row('ยอดชำระ', `<span class="inv-total">${money(inv.amount)}</span>`)}
          </table>
          ${acc.length ? `<h3>${paid ? 'รับชำระเข้าบัญชี' : 'ช่องทางชำระเงิน'}</h3><table class="inv-table">${acc.map(a => row(esc(a.bank || ACC[a.type] || 'บัญชี'),
            `<b class="mono">${esc(a.number)}</b> · ${esc(a.name)}${a.branch ? ' · สาขา' + esc(a.branch) : ''}`)).join('')}</table>` : ''}
          ${inv.note ? `<p class="inv-muted">หมายเหตุ: ${esc(inv.note)}</p>` : ''}
          <footer class="pdf-foot"><span>softlight · HR Paper Mill</span><span>สร้างเมื่อ ${thDateTime(Date.now())}</span></footer>`;
        return el;
    }
    async function pdf(inv, org, accounts) {
        showLoading(true, 'กำลังสร้างไฟล์ PDF…');
        const stage = $('pdfStage');
        try {
            await loadScript('js/vendor/html2canvas.min.js?v=1.4.1');
            await loadScript('js/vendor/jspdf.umd.min.js?v=2.5.2');
            const el = page(inv, org || {}, accounts || []);
            stage.replaceChildren(el);
            await (document.fonts ? document.fonts.ready : Promise.resolve());
            const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: '#FFFFFF', logging: false });
            const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
            doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297);
            doc.setProperties({ title: 'ใบแจ้งหนี้ ' + inv.id, author: 'softlight' });
            const blob = doc.output('blob');
            showLoading(false);
            await FileOffer.offer(blob, inv.id + '.pdf', 'ใบแจ้งหนี้ ' + inv.id);
        } catch (e) {
            showLoading(false);
            showMessage({ title: 'สร้างไฟล์ PDF ไม่สำเร็จ', text: (e && e.message) || 'ลองใหม่อีกครั้ง', tone: 'bad' });
        } finally { stage.replaceChildren(); }
    }
    return { pdf, page };
})();
