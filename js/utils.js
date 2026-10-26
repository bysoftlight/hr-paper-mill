// js/utils.js

// ฟังก์ชันย่อรูป
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
                resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
}

// localStorage ที่ไม่ทำให้แอปพังเมื่อเบราว์เซอร์ปิดการเก็บข้อมูล
const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, val) { try { localStorage.setItem(key, val); } catch (e) {} },
    remove(key) { try { localStorage.removeItem(key); } catch (e) {} }
};

// Loading overlay
function showLoading(show, text = 'กำลังประมวลผล...') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loading').hidden = !show;
}

// Toast
let toastTimer;
function showToast(text) {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-shown'), 2600);
}

// Modal helpers (native <dialog>)
function showModal(id) {
    const dlg = document.getElementById(id);
    if (dlg && !dlg.open) dlg.showModal();
}

function closeModal(id) {
    const dlg = document.getElementById(id);
    if (dlg && dlg.open) dlg.close();
}

// แทน alert / confirm: คืนค่า Promise<boolean>
const MSG_ICONS = { info: 'bi-info-lg', success: 'bi-check-lg', warning: 'bi-exclamation-lg', danger: 'bi-x-lg' };
function showMessage({ title, text = '', tone = 'info', okText = 'ตกลง', cancelText = null }) {
    return new Promise(resolve => {
        const dlg = document.getElementById('msgDialog');
        const icon = document.getElementById('msgIcon');
        const ok = document.getElementById('msgOk');
        const cancel = document.getElementById('msgCancel');
        icon.className = `msg-icon is-${tone}`;
        icon.innerHTML = `<i class="bi ${MSG_ICONS[tone] || MSG_ICONS.info}"></i>`;
        document.getElementById('msgTitle').textContent = title;
        document.getElementById('msgText').textContent = text;
        ok.textContent = okText;
        ok.className = tone === 'danger' && cancelText ? 'btn btn-danger-quiet' : 'btn btn-primary';
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
        // แตะพื้นหลังเพื่อปิด (ยกเว้น dialog ที่ต้องกดยืนยัน)
        if (e.target.tagName === 'DIALOG' && !e.target.dataset.locked) e.target.close();
    });
}
