// js/utils.js

// ฟังก์ชันย่อรูป: คืนค่า base64 (ไม่มี prefix) และขนาดไฟล์หลังย่อเป็น byte
// opts.stamp = ['บรรทัด 1', ...] → ประทับข้อความ (วัน-เวลา-พิกัด) ลงแถบล่างของรูป
// opts.profile = { name, id, img } → แถบโปรไฟล์จางๆ มุมซ้ายบน (เทียบตัวผู้ขายกับเจ้าของบัญชี)
// opts.hash = true → คืน hash (dHash 64 บิต) ของรูปก่อนประทับ ใช้ตรวจรูปซ้ำ
function compressImage(file, maxWidth = 1024, quality = 0.6, opts = {}) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image(); img.src = event.target.result;
            img.onload = () => {
                let width = img.width; let height = img.height;
                if (width > height) { if (width > maxWidth) { height = Math.round((height *= maxWidth / width)); width = maxWidth; } }
                else { if (height > maxWidth) { width = Math.round((width *= maxWidth / height)); height = maxWidth; } }
                const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
                const hash = opts.hash ? dHash(canvas) : '';
                if (opts.stamp && opts.stamp.length) stampImage(ctx, width, height, opts.stamp);
                if (opts.profile) { try { stampProfileBar(ctx, width, opts.profile); } catch (e) { /* รูปโปรไฟล์ใช้ไม่ได้: ข้ามแถบนี้ */ } }
                const base64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
                resolve({ base64, bytes: Math.round(base64.length * 3 / 4), hash });
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
}

// ลายนิ้วมือรูป (difference hash): ย่อเหลือ 9×8 สีเทา เทียบความสว่างช่องติดกัน → 64 บิต (hex 16 ตัว)
// รูปเดียวกันที่ถูกย่อ/บีบอัดต่างกันได้ค่าใกล้เคียงกัน (ต่างกันไม่กี่บิต)
function dHash(source) {
    const c = document.createElement('canvas'); c.width = 9; c.height = 8;
    const x = c.getContext('2d');
    x.drawImage(source, 0, 0, 9, 8);
    const d = x.getImageData(0, 0, 9, 8).data;
    const g = i => d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
    let hex = '';
    for (let row = 0; row < 8; row++) {
        let nib = 0;
        for (let col = 0; col < 8; col++) {
            nib = (nib << 1) | (g(row * 9 + col) > g(row * 9 + col + 1) ? 1 : 0);
            if (col % 4 === 3) { hex += nib.toString(16); nib = 0; }
        }
    }
    return hex;
}

