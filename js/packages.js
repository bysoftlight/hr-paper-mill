// js/packages.js — หน้าแพ็กเกจและราคา (packages.html) สำหรับเสนอลูกค้า
//   ข้อมูล: plans.public (apps-script/Billing.gs) — แพลนที่ Dev ตั้งให้ "แสดงในหน้าแพ็กเกจ" + บัญชีรับเงิน · โหลดไม่ได้ใช้ชุดตั้งต้น
//   ลิงก์ข้อเสนอเฉพาะลูกค้า (สร้างจาก Dev Console › แพลน › สร้างลิงก์ข้อเสนอ):
//     ?plans=starter,pro  แสดงเฉพาะแพลน · ?cycle=yearly · ?to=ชื่อลูกค้า · ?ref=เลขที่ · ?valid=YYYY-MM-DD · ?off=10 (ส่วนลด %) · ?note=ข้อความ
//   ดาวน์โหลด PNG / PDF (html2canvas + jsPDF) · แชร์ลิงก์ (Web Share / คัดลอก)
(() => {
    const $ = id => document.getElementById(id);
    const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ic = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
    const baht = n => '฿' + Math.round(Number(n) || 0).toLocaleString('th-TH');
    const thDate = iso => new Date(iso + 'T00:00:00+07:00').toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric' });
    const CACHE = 'HRPM_PKG';
    const DEFAULT = {
        plans: [
            { id: 'starter', name: 'Starter', tagline: 'เริ่มต้นสำหรับโครงการขนาดเล็ก', priceMonthly: 990, priceYearly: 9900, maxUsers: 50, maxStaff: 3, trialDays: 30, highlight: false,
                features: ['ผู้ใช้สิทธิ์สูงสุด 50 คน', 'เจ้าหน้าที่ 3 บัญชี', 'ส่งรายงานพร้อมรูปและพิกัด GPS', 'แดชบอร์ดภาพรวมและรายงาน', 'ส่งออก Excel / PDF'] },
            { id: 'pro', name: 'Pro', tagline: 'คุ้มที่สุดสำหรับองค์กรทั่วไป', priceMonthly: 2490, priceYearly: 24900, maxUsers: 300, maxStaff: 10, trialDays: 30, highlight: true,
                features: ['ผู้ใช้สิทธิ์สูงสุด 300 คน', 'เจ้าหน้าที่ 10 บัญชี', 'ทุกอย่างใน Starter', 'ตรวจจับพิกัดผิดปกติ / รูปซ้ำ', 'แจ้งเตือนแบบ Push และอีเมลรายงานประจำเดือน', 'สถิติการใช้งานแบบเรียลไทม์'] },
            { id: 'enterprise', name: 'Enterprise', tagline: 'สำหรับองค์กรขนาดใหญ่ ปรับแต่งได้', priceMonthly: 0, priceYearly: 0, maxUsers: 0, maxStaff: 0, trialDays: 30, highlight: false,
                features: ['ผู้ใช้สิทธิ์ไม่จำกัด', 'เจ้าหน้าที่ไม่จำกัด', 'ทุกอย่างใน Pro', 'ปรับแต่งรายงานและแบรนด์ขององค์กร', 'ผู้ดูแลเฉพาะ และ SLA'] }
        ],
        accounts: [], trialDays: 30, contact: {}
    };
    const FALLBACK_PHONE = '0858354911';

    // ---------- พารามิเตอร์ของลิงก์ ----------
    const q = new URLSearchParams(location.search);
    const offer = {
        plans: (q.get('plans') || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
        to: (q.get('to') || '').slice(0, 120), ref: (q.get('ref') || '').slice(0, 40), note: (q.get('note') || '').slice(0, 300),
        valid: /^\d{4}-\d{2}-\d{2}$/.test(q.get('valid') || '') ? q.get('valid') : '',
        off: Math.max(0, Math.min(90, Math.round(Number(q.get('off')) || 0)))
    };
    let cycle = q.get('cycle') === 'yearly' ? 'yearly' : 'monthly';
    let data = DEFAULT, live = false;
    try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c && Array.isArray(c.plans) && c.plans.length) data = c; } catch (e) {}

    const visible = () => {
        const list = data.plans.filter(p => !offer.plans.length || offer.plans.includes(p.id));
        return list.length ? list : data.plans;
    };
    const priceOf = p => {
        const base = cycle === 'yearly' ? (p.priceYearly || p.priceMonthly * 12) : p.priceMonthly;
        return { base, net: offer.off ? Math.round(base * (100 - offer.off) / 100) : base };
    };
    const lim = (n, unit) => (n ? `${Number(n).toLocaleString('th-TH')} ${unit}` : 'ไม่จำกัด');
    const contactHref = (plan) => {
        const c = data.contact || {};
        const subject = `สนใจ HR Paper Mill แพ็กเกจ ${plan ? plan.name : ''}${offer.to ? ' — ' + offer.to : ''}${offer.ref ? ' (' + offer.ref + ')' : ''}`;
        if (c.line) return /^https?:/.test(c.line) ? c.line : 'https://line.me/R/ti/p/' + encodeURIComponent(c.line);
        if (c.email) return `mailto:${c.email}?subject=${encodeURIComponent(subject)}`;
        return 'tel:' + String(c.phone || FALLBACK_PHONE).replace(/[^\d+]/g, '');
    };

    // ---------- แสดงผล ----------
    function renderHead() {
        if (offer.to) {
            $('pkgEyebrow').textContent = 'ข้อเสนอแพ็กเกจ';
            $('pkgTitle').textContent = `ข้อเสนอสำหรับ ${offer.to}`;
            document.title = `ข้อเสนอสำหรับ ${offer.to} — HR Paper Mill`;
        }
        const expired = offer.valid && offer.valid < new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
        const chips = [
            offer.ref && `<span class="pkg-chip"><small>เลขที่</small><b>${esc(offer.ref)}</b></span>`,
            offer.valid && `<span class="pkg-chip ${expired ? 'is-bad' : ''}"><small>${expired ? 'หมดอายุแล้ว' : 'ใช้ได้ถึง'}</small><b>${esc(thDate(offer.valid))}</b></span>`,
            offer.off && `<span class="pkg-chip is-accent"><small>ส่วนลดพิเศษ</small><b>${offer.off}%</b></span>`
        ].filter(Boolean).join('');
        $('pkgOffer').hidden = !chips && !offer.note;
        $('pkgOffer').innerHTML = `${chips ? `<div class="pkg-chips">${chips}</div>` : ''}${offer.note ? `<p class="pkg-msg">${esc(offer.note)}</p>` : ''}`;
        const trial = data.trialDays || 30;
        document.querySelectorAll('[data-trial]').forEach(el => { el.textContent = trial; });
        $('pkgLead').innerHTML = `ระบบรายงานการขายประจำวันสำหรับผู้ใช้สิทธิ์มาตรา 35 พร้อมแดชบอร์ดสำหรับเจ้าหน้าที่ — <b>ทดลองใช้ฟรี ${trial} วัน</b> ไม่มีค่าติดตั้ง`;
    }

    function renderPlans() {
        const list = visible();
        const save = Math.max(0, ...list.filter(p => p.priceMonthly && p.priceYearly).map(p => Math.round((1 - p.priceYearly / (p.priceMonthly * 12)) * 100)));
        $('pkgSave').hidden = !save;
        $('pkgSave').textContent = `ประหยัด ${save}%`;
        $('pkgCycle').querySelectorAll('[data-c]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.c === cycle)));
        $('pkgPlans').dataset.n = list.length;
        $('pkgPlans').innerHTML = list.map(p => {
            const pr = priceOf(p), custom = !p.priceMonthly;
            const per = cycle === 'yearly' ? '/ปี' : '/เดือน';
            const sub = custom ? 'ราคาตามขนาดองค์กร' : cycle === 'yearly' ? `เฉลี่ย ${baht(pr.net / 12)}/เดือน` : (p.priceYearly ? `หรือ ${baht(offer.off ? p.priceYearly * (100 - offer.off) / 100 : p.priceYearly)}/ปี` : '');
            return `<article class="pkg-card ${p.highlight ? 'is-hl' : ''}">
              ${p.highlight ? '<span class="pkg-badge">แนะนำ</span>' : ''}
              <h2>${esc(p.name)}</h2>
              <p class="pkg-tag">${esc(p.tagline || '')}</p>
              <div class="pkg-price">${custom ? '<b>ติดต่อฝ่ายขาย</b>' : `${offer.off ? `<s>${baht(pr.base)}</s>` : ''}<b>${baht(pr.net)}</b><small>${per}</small>`}</div>
              <p class="pkg-sub">${esc(sub)}</p>
              <a class="pkg-cta ${p.highlight ? 'is-primary' : ''}" href="${esc(contactHref(p))}" ${/^https?:/.test(contactHref(p)) ? 'target="_blank" rel="noopener"' : ''}>${custom ? 'ติดต่อฝ่ายขาย' : `ทดลองใช้ฟรี ${p.trialDays || data.trialDays || 30} วัน`}</a>
              <ul class="pkg-feat">
                <li class="pkg-lim">${ic('users')}<span>ผู้ใช้สิทธิ์ ${lim(p.maxUsers, 'คน')} · เจ้าหน้าที่ ${lim(p.maxStaff, 'บัญชี')}</span></li>
                ${(p.features || []).map(f => `<li>${ic('check')}<span>${esc(f)}</span></li>`).join('')}
              </ul>
            </article>`;
        }).join('');
        renderCompare(list);
        $('pkgNote').textContent = `ราคายังไม่รวมภาษีมูลค่าเพิ่ม · เปลี่ยนแพ็กเกจหรือยกเลิกได้ทุกรอบบิล${offer.off ? ` · ราคารวมส่วนลด ${offer.off}% แล้ว` : ''}${live ? '' : ' · ราคาอ้างอิง กรุณายืนยันกับฝ่ายขาย'}`;
    }

    function renderCompare(list) {
        const row = (label, fn) => `<tr><th scope="row">${label}</th>${list.map(p => `<td>${fn(p)}</td>`).join('')}</tr>`;
        const money = (p, k) => (p[k] ? baht(offer.off ? p[k] * (100 - offer.off) / 100 : p[k]) : (p.priceMonthly ? '-' : 'ติดต่อฝ่ายขาย'));
        $('pkgCmp').innerHTML = `<thead><tr><th scope="col"><span class="sr-only">รายการ</span></th>${list.map(p => `<th scope="col" class="${p.highlight ? 'is-hl' : ''}">${esc(p.name)}</th>`).join('')}</tr></thead><tbody>
          ${row('ราคา/เดือน', p => money(p, 'priceMonthly'))}
          ${row('ราคา/ปี', p => money(p, 'priceYearly'))}
          ${row('ผู้ใช้สิทธิ์', p => lim(p.maxUsers, 'คน'))}
          ${row('บัญชีเจ้าหน้าที่', p => lim(p.maxStaff, 'บัญชี'))}
          ${row('ทดลองใช้ฟรี', p => `${p.trialDays || data.trialDays || 30} วัน`)}
          ${row('ส่งรายงาน รูป + GPS', () => ic('check'))}
          ${row('แดชบอร์ด / ส่งออก Excel, PDF', () => ic('check'))}</tbody>`;
    }

    function renderPay() {
        const acc = data.accounts || [];
        $('pkgPaySec').hidden = !acc.length;
        const TYPE = { bank: 'บัญชีธนาคาร', promptpay: 'พร้อมเพย์', other: 'ช่องทางอื่น' };
        $('pkgPay').innerHTML = acc.map(a => `<div class="pkg-acc ${a.isDefault ? 'is-default' : ''}">
            <span class="pkg-acc-ic">${ic('bank')}</span>
            <span class="pkg-acc-txt"><small>${esc(a.bank || TYPE[a.type] || '')}${a.branch ? ' · สาขา' + esc(a.branch) : ''}</small><b>${esc(a.number)}</b><small>${esc(a.name)}</small></span>
            <button type="button" class="pkg-copy" data-copy="${esc(String(a.number).replace(/[\s-]/g, ''))}" aria-label="คัดลอกเลข ${esc(a.number)}">คัดลอก</button>
          </div>`).join('');
    }

    function render() { renderHead(); renderPlans(); renderPay(); }

    async function load() {
        if (typeof CONFIG === 'undefined') return;
        try {
            const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 9000);
            const res = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'plans.public', secret: CONFIG.API_SECRET }), signal: ctl.signal });
            clearTimeout(t);
            const r = await res.json();
            if (r && r.success && Array.isArray(r.plans) && r.plans.length) {
                data = { plans: r.plans, accounts: r.accounts || [], trialDays: r.trialDays || 30, contact: r.contact || {} };
                live = true;
                try { localStorage.setItem(CACHE, JSON.stringify(data)); } catch (e) {}
                render();
            }
        } catch (e) { /* ใช้ข้อมูลที่จำไว้/ชุดตั้งต้น */ }
    }

    // ---------- แจ้งผลสั้นๆ ----------
    let toastT;
    function toast(text) {
        let el = $('pkgToast');
        if (!el) { el = document.createElement('div'); el.id = 'pkgToast'; el.className = 'pkg-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
        el.textContent = text;
        el.classList.add('is-on');
        clearTimeout(toastT);
        toastT = setTimeout(() => el.classList.remove('is-on'), 2400);
    }
    async function copy(text) {
        try { await navigator.clipboard.writeText(text); return true; } catch (e) {
            const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (er) {} ta.remove(); return ok;
        }
    }

    // ---------- ส่งออก PNG / PDF ----------
    // ชื่อไฟล์เป็นอักษรอังกฤษ (บางเบราว์เซอร์/มือถือไม่รับชื่อไฟล์ภาษาไทย) + เลขที่ข้อเสนอ ถ้ามี
    const fileBase = () => { const ref = offer.ref.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''); return `HR-Paper-Mill-Packages${ref ? '-' + ref : ''}-${new Date().toISOString().slice(0, 10)}`; };
    async function snapshot() {
        if (!window.html2canvas) throw new Error('ยังโหลดเครื่องมือไม่เสร็จ กรุณาลองอีกครั้ง');
        const root = document.documentElement, prevTheme = root.getAttribute('data-theme');
        root.setAttribute('data-theme', 'light'); // ไฟล์สีสว่างเสมอ (พิมพ์/ส่งต่อได้)
        const box = document.createElement('div');
        box.className = 'pkg-export';
        const head = $('pkgDoc').querySelector('.pkg-head').cloneNode(true);
        const plans = $('pkgPlans').cloneNode(true); plans.removeAttribute('id');
        const cmp = $('pkgCmp').closest('.pkg-sec').cloneNode(true);
        const pay = $('pkgPaySec').hidden ? null : $('pkgPaySec').cloneNode(true);
        box.innerHTML = `<div class="pkg-x-top"><img src="img/logo.png" alt="" width="40" height="40"><b>HR Paper Mill</b><span>พัฒนาและให้บริการโดย softlight</span></div>`;
        [head, plans].forEach(n => box.appendChild(n));
        const note = document.createElement('p'); note.className = 'pkg-note'; note.textContent = $('pkgNote').textContent; box.appendChild(note);
        box.appendChild(cmp);
        if (pay) { pay.hidden = false; box.appendChild(pay); }
        const c = data.contact || {};
        box.insertAdjacentHTML('beforeend', `<div class="pkg-x-foot"><span>ติดต่อ: ${esc(c.phone || '085-835-4911 · 085-835-3663')}${c.email ? ' · ' + esc(c.email) : ''}${c.line ? ' · LINE ' + esc(c.line) : ''}</span><span>${esc(location.host + location.pathname.replace(/\/[^/]*$/, '/') + 'packages.html')}</span></div>`);
        box.querySelectorAll('.pkg-copy, .pkg-cta, [id]').forEach(n => { if (n.matches('.pkg-copy')) n.remove(); else if (n.matches('.pkg-cta')) n.classList.add('is-static'); else n.removeAttribute('id'); });
        box.querySelectorAll('.rv, .rv-in').forEach(n => n.classList.remove('rv', 'rv-in'));
        // html2canvas วาด <use href="#i-..."> ไม่ได้ → แทนด้วยเนื้อ SVG จริง
        box.querySelectorAll('svg use').forEach(u => {
            const sym = document.querySelector((u.getAttribute('href') || u.getAttribute('xlink:href') || '').replace(/^(?!#)/, '#'));
            const svg = u.closest('svg');
            if (!sym || !svg) return;
            svg.setAttribute('viewBox', sym.getAttribute('viewBox') || '0 0 24 24');
            svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', getComputedStyle(svg).color || 'currentColor');
            svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
            svg.innerHTML = sym.innerHTML;
        });
        document.body.appendChild(box);
        try {
            if (document.fonts && document.fonts.ready) await document.fonts.ready;
            await Promise.all([...box.querySelectorAll('img')].map(img => img.complete ? 0 : new Promise(r => { img.onload = img.onerror = r; })));
            return await window.html2canvas(box, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: 1200 });
        } finally {
            box.remove();
            if (prevTheme === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', prevTheme);
        }
    }
    function download(blob, name) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    async function busy(btn, fn) {
        if (btn.disabled) return;
        const html = btn.innerHTML;
        btn.disabled = true; btn.innerHTML = 'กำลังสร้าง…';
        try { await fn(); } catch (e) { toast(e.message || 'สร้างไฟล์ไม่สำเร็จ'); }
        finally { btn.disabled = false; btn.innerHTML = html; }
    }
    async function savePng() {
        const canvas = await snapshot();
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        download(blob, fileBase() + '.png');
        toast('ดาวน์โหลด PNG แล้ว');
    }
    async function savePdf() {
        const canvas = await snapshot();
        const JsPDF = window.jspdf && window.jspdf.jsPDF;
        if (!JsPDF) throw new Error('ยังโหลดเครื่องมือ PDF ไม่เสร็จ กรุณาลองอีกครั้ง');
        const pdf = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
        const W = 210, H = 297, M = 8, cw = W - 2 * M, ch = H - 2 * M;
        const pxPerMm = canvas.width / cw, pageH = Math.floor(ch * pxPerMm);
        // ตัดหน้าตรงช่องว่างระหว่างส่วน (แถวสีขาว) ไม่ตัดกลางการ์ด
        const ctx = canvas.getContext('2d');
        const blank = y => { const d = ctx.getImageData(0, y, canvas.width, 1).data; for (let i = 0; i < d.length; i += 16) if (d[i] < 248 || d[i + 1] < 248 || d[i + 2] < 248) return false; return true; };
        let y = 0, first = true;
        while (y < canvas.height - 4) {
            let h = Math.min(pageH, canvas.height - y);
            if (y + h < canvas.height) { for (let k = 0; k < pageH * 0.3; k += 2) if (blank(y + h - k)) { h -= k; break; } }
            const part = document.createElement('canvas');
            part.width = canvas.width; part.height = h;
            part.getContext('2d').drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
            if (!first) pdf.addPage();
            pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', M, M, cw, h / pxPerMm);
            first = false; y += h;
        }
        pdf.save(fileBase() + '.pdf');
        toast('ดาวน์โหลด PDF แล้ว');
    }
    async function share() {
        const url = location.href;
        const title = offer.to ? `ข้อเสนอแพ็กเกจ HR Paper Mill สำหรับ ${offer.to}` : 'แพ็กเกจและราคา HR Paper Mill';
        if (navigator.share) { try { await navigator.share({ title, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
        toast((await copy(url)) ? 'คัดลอกลิงก์แล้ว' : url);
    }

    // ---------- เริ่มทำงาน ----------
    function init() {
        render();
        $('pkgCycle').addEventListener('click', e => {
            const b = e.target.closest('[data-c]'); if (!b || b.dataset.c === cycle) return;
            cycle = b.dataset.c;
            const u = new URL(location.href);
            if (cycle === 'yearly') u.searchParams.set('cycle', 'yearly'); else u.searchParams.delete('cycle');
            history.replaceState(null, '', u);
            renderPlans();
        });
        $('pkgPng').addEventListener('click', e => busy(e.currentTarget, savePng));
        $('pkgPdf').addEventListener('click', e => busy(e.currentTarget, savePdf));
        $('pkgShare').addEventListener('click', share);
        $('pkgPay').addEventListener('click', async e => { const b = e.target.closest('[data-copy]'); if (b) toast((await copy(b.dataset.copy)) ? 'คัดลอกเลขบัญชีแล้ว' : b.dataset.copy); });
        load();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    window.Packages = { snapshot, get data() { return data; }, get live() { return live; } };
})();
