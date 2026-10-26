// js/utils.js

// ฟังก์ชันย่อรูป: คืนค่า base64 (ไม่มี prefix) และขนาดไฟล์หลังย่อเป็น byte
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const maxWidth = 1024; const quality = 0.6;
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image(); img.src = event.target.result;
            img.onload = () => {
                let width = img.width; let height = img.height;
                if (width > height) { if (width > maxWidth) { height = Math.round((height *= maxWidth / width)); width = maxWidth; } }
                else { if (height > maxWidth) { width = Math.round((width *= maxWidth / height)); height = maxWidth; } }
                const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
                const base64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
                resolve({ base64, bytes: Math.round(base64.length * 3 / 4) });
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
}

function formatBytes(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

// localStorage ที่ไม่ทำให้แอปพังเมื่อเบราว์เซอร์ปิดการเก็บข้อมูล
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