// ประทับข้อความลงแถบโปร่งแสงด้านล่างของรูป (อ่านได้ทั้งพื้นสว่างและมืด)
function stampImage(ctx, w, h, lines) {
    const fs = Math.max(13, Math.round(w / 40)), lh = Math.round(fs * 1.35), pad = Math.round(fs * 0.7);
    const barH = pad * 2 + lh * lines.length;
    const grad = ctx.createLinearGradient(0, h - barH - pad, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.35, 'rgba(0,0,0,.55)');
    grad.addColorStop(1, 'rgba(0,0,0,.72)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, h - barH - pad, w, barH + pad);
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 2;
    lines.forEach((t, i) => {
        ctx.font = `${i === 0 ? '600 ' : ''}${fs}px "Google Sans", "Noto Sans Thai", system-ui, sans-serif`;
        ctx.fillStyle = i === 0 ? '#fff' : 'rgba(255,255,255,.92)';
        ctx.fillText(t, pad, h - barH + pad + lh * i, w - pad * 2);
    });
    ctx.shadowBlur = 0;
}

// แถบโปรไฟล์มุมซ้ายบน: พื้นโปร่ง ~20% ไม่บังเนื้อหาของรูป
function stampProfileBar(ctx, w, p) {
    const fs = Math.max(12, Math.round(w / 46)), av = Math.round(fs * 2.3), pad = Math.round(fs * 0.55), m = Math.round(fs * 0.8);
    const font = '"Google Sans", "Noto Sans Thai", system-ui, sans-serif';
    ctx.save();
    ctx.font = `600 ${fs}px ${font}`;
    const nameW = ctx.measureText(p.name).width;
    ctx.font = `${Math.round(fs * 0.85)}px ${font}`;
    const idW = ctx.measureText(p.id).width;
    const bw = Math.min(w - m * 2, pad * 3 + av + Math.max(nameW, idW) + pad), bh = av + pad * 2;
    // พื้นแถบ
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(m, m, bw, bh, bh / 2); else ctx.rect(m, m, bw, bh);
    ctx.fill();
    // รูปโปรไฟล์ (วงกลม) หรือตัวอักษรแรก
    const cx = m + pad + av / 2, cy = m + pad + av / 2;
    ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.arc(cx, cy, av / 2, 0, Math.PI * 2); ctx.closePath();
    if (p.img && p.img.naturalWidth) {
        ctx.save(); ctx.clip();
        const s = Math.min(p.img.naturalWidth, p.img.naturalHeight);
        ctx.drawImage(p.img, (p.img.naturalWidth - s) / 2, (p.img.naturalHeight - s) / 2, s, s, cx - av / 2, cy - av / 2, av, av);
        ctx.restore();
    } else {
        ctx.fillStyle = 'rgba(8,80,209,.85)'; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `600 ${Math.round(av * 0.45)}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText((p.name || '?').trim().charAt(0), cx, cy + 1);
        ctx.textAlign = 'left';
    }
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = Math.max(1, fs / 8);
    ctx.beginPath(); ctx.arc(cx, cy, av / 2, 0, Math.PI * 2); ctx.stroke();
    // ชื่อ + รหัส
    const tx = m + pad * 2 + av, maxW = bw - (tx - m) - pad;
    ctx.textBaseline = 'top'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 2;
    ctx.fillStyle = '#fff'; ctx.font = `600 ${fs}px ${font}`;
    ctx.fillText(p.name, tx, cy - fs * 1.08, maxW);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = `${Math.round(fs * 0.85)}px ${font}`;
    ctx.fillText(p.id, tx, cy + fs * 0.12, maxW);
    ctx.restore();
}

function formatBytes(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

// localStorage ที่ไม่ทำให้แอปพังเมื่อเบราว์เซอร์ปิดการเก็บข้อมูล
// ทำทีละขั้น: ขั้นใดผิดพลาด (เช่น API ที่บางเบราว์เซอร์ไม่ยอม) ขั้นที่เหลือยังทำต่อ
function runSteps(steps) {
    steps.forEach(step => { try { step(); } catch (e) { console.warn('ข้ามขั้นตอนที่ผิดพลาด:', e); reportClientError('step', e && e.message, String(step).slice(0, 120)); } });
}

// ---------- บันทึกข้อผิดพลาดบนเครื่องผู้ใช้ลง Log (เห็นสาเหตุทันที ไม่ต้องรอภาพหน้าจอ) ----------
// แต่ละหน้ากำหนด ErrorLog.identify = () => ({ who, whoName, role })
// ส่งไม่ได้ (ออฟไลน์) → เก็บในเครื่อง แล้วส่งเมื่อเน็ตกลับมา
const ErrorLog = { identify: () => ({}), sent: 0, version: '', last: '' };
const ERRQ_KEY = 'HRPM_ERRQ';
function reportClientError(kind, message, extra) {
    try {
        if (message) ErrorLog.last = String(message).slice(0, 200) + ' (' + new Date().toLocaleTimeString('th-TH') + ')'; // แนบไปกับ "แจ้งปัญหา"
        if (!message || ErrorLog.sent >= 15) return; // ต่อการเปิดหน้าหนึ่งครั้ง
        ErrorLog.sent++;
        const id = ErrorLog.identify() || {};
        const item = {
            action: 'log.error', kind: String(kind || 'error'), message: String(message).slice(0, 300), extra: extra ? String(extra).slice(0, 300) : '',
            page: location.pathname.split('/').pop() + location.hash, who: id.who || '', whoName: id.whoName || '', role: id.role || '',
            online: navigator.onLine, standalone: (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true,
            version: (document.querySelector('script[src*="app.js"], script[src*="core.js"]') || {}).src?.split('v=')[1] || '',
            userAgent: navigator.userAgent.slice(0, 200), at: Date.now()
        };
        sendErrorItem(item).catch(() => {
            const q = JSON.parse(store.get(ERRQ_KEY) || '[]').slice(-19);
            q.push(item);
            store.set(ERRQ_KEY, JSON.stringify(q));
        });
    } catch (e) { /* ห้ามให้ตัวบันทึกข้อผิดพลาดทำให้หน้าเว็บพัง */ }
}
function sendErrorItem(item) {
    return fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ secret: CONFIG.API_SECRET }, item)) })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); });
}
function flushErrorQueue() {
    let q = [];
    try { q = JSON.parse(store.get(ERRQ_KEY) || '[]'); } catch (e) {}
    if (!q.length || !navigator.onLine) return;
    store.remove(ERRQ_KEY);
    q.forEach(item => sendErrorItem(Object.assign(item, { extra: (item.extra ? item.extra + ' · ' : '') + 'เกิดเมื่อ ' + new Date(item.at).toLocaleString('th-TH') })).catch(() => {}));
}
window.addEventListener('error', e => {
    // รูป/สคริปต์โหลดไม่ได้ไม่นับ (เกิดบ่อยตอนสัญญาณแย่) — นับเฉพาะข้อผิดพลาดของโค้ด
    if (!e.message) return;
    reportClientError('js', e.message, (e.filename || '').split('/').pop() + ':' + (e.lineno || '') + ':' + (e.colno || ''));
});
window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    reportClientError('promise', r && (r.message || String(r)), r && r.stack ? String(r.stack).split('\n')[1] : '');
});
window.addEventListener('online', flushErrorQueue);
window.addEventListener('load', () => setTimeout(flushErrorQueue, 3000));

// เปลี่ยน URL โดยไม่โหลดหน้าใหม่ — บางเบราว์เซอร์ (เช่น Safari แบบแอปบน Dock/หน้าจอหลัก) อาจปฏิเสธ จึงไม่ให้ทำให้ขั้นตอนอื่นล้ม
function setUrl(url, push = false) {
    try { history[push ? 'pushState' : 'replaceState'](null, '', url); } catch (e) { console.warn('เปลี่ยน URL ไม่ได้:', e); }
}

const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, val) { try { localStorage.setItem(key, val); } catch (e) {} },
    remove(key) { try { localStorage.removeItem(key); } catch (e) {} }
};

// ไอคอนจาก sprite ใน index.html
function icon(name, extraClass = '') {
    return `<svg class="ic ${extraClass}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

// Loading overlay
function showLoading(show, text = 'กำลังประมวลผล…') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loading').hidden = !show;
}

// Modal helpers (native <dialog>)
function showModal(id) {
    const dlg = document.getElementById(id);
    if (dlg && !dlg.open) dlg.showModal();
}

// แทน alert / confirm: tone = ok | warn | bad | info, คืนค่า Promise<boolean>
const MSG_ICONS = { info: 'info', ok: 'check-circle', warn: 'alert', bad: 'x-circle' };
function showMessage({ title, text = '', tone = 'info', okText = 'ตกลง', cancelText = null }) {
    return new Promise(resolve => {
        const dlg = document.getElementById('msgDialog');
        const iconEl = document.getElementById('msgIcon');
        const ok = document.getElementById('msgOk');
        const cancel = document.getElementById('msgCancel');
        iconEl.className = `alert-icon is-${tone}`;
        iconEl.innerHTML = icon(MSG_ICONS[tone] || MSG_ICONS.info);
        document.getElementById('msgTitle').textContent = title;
        document.getElementById('msgText').textContent = text;
        ok.textContent = okText;
        ok.className = 'btn ' + (tone === 'bad' && cancelText ? 'btn-bad' : 'btn-primary');
        cancel.hidden = !cancelText;
        if (cancelText) cancel.textContent = cancelText;

        const done = (val) => {
            ok.onclick = cancel.onclick = null;
            dlg.onclose = null;
            if (dlg.open) dlg.close();
            resolve(val);
        };
        ok.onclick = () => done(true);
        cancel.onclick = () => done(false);
        dlg.onclose = () => done(false);
        dlg.showModal();
        ok.focus();
    });
}

function initDialogs() {
    document.addEventListener('click', (e) => {
        const opener = e.target.closest('[data-open]');
        if (opener) { showModal(opener.dataset.open); return; }
        const closer = e.target.closest('[data-close]');
        if (closer) { closer.closest('dialog').close(); return; }
        // แตะฉากหลังเพื่อปิด (ยกเว้น dialog ที่ต้องกดยืนยัน)
        if (e.target.tagName === 'DIALOG' && !e.target.dataset.locked) {
            const r = e.target.getBoundingClientRect();
            const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
            if (!inside) e.target.close();
        }
    });
}

// ---------- ตัวเลขนับขึ้น (Counting Number) ----------
// Counting.to(el, 123)           → นับจากค่าเดิมของ el (ครั้งแรก = 0) ไปถึง 123
// cnum(123, 'key')               → HTML <span data-count> สำหรับใส่ในเทมเพลต แล้วเรียก Counting.scan(root, store)
// store = {} ของแต่ละหน้า จำค่าล่าสุดตาม key → ข้อมูลอัปเดตสด นับจากค่าเก่าไปค่าใหม่ ไม่เริ่มจาก 0 ทุกครั้ง
// เริ่มนับเมื่อเลื่อนมาเห็นตัวเลข · ปิดการเคลื่อนไหว (ตั้งค่า/ระบบ) = แสดงค่าทันที
const Counting = (() => {
    const reduced = () => (typeof Prefs !== 'undefined' && Prefs.get('motion')) || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const fmt = (n, d) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d });
    const ease = p => 1 - Math.pow(1 - p, 3);

    function to(el, value, opts = {}) {
        if (!el) return;
        value = Number(value) || 0;
        const d = opts.decimals || 0, duration = opts.duration || 900;
        const from = opts.from !== undefined ? Number(opts.from) || 0 : el._countVal !== undefined ? el._countVal : 0;
        el._countVal = value;
        cancelAnimationFrame(el._countRaf);
        if (el._countIo) el._countIo.disconnect();
        clearTimeout(el._countT);
        if (from === value || reduced() || !window.requestAnimationFrame) { el.textContent = fmt(value, d); return; }
        el.textContent = fmt(from, d);
        const live = el.closest('[aria-live]');
        const run = () => {
            // ระหว่างนับ ไม่ให้โปรแกรมอ่านหน้าจออ่านตัวเลขที่กำลังเปลี่ยน
            if (live) live.setAttribute('aria-busy', 'true');
            const t0 = performance.now();
            const step = now => {
                const p = Math.min(1, (now - t0) / duration);
                el.textContent = fmt(from + (value - from) * ease(p), d);
                if (p < 1) el._countRaf = requestAnimationFrame(step);
                else { el.textContent = fmt(value, d); if (live) live.removeAttribute('aria-busy'); }
            };
            el._countRaf = requestAnimationFrame(step);
        };
        const later = () => { el._countT = setTimeout(run, opts.delay || 0); };
        if ('IntersectionObserver' in window) {
            el._countIo = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { el._countIo.disconnect(); later(); } });
            el._countIo.observe(el);
        } else later();
    }

    function scan(root, store) {
        if (!root) return;
        root.querySelectorAll('[data-count]').forEach((el, i) => {
            const key = el.dataset.countKey || String(i), v = Number(el.dataset.count) || 0;
            to(el, v, { from: store && key in store ? store[key] : 0, decimals: Number(el.dataset.decimals) || 0, delay: Math.min(i, 6) * 70 });
            if (store) store[key] = v;
        });
    }
    return { to, scan, fmt };
})();
function cnum(n, key, decimals = 0) {
    return `<span class="count" data-count="${Number(n) || 0}"${key ? ` data-count-key="${key}"` : ''}${decimals ? ` data-decimals="${decimals}"` : ''}>${Counting.fmt(Number(n) || 0, decimals)}</span>`;
}

