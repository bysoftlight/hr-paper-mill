// js/settings.js — การตั้งค่าที่จำไว้ในเครื่องนี้ (ใช้ร่วมกันทั้งหน้าผู้ใช้สิทธิ์และหน้า Staff)
// โหลดใน <head> เพื่อใส่ธีม/ขนาดตัวอักษรก่อนหน้าเว็บแสดง (ไม่กะพริบเป็นสีขาวก่อนเปลี่ยนเป็นโหมดมืด)

const PREFS_KEY = 'HRPM_PREFS';
const PREF_DEFAULTS = {
    theme: 'system',   // system | light | dark
    text: 'm',         // m | l | xl
    motion: false,     // true = ลดภาพเคลื่อนไหว
    haptic: true,      // สั่นเบาๆ เมื่อแตะเมนู
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
            { icon: 'haptic', tone: 'amber', label: 'สั่นเมื่อแตะเมนู', desc: 'สั่นเบาๆ เมื่อเปลี่ยนหน้า (Android และ iPhone iOS 18 ขึ้นไป)', control: { type: 'switch', key: 'haptic' } },
            { icon: 'motion', tone: 'teal', label: 'ลดภาพเคลื่อนไหว', desc: 'ปิดแอนิเมชัน เหมาะกับเครื่องรุ่นเก่าหรือผู้ที่เวียนหัวง่าย', control: { type: 'switch', key: 'motion' } }
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
