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
const ErrorLog = { identify: () => ({}), sent: 0, version: '' };
const ERRQ_KEY = 'HRPM_ERRQ';
function reportClientError(kind, message, extra) {
    try {
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