// ---------- ช่องวันที่ที่หน้าตาเหมือนกันทุกเครื่อง (DateField) ----------
// iPhone/Safari วาดช่อง date/datetime-local เอง (ตัวหนังสือชิดบน รูปแบบ "1 Nov 2026" สูงไม่เท่าช่องอื่น)
// → ห่อด้วยกล่องที่แสดงวันที่ภาษาไทย (1 พ.ย. 2569) ช่องจริงโปร่งใสวางทับ แตะแล้วเปิดตัวเลือกวันที่ของเครื่องตามปกติ
// ย้าย class (input/input-sm) และ data-for ไปที่กล่องห่อ · ตั้งค่า .value ด้วยโค้ดแล้วข้อความอัปเดตเอง
const DateField = (() => {
    const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    function format(type, v) {
        if (!v) return '';
        if (type === 'month') { const [y, m] = v.split('-').map(Number); return y && m ? `${TH_MONTHS_FULL[m - 1]} ${y + 543}` : v; }
        const [d, t] = v.split('T');
        const [y, m, day] = d.split('-').map(Number);
        if (!y || !m || !day) return v;
        const s = `${day} ${TH_MONTHS[m - 1]} ${y + 543}`;
        return type === 'datetime-local' && t ? `${s} · ${t.slice(0, 5)} น.` : s;
    }
    function enhance(input) {
        if (!input || input.dataset.df || !input.parentNode) return;
        input.dataset.df = '1';
        const box = document.createElement('span');
        box.className = 'datefield ' + input.className;
        if (input.dataset.for) { box.dataset.for = input.dataset.for; delete input.dataset.for; }
        if (input.hidden) { box.hidden = true; input.hidden = false; }
        const text = document.createElement('span');
        text.className = 'df-text';
        text.setAttribute('aria-hidden', 'true');
        const ic = document.createElement('span');
        ic.className = 'df-ic';
        ic.setAttribute('aria-hidden', 'true');
        ic.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
        input.parentNode.insertBefore(box, input);
        box.append(text, ic, input);
        input.className = 'df-native';
        let clear = null;
        if (!input.required && input.type !== 'date') { // ช่องไม่บังคับ (เช่น วันปิดรับ): ปุ่มล้างค่า
            clear = document.createElement('button');
            clear.type = 'button'; clear.className = 'df-clear'; clear.setAttribute('aria-label', 'ล้างค่า');
            clear.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
            clear.addEventListener('click', e => { e.preventDefault(); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); });
            box.appendChild(clear);
        }
        const placeholder = input.getAttribute('placeholder') || (input.type === 'month' ? 'เลือกเดือน' : input.type === 'datetime-local' ? 'เลือกวันและเวลา' : 'เลือกวันที่');
        const sync = () => {
            const v = desc.get.call(input);
            text.textContent = format(input.type, v) || placeholder;
            box.classList.toggle('is-empty', !v);
            if (clear) clear.hidden = !v;
        };
        // ตั้งค่าด้วยโค้ด (input.value = …) ไม่มีเหตุการณ์ input → ดักที่ตัวช่องเอง
        Object.defineProperty(input, 'value', { configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); sync(); } });
        input.addEventListener('input', sync);
        input.addEventListener('change', sync);
        // คอมพิวเตอร์: คลิกตรงไหนของช่องก็เปิดปฏิทิน (ปกติต้องคลิกไอคอนเล็กๆ)
        input.addEventListener('click', () => { try { if (input.showPicker) input.showPicker(); } catch (e) { /* บางเบราว์เซอร์ไม่อนุญาต: ใช้ตัวเลือกปกติ */ } });
        sync();
    }
    const SEL = 'input[type="date"], input[type="datetime-local"], input[type="month"]';
    function enhanceAll(root) {
        root = root || document;
        if (root.matches && root.matches(SEL)) enhance(root);
        if (root.querySelectorAll) root.querySelectorAll(SEL).forEach(enhance);
    }
    // ทุกช่องวันที่ที่เกิดขึ้นภายหลัง (ฟอร์มที่สร้างด้วยโค้ด เช่น Dev Console) ถูกห่ออัตโนมัติ
    // — กันไม่ให้ช่องวันที่แบบของ iPhone (ตัวหนังสือชิดบน/รูปแบบอังกฤษ) หลุดมาอีก
    function watch() {
        enhanceAll(document);
        new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1 && !n.classList.contains('datefield')) enhanceAll(n); })))
            .observe(document.body, { childList: true, subtree: true });
    }
    return { enhance, enhanceAll, format, watch };
})();
if (document.body) DateField.watch(); else document.addEventListener('DOMContentLoaded', () => DateField.watch());

