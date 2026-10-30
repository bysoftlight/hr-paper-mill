// js/settings.js — การตั้งค่าที่จำไว้ในเครื่องนี้ (ใช้ร่วมกันทั้งหน้าผู้ใช้สิทธิ์และหน้า Staff)
// โหลดใน <head> เพื่อใส่ธีม/ขนาดตัวอักษรก่อนหน้าเว็บแสดง (ไม่กะพริบเป็นสีขาวก่อนเปลี่ยนเป็นโหมดมืด)

const PREFS_KEY = 'HRPM_PREFS';
const PREF_DEFAULTS = {
    theme: 'system',   // system | light | dark
    text: 'm',         // m | l | xl
    motion: false,     // true = ลดภาพเคลื่อนไหว
    snap: true,        // เลื่อนหน้าแล้วหยุดพอดีทีละส่วน
    analytics: true,   // ส่งสถิติการใช้งาน (js/analytics.js)
    haptic: true,      // สั่นเบาๆ เมื่อแตะเมนู
    header: 'classic', // classic = โลโก้+ชื่อแอป · glass = ปุ่มโลโก้กลมลอย + ชื่อหน้าตรงกลาง (มือถือ)
    navLabels: false,  // แสดงชื่อใต้ไอคอนเมนูล่าง (มือถือ)
    // หน้าผู้ใช้สิทธิ์
    photo: 'std',      // save | std | hi
    remember: true,
    // หน้า Staff
    startTab: 'auto',
    live: 20,          // วินาที, 0 = ปิด
    pageSize: 'auto',  // auto | 20 | 50 | 100
    thumbs: true
};

const Prefs = {
    all() {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (e) {}
        return Object.assign({}, PREF_DEFAULTS, saved);
    },
    get(key) { return this.all()[key]; },
    set(key, value) {
        const p = this.all();
        p[key] = value;
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {}
        applyPrefs();
        document.dispatchEvent(new CustomEvent('prefchange', { detail: { key, value } }));
    }
};

