// js/camera.js — กล้องในแอปพร้อมกรอบนำถ่าย (บัตรประจำร้านค้า / ล็อคที่ขาย / ผู้ขาย)
// Camera.open({ profile: { name, id, pic } }) → Promise<File|null>
// ใช้กล้องหลังผ่าน getUserMedia (ต้องเป็น https) — เบราว์เซอร์ที่ไม่รองรับให้ใช้ช่องเลือกรูปเดิม

const Camera = (() => {
    let stream = null, facing = 'environment', resolveFn = null, shot = null, tick = null;
    const supported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;

    function el(id) { return document.getElementById(id); }

    async function start() {
        stop();
        stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }
        });
        const v = el('camVideo');
        v.srcObject = stream;
        v.classList.toggle('is-mirror', facing === 'user');
        await v.play().catch(() => {});
    }
    function stop() {
        if (stream) stream.getTracks().forEach(t => t.stop());
        stream = null;
    }

    function finish(file) {
        stop();
        clearInterval(tick);
        const dlg = el('cameraModal');
        if (dlg.open) dlg.close();
        const r = resolveFn; resolveFn = null;
        if (r) r(file);
    }

    function capture() {
        const v = el('camVideo');
        if (!v.videoWidth) return;
        const c = document.createElement('canvas');
        c.width = v.videoWidth; c.height = v.videoHeight;
        const x = c.getContext('2d');
        if (facing === 'user') { x.translate(c.width, 0); x.scale(-1, 1); }
        x.drawImage(v, 0, 0);
        c.toBlob(blob => {
            if (!blob) return;
            shot = new File([blob], 'camera_' + Date.now() + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
            el('camShot').src = URL.createObjectURL(blob);
            el('camReview').hidden = false;
            el('camUse').focus();
            if (navigator.vibrate) navigator.vibrate(15);
        }, 'image/jpeg', 0.92);
        el('cameraModal').classList.add('is-flash');
        setTimeout(() => el('cameraModal').classList.remove('is-flash'), 180);
    }

    function bind() {
        if (bind.done) return;
        bind.done = true;
        el('camClose').addEventListener('click', () => finish(null));
        el('camShutter').addEventListener('click', capture);
        el('camFlip').addEventListener('click', async () => { facing = facing === 'environment' ? 'user' : 'environment'; try { await start(); } catch (e) { facing = 'environment'; } });
        el('camRetake').addEventListener('click', () => { el('camReview').hidden = true; shot = null; el('camShutter').focus(); });
        el('camUse').addEventListener('click', () => finish(shot));
        el('camGallery').addEventListener('click', () => finish('gallery'));
        el('cameraModal').addEventListener('cancel', e => { e.preventDefault(); finish(null); });
        document.addEventListener('visibilitychange', () => { if (document.hidden && stream && el('cameraModal').open) stop(); else if (!document.hidden && el('cameraModal').open && !stream) start().catch(() => {}); });
    }

    async function open(opts = {}) {
        bind();
        const dlg = el('cameraModal');
        el('camReview').hidden = true;
        shot = null;
        // รูปโปรไฟล์ขนาดเล็ก ไว้เทียบว่าเป็นผู้ขายคนเดียวกัน
        const p = opts.profile || {};
        el('camProfile').innerHTML = (p.pic ? `<img src="${p.pic}" alt="" referrerpolicy="no-referrer">` : `<span>${(p.name || '?').trim().charAt(0)}</span>`);
        el('camProfileText').textContent = `${p.name || ''} · ${p.id || ''}`;
        const stampEl = el('camStamp');
        const upd = () => { stampEl.textContent = (opts.stampPreview ? opts.stampPreview() : []).join('  ·  '); };
        upd(); tick = setInterval(upd, 1000);
        dlg.showModal();
        try {
            await start();
        } catch (e) {
            clearInterval(tick);
            dlg.close();
            const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
            return { error: denied ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง — เปิดสิทธิ์กล้องในการตั้งค่าเบราว์เซอร์ หรือเลือกรูปจากเครื่องแทน' : 'เปิดกล้องไม่ได้ — ใช้การถ่ายภาพ/เลือกรูปจากเครื่องแทน' };
        }
        return new Promise(r => { resolveFn = r; });
    }

    return { supported, open };
})();