// ---------- ขอบจางของแถบที่เลื่อนแนวนอนได้ ([data-scrollfade]) ----------
// ซ้าย/ขวาที่ยังมีเนื้อหาซ่อนอยู่ = จางลง (บอกว่าเลื่อนได้) · เลื่อนสุดแล้วขอบนั้นคมตามปกติ
const ScrollFade = (() => {
    const upd = el => {
        const max = el.scrollWidth - el.clientWidth;
        el.style.setProperty('--fade-l', el.scrollLeft > 2 ? '28px' : '0px');
        el.style.setProperty('--fade-r', max - el.scrollLeft > 2 ? '28px' : '0px');
    };
    function watch(el) {
        if (!el || el.dataset.sfOn) return;
        el.dataset.sfOn = '1';
        el.addEventListener('scroll', () => upd(el), { passive: true });
        if (window.ResizeObserver) new ResizeObserver(() => upd(el)).observe(el); else window.addEventListener('resize', () => upd(el));
        upd(el);
    }
    const all = () => document.querySelectorAll('[data-scrollfade]').forEach(watch);
    document.addEventListener('DOMContentLoaded', all);
    return { watch, update: upd, all };
})();

// ท้ายหน้า: ลิงก์ที่ขึ้นบรรทัดใหม่ไม่ต้องมีจุดคั่นนำหน้า
function tidyFootLinks() {
    // วัดตอนมีจุดครบทุกลิงก์ → ลิงก์ที่ขึ้นบรรทัดใหม่: ใส่ตัวขึ้นบรรทัด (.foot-br) ไว้หน้าแล้วซ่อนจุด
    // ล็อกการตัดบรรทัดไว้ ลิงก์จึงไม่กระโดดกลับไปบรรทัดก่อนเมื่อจุดหายไป (ไม่วนสลับไปมา)
    document.querySelectorAll('.foot-links').forEach(nav => {
        nav.querySelectorAll('.foot-br').forEach(br => br.remove());
        if (!nav.offsetParent) return; // ซ่อนอยู่: วัดไม่ได้ รอแสดงผลก่อน
        const items = [...nav.children];
        let prev = null;
        const starts = items.filter(el => { const t = el.offsetTop, st = prev !== null && t > prev + 4; prev = t; return st; });
        starts.forEach(el => { const br = document.createElement('span'); br.className = 'foot-br'; br.setAttribute('aria-hidden', 'true'); nav.insertBefore(br, el); });
    });
}
document.addEventListener('DOMContentLoaded', () => { tidyFootLinks(); if (window.ResizeObserver) document.querySelectorAll('.foot-links').forEach(n => new ResizeObserver(tidyFootLinks).observe(n)); else window.addEventListener('resize', tidyFootLinks); });
window.addEventListener('load', tidyFootLinks);