function applyPrefs() {
    const p = Prefs.all(), root = document.documentElement;
    root.dataset.theme = p.theme;
    root.dataset.text = p.text;
    root.dataset.motion = p.motion ? 'reduce' : 'system';
    root.dataset.snap = p.snap ? 'on' : 'off';
    root.dataset.header = p.header === 'glass' ? 'glass' : 'classic';
    root.dataset.navlabels = p.navLabels ? 'on' : 'off';
    const dark = p.theme === 'dark' || (p.theme === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#131314' : '#FFFFFF';
}
applyPrefs();
if (window.matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(applyPrefs);
}
// เปลี่ยนการตั้งค่าในอีกแท็บ → แท็บนี้เปลี่ยนตาม
window.addEventListener('storage', e => {
    if (e.key !== PREFS_KEY) return;
    applyPrefs();
    document.dispatchEvent(new CustomEvent('prefchange', { detail: { key: null } }));
});
document.addEventListener('DOMContentLoaded', applyPrefs); // meta theme-color อยู่หลัง script นี้

// ---------- หน้าการตั้งค่า ----------
// sections: [{ title, rows: [{ id, icon, tone, label, desc, control }] }]
// control: { type: 'seg', key, options: [[value, label]] } · { type: 'switch', key } · { type: 'select', key, options }
//          { type: 'button', label, tone, onClick } · { type: 'info', html }
function settingsEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderSettings(el, sections) {
    const p = Prefs.all();
    const ctrl = (row) => {
        const c = row.control || {};
        const lbl = settingsEsc(row.label);
        if (c.type === 'seg') {
            return `<div class="set-seg" role="radiogroup" aria-label="${lbl}">${c.options.map(([v, t]) =>
                `<button type="button" role="radio" data-key="${c.key}" data-value="${settingsEsc(v)}" aria-checked="${String(p[c.key]) === String(v)}">${settingsEsc(t)}</button>`).join('')}</div>`;
        }
        if (c.type === 'switch') {
            return `<label class="set-switch"><input type="checkbox" role="switch" data-key="${c.key}" ${p[c.key] ? 'checked' : ''} aria-label="${lbl}"><span aria-hidden="true"></span></label>`;
        }
        if (c.type === 'toggle') { // สวิตช์ที่ไม่ได้เก็บใน Prefs (เช่น สถานะการแจ้งเตือนจากเซิร์ฟเวอร์)
            return `<label class="set-switch"><input type="checkbox" role="switch" data-toggle-id="${row.id}" ${c.checked ? 'checked' : ''} ${c.disabled ? 'disabled' : ''} aria-label="${lbl}"><span aria-hidden="true"></span></label>`;
        }
        if (c.type === 'select') {
            return `<select class="select set-select" data-key="${c.key}" aria-label="${lbl}">${c.options.map(([v, t]) =>
                `<option value="${settingsEsc(v)}" ${String(p[c.key]) === String(v) ? 'selected' : ''}>${settingsEsc(t)}</option>`).join('')}</select>`;
        }
        if (c.type === 'button') {
            return `<button type="button" class="btn-chip ${c.tone === 'bad' ? 'btn-chip-bad' : ''}" data-action-id="${row.id}">${settingsEsc(c.label)}</button>`;
        }
        return '';
    };
    el.innerHTML = sections.filter(s => s.rows.length).map(s => `
        <section class="set-group" aria-label="${settingsEsc(s.title)}">
          <h3 class="set-title">${settingsEsc(s.title)}</h3>
          <ul class="set-list">${s.rows.map(r => `
            <li class="set-row ${r.control && r.control.type === 'seg' ? 'is-wide' : ''}" ${r.id ? `data-row="${r.id}"` : ''}>
              <span class="set-icon tone-${r.tone || 'blue'}" aria-hidden="true"><svg class="ic"><use href="#i-${r.icon}"/></svg></span>
              <span class="set-text"><b>${settingsEsc(r.label)}</b>${r.desc ? `<small data-desc>${r.desc}</small>` : ''}</span>
              ${r.control && r.control.type === 'info' ? `<div class="set-info">${r.control.html}</div>` : `<span class="set-ctrl">${ctrl(r)}</span>`}
            </li>`).join('')}</ul>
        </section>`).join('');

    el.querySelectorAll('.set-seg button').forEach(b => b.addEventListener('click', () => {
        const cur = Prefs.get(b.dataset.key);
        const v = typeof PREF_DEFAULTS[b.dataset.key] === 'number' ? Number(b.dataset.value) : b.dataset.value;
        b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
        if (String(cur) !== String(v)) Prefs.set(b.dataset.key, v);
    }));
    el.querySelectorAll('.set-switch input').forEach(i => i.addEventListener('change', () => Prefs.set(i.dataset.key, i.checked)));
    el.querySelectorAll('.set-select').forEach(s => s.addEventListener('change', () => {
        const v = typeof PREF_DEFAULTS[s.dataset.key] === 'number' ? Number(s.value) : s.value;
        Prefs.set(s.dataset.key, v);
    }));
    const actions = {}, toggles = {};
    sections.forEach(s => s.rows.forEach(r => {
        if (r.control && r.control.type === 'button') actions[r.id] = r.control.onClick;
        if (r.control && r.control.type === 'toggle') toggles[r.id] = r.control.onChange;
    }));
    el.querySelectorAll('[data-toggle-id]').forEach(i => i.addEventListener('change', () => toggles[i.dataset.toggleId] && toggles[i.dataset.toggleId](i.checked, i)));
    el.querySelectorAll('[data-action-id]').forEach(b => b.addEventListener('click', () => actions[b.dataset.actionId] && actions[b.dataset.actionId](b)));
}

// ส่วนที่เหมือนกันทั้งสองหน้า: การแสดงผล
function displaySettings() {
    return {
        title: 'การแสดงผล',
        rows: [
            { icon: 'contrast', tone: 'gray', label: 'ธีม', desc: 'โหมดมืดช่วยถนอมสายตาเวลากลางคืน', control: { type: 'seg', key: 'theme', options: [['system', 'ตามเครื่อง'], ['light', 'สว่าง'], ['dark', 'มืด']] } },
            { icon: 'type', tone: 'purple', label: 'ขนาดตัวอักษร', desc: 'ขยายตัวอักษรและปุ่มให้อ่านและกดง่ายขึ้น', control: { type: 'seg', key: 'text', options: [['m', 'ปกติ'], ['l', 'ใหญ่'], ['xl', 'ใหญ่มาก']] } },
            { icon: 'home', tone: 'blue', label: 'หัวแอป', desc: 'แบบเดิม = โลโก้และชื่อแอป · แบบกระจก = ปุ่มโลโก้กลมลอยและชื่อหน้าอยู่ตรงกลาง (มือถือ)', control: { type: 'seg', key: 'header', options: [['classic', 'แบบเดิม'], ['glass', 'แบบกระจก']] } },
            { icon: 'type', tone: 'gray', label: 'ชื่อใต้ไอคอนเมนู', desc: 'แสดงชื่อเมนูใต้ไอคอนในแถบเมนูด้านล่าง (มือถือ)', control: { type: 'switch', key: 'navLabels' } },
            { icon: 'haptic', tone: 'amber', label: 'สั่นเมื่อแตะเมนู', desc: 'สั่นเบาๆ เมื่อเปลี่ยนหน้า (Android และ iPhone iOS 18 ขึ้นไป)', control: { type: 'switch', key: 'haptic' } },
            { icon: 'motion', tone: 'teal', label: 'ลดภาพเคลื่อนไหว', desc: 'ปิดแอนิเมชัน เหมาะกับเครื่องรุ่นเก่าหรือผู้ที่เวียนหัวง่าย', control: { type: 'switch', key: 'motion' } },
            { icon: 'snap', tone: 'blue', label: 'เลื่อนทีละส่วน', desc: 'เลื่อนหน้าจอแล้วหยุดพอดีที่หัวข้อของแต่ละส่วน', control: { type: 'switch', key: 'snap' } },
            { icon: 'chart', tone: 'indigo', label: 'ส่งสถิติการใช้งาน', desc: 'หน้าที่เปิด อุปกรณ์ และตำแหน่งตอนส่งรายงาน ผูกกับรหัสที่เข้าสู่ระบบ — ใช้ปรับปรุงระบบและดูแลความปลอดภัย', control: { type: 'switch', key: 'analytics' } }
        ]
    };
}

// สั่นเบาๆ: Android ใช้ navigator.vibrate · iPhone (iOS 18+) ไม่มี vibrate แต่สวิตช์ <input switch> สั่นให้เมื่อถูกแตะ
let HAPTIC_EL_ = null;
function haptic() {
    if (!Prefs.get('haptic')) return;
    try {
        if (navigator.vibrate && navigator.vibrate(8)) return;
        if (!HAPTIC_EL_) {
            HAPTIC_EL_ = document.createElement('label');
            HAPTIC_EL_.setAttribute('aria-hidden', 'true');
            HAPTIC_EL_.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;left:-10px;top:0';
            HAPTIC_EL_.innerHTML = '<input type="checkbox" switch tabindex="-1">';
            document.body.appendChild(HAPTIC_EL_);
        }
        HAPTIC_EL_.click();
    } catch (e) {}
}

// แถบบนและเมนูล่างโปร่งแสงขึ้นเมื่อเลื่อนหน้า (มองเห็นเนื้อหาด้านหลังแบบเบลอ)
function watchScrollGlass() {
    let on = null;
    const update = () => {
        const v = window.scrollY > 8;
        if (v !== on) { on = v; document.documentElement.classList.toggle('is-scrolled', v); }
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
}
document.addEventListener('DOMContentLoaded', watchScrollGlass);

// ---------- เลื่อนทีละส่วนแบบนุ่ม (Soft snap) ----------
// แทน CSS scroll-snap (บน iPhone กระตุก/หยุดผิดที่): รอให้นิ้วปล่อยและแรงเหวี่ยงหยุดก่อน
// แล้วค่อยเลื่อนนุ่มๆ ให้หัวข้อของส่วนที่ "ใกล้" ไปชิดใต้แถบบน — ไกลเกินไปไม่ขยับ (อ่านกลางการ์ดยาวได้อิสระ)
// ใช้กับการเลื่อนด้วยนิ้วเท่านั้น (เมาส์/ทัชแพดเลื่อนตามปกติ) · แตะจอระหว่างเลื่อน = หยุดทันที
const SoftSnap = (() => {
    const SEL = '.view:not([hidden]) > .view-head, .view:not([hidden]) section.card, .view:not([hidden]) .card.step, .view:not([hidden]) .submit-card, .view:not([hidden]) .kpis, .view:not([hidden]) > .toolbar';
    // armed = นิ้วเพิ่งปล่อยหลังปัดจริง (ทำได้ครั้งเดียวต่อการปัด) · dir มาจากทิศของนิ้ว ไม่ใช่จาก scroll event
    // (ตอนเด้งที่ขอบล่างของ iPhone หน้าเลื่อนย้อนขึ้นเอง ถ้าใช้ทิศจาก scroll จะถูกดึงกลับขึ้นไป)
    let armed = false, dir = 0, startY = 0, timer = 0, raf = 0, animating = false;
    const on = () => Prefs.get('snap') && !document.querySelector('dialog[open]');
    const reduced = () => Prefs.get('motion') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const busyInput = () => { const a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'radio'; };
    const maxY = () => document.documentElement.scrollHeight - window.innerHeight;

    function cancel() { cancelAnimationFrame(raf); animating = false; }
    function glide(to) {
        cancel();
        const from = window.scrollY, dist = to - from;
        if (Math.abs(dist) < 2) return;
        if (reduced()) { window.scrollTo(0, to); return; }
        const dur = Math.min(420, 220 + Math.abs(dist) * 0.6), t0 = performance.now();
        const ease = p => 1 - Math.pow(1 - p, 3);
        animating = true;
        const step = now => {
            const p = Math.min(1, (now - t0) / dur);
            window.scrollTo(0, Math.round(from + dist * ease(p)));
            if (p < 1 && animating) raf = requestAnimationFrame(step); else animating = false;
        };
        raf = requestAnimationFrame(step);
    }
    // เลื่อนต่อไปข้างหน้า (ทางเดียวกับนิ้ว) ให้หัวข้อที่ "ใกล้" ชิดใต้แถบบน — ไม่ดึงย้อนกลับ ไม่ทำใกล้ขอบล่าง
    function settle() {
        if (!armed || animating || !on() || busyInput() || !dir) return;
        armed = false;
        const y = window.scrollY, vh = window.innerHeight, max = maxY();
        if (max < vh * 0.6) return;                       // หน้าสั้น: ไม่ต้องจัด
        if (y <= 0 || y >= max - vh * 0.15) return;       // บนสุด / ใกล้ล่างสุด (รวมตอนเด้ง)
        const reach = vh * 0.25;
        let best = null;
        document.querySelectorAll(SEL).forEach(el => {
            if (el.getClientRects().length === 0) return;
            const t = Math.min(max, Math.max(0, Math.round(el.getBoundingClientRect().top + y - (parseFloat(getComputedStyle(el).scrollMarginTop) || 0))));
            const d = (t - y) * dir;                       // > 0 = อยู่ข้างหน้าตามทิศที่ปัด
            if (d > 2 && d <= reach && (!best || d < best.d)) best = { t, d };
        });
        if (best) glide(best.t);
    }
    function onScroll() {
        if (animating || !armed) return;
        clearTimeout(timer);
        timer = setTimeout(settle, 160); // แรงเหวี่ยงหยุดแล้ว
    }
    function init() {
        window.addEventListener('scroll', onScroll, { passive: true });
        document.addEventListener('touchstart', e => {
            cancel(); clearTimeout(timer); armed = false;
            startY = e.touches && e.touches[0] ? e.touches[0].clientY : 0;
        }, { passive: true });
        const up = e => {
            const t = e.changedTouches && e.changedTouches[0];
            const moved = t ? startY - t.clientY : (e.detail && e.detail.dy) || 0; // > 0 = ปัดขึ้น (เลื่อนหน้าลง)
            dir = Math.abs(moved) > 12 ? Math.sign(moved) : 0;
            armed = !!dir;
            clearTimeout(timer);
            if (armed) timer = setTimeout(settle, 160);
        };
        document.addEventListener('touchend', up, { passive: true });
        document.addEventListener('touchcancel', () => { armed = false; }, { passive: true });
        ['wheel', 'keydown', 'mousedown'].forEach(t => window.addEventListener(t, () => { cancel(); armed = false; }, { passive: true }));
    }
    return { init, settle, glide };
})();
document.addEventListener('DOMContentLoaded', SoftSnap.init);

// ติดตั้งเป็นแอป: service worker (แคชไฟล์ ออฟไลน์ แจ้งเตือน) + ขอให้เบราว์เซอร์เก็บข้อมูลถาวร
// (ลดโอกาสที่ Safari ลบข้อมูลในเครื่อง เช่น รายงานที่รอส่ง เมื่อไม่ได้เปิดเว็บนาน)
let INSTALL_PROMPT = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); INSTALL_PROMPT = e; document.dispatchEvent(new CustomEvent('installable')); });
window.addEventListener('appinstalled', () => { INSTALL_PROMPT = null; document.dispatchEvent(new CustomEvent('installable')); });
if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(e => console.warn('ลงทะเบียน service worker ไม่สำเร็จ', e));
        if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => {});
    });
}
document.addEventListener('installable', () => {
    const body = document.getElementById('settingsBody'), dlg = document.getElementById('settingsModal');
    if (body && dlg && dlg.open) renderSettings(body, [{ title: 'แอป', rows: [installSettingsRow()] }, displaySettings()]);
});
function isStandalone() {
    return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}
