// js/utils.js

// ฟังก์ชันย่อรูป: คืนค่า base64 (ไม่มี prefix) และขนาดไฟล์หลังย่อเป็น byte
// opts.stamp = ['บรรทัด 1', ...] → ประทับข้อความ (วัน-เวลา-พิกัด) ลงแถบล่างของรูป
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

function formatBytes(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

// localStorage ที่ไม่ทำให้แอปพังเมื่อเบราว์เซอร์ปิดการเก็บข้อมูล
// ทำทีละขั้น: ขั้นใดผิดพลาด (เช่น API ที่บางเบราว์เซอร์ไม่ยอม) ขั้นที่เหลือยังทำต่อ
function runSteps(steps) {
    steps.forEach(step => { try { step(); } catch (e) { console.warn('ข้ามขั้นตอนที่ผิดพลาด:', e); } });
}

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