// ---------- องค์กรของผู้ใช้ (Dev Console › องค์กร) ----------
// คอมพิวเตอร์/แท็บเล็ต: การ์ด "Organizations" เหนือบัญชีผู้ใช้ท้ายเมนูด้านข้าง (โลโก้วงกลม · ชื่อ · แพลน • จำนวนคน)
// มือถือ: ไม่มีเมนูด้านข้าง แสดงในการ์ดโปรไฟล์/หน้าบัญชีแทน ([data-org-line])
// opts: { meta: 'Pro', count: 46, open: () => {} } — open = แตะการ์ดแล้วไปไหน
const OrgMark = {
    org: null, opts: {},
    set(org, opts) {
        this.org = org && (org.logo || org.name) ? org : null;
        this.opts = Object.assign({}, opts || {});
        this.render();
    },
    count(n) { if (this.opts.count === n) return; this.opts.count = n; this.render(); }, // จำนวนผู้ใช้สิทธิ์ (จากหน้าภาพรวม)
    render() {
        const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const org = this.org, has = !!org, o = this.opts;
        const html = has ? (org.logo ? `<img src="${e(org.logo)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : '') + `<span>${e(org.name)}</span>` : '';
        const guard = (root, onFail) => root.querySelectorAll('img').forEach(img => img.addEventListener('error', () => { img.remove(); onFail(); }, { once: true }));
        document.querySelectorAll('.topbar > .org-mark, .sidenav > .org-mark').forEach(m => m.remove()); // รุ่นก่อน: แถบบน / ใต้ชื่อแอป
        const initial = has ? (String(org.name || '?').replace(/^(บริษัท|บจก\.?|หจก\.?)\s*/, '').trim().charAt(0) || '?') : '';
        const meta = [o.meta ? e(o.meta) : '', o.count != null ? `<span class="org-count"><svg class="ic ic-14" aria-hidden="true"><use href="#i-user"/></svg>${Number(o.count).toLocaleString('th-TH')}</span>` : ''].filter(Boolean).join('<span class="org-sep" aria-hidden="true">•</span>');
        document.querySelectorAll('.sidenav').forEach(nav => {
            let sec = nav.querySelector(':scope > .org-sec');
            if (!has) { if (sec) sec.remove(); return; }
            if (!sec) {
                sec = document.createElement('div'); sec.className = 'org-sec';
                const user = nav.querySelector(':scope > .nav-user');
                nav.insertBefore(sec, user || null);
                sec.addEventListener('click', ev => { if (ev.target.closest('.org-card') && typeof this.opts.open === 'function') this.opts.open(); });
                sec.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest('.org-card') && typeof this.opts.open === 'function') { ev.preventDefault(); this.opts.open(); } });
            }
            const link = typeof o.open === 'function';
            sec.innerHTML = `<span class="org-sec-label">Organizations</span>
              <div class="org-card"${link ? ' role="link" tabindex="0"' : ''} title="${e(org.name)}" aria-label="องค์กร ${e(org.name)}">
                <span class="org-ava">${org.logo ? `<img src="${e(org.logo)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : ''}<i aria-hidden="true">${e(initial)}</i></span>
                <span class="org-txt"><b>${e(org.name)}</b>${meta ? `<small>${meta}</small>` : ''}</span>
                ${link ? '<svg class="ic ic-16 org-go" aria-hidden="true"><use href="#i-chevron-right"/></svg>' : ''}
              </div>`;
            const ava = sec.querySelector('.org-ava'); ava.classList.toggle('has-logo', !!org.logo);
            guard(ava, () => ava.classList.remove('has-logo'));
        });
        document.querySelectorAll('[data-org-line]').forEach(el => {
            el.innerHTML = html; el.classList.toggle('has-logo', !!(has && org.logo)); guard(el, () => el.classList.remove('has-logo'));
            el.hidden = !has;
            const row = el.closest('[data-org-row]'); if (row) row.hidden = !has;
        });
    }
};