// แถวในหน้าตั้งค่า: ติดตั้งเป็นแอป
function installSettingsRow() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isStandalone()) return { icon: 'check-circle', tone: 'green', label: 'ติดตั้งเป็นแอปแล้ว', desc: 'เปิดจากไอคอนบนหน้าจอโฮม · เปิดได้แม้ไม่มีสัญญาณ' };
    if (INSTALL_PROMPT) return { id: 'installApp', icon: 'download', tone: 'blue', label: 'ติดตั้งเป็นแอป', desc: 'เปิดเร็วขึ้น ใช้ได้แม้ออฟไลน์ และข้อมูลในเครื่องไม่หาย', control: { type: 'button', label: 'ติดตั้ง', onClick: async () => { INSTALL_PROMPT.prompt(); await INSTALL_PROMPT.userChoice.catch(() => {}); INSTALL_PROMPT = null; document.dispatchEvent(new CustomEvent('installable')); } } };
    return { icon: 'download', tone: 'blue', label: 'ติดตั้งเป็นแอป', desc: '', control: { type: 'info', html: ios
        ? '<span>เปิดเร็วขึ้น ใช้ได้แม้ออฟไลน์ และ Safari จะไม่ลบข้อมูลในเครื่องหลังไม่ได้ใช้ 7 วัน</span><ol class="set-steps"><li>เปิดหน้านี้ใน <b>Safari</b></li><li>แตะปุ่ม <b>แชร์</b> (สี่เหลี่ยมมีลูกศรขึ้น)</li><li>เลือก <b>เพิ่มไปยังหน้าจอโฮม</b> แล้วเปิดจากไอคอน</li></ol>'
        : '<span>เปิดเร็วขึ้นและใช้ได้แม้ออฟไลน์ — เปิดเมนูของเบราว์เซอร์ (⋮) แล้วเลือก <b>ติดตั้งแอป</b> หรือ <b>เพิ่มลงในหน้าจอหลัก</b></span>' } };
}