// ย่อรูปสำหรับอัปโหลด (โลโก้องค์กร / รูปประกาศ): ด้านยาวไม่เกิน max px
// keepPng = true → เก็บพื้นโปร่งใส (PNG) เหมาะกับโลโก้ · ไม่งั้นเป็น JPEG พื้นขาว · คืน { data (base64), mimeType, url (ตัวอย่าง) }
function shrinkImage(file, max = 1600, keepPng = false) {
    return new Promise((resolve, reject) => {
        if (!file || !/^image\//.test(file.type)) return reject(new Error('กรุณาเลือกไฟล์รูปภาพ'));
        const src = URL.createObjectURL(file), img = new Image();
        img.onload = () => {
            const k = Math.min(1, max / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
            const x = c.getContext('2d'), png = keepPng && /png|webp|svg|gif/.test(file.type);
            if (!png) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
            x.drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(src);
            const mime = png ? 'image/png' : 'image/jpeg', url = c.toDataURL(mime, 0.86);
            if (url.length * 0.75 > 2 * 1024 * 1024) return reject(new Error('รูปมีขนาดใหญ่เกิน 2 MB'));
            resolve({ data: url.split(',')[1], mimeType: mime, url });
        };
        img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('เปิดไฟล์รูปไม่ได้')); };
        img.src = src;
    });
}
