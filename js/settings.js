// js/settings.js — การตั้งค่าที่จำไว้ในเครื่องนี้ (ใช้ร่วมกันทั้งหน้าผู้ใช้สิทธิ์และหน้า Staff)
// โหลดใน <head> เพื่อใส่ธีม/ขนาดตัวอักษรก่อนหน้าเว็บแสดง (ไม่กะพริบเป็นสีขาวก่อนเปลี่ยนเป็นโหมดมืด)

const PREFS_KEY = 'HRPM_PREFS';
const PREF_DEFAULTS = {
    theme: 'system',   // system | light | dark
    text: 'm',         // m | l | xl
    motion: false,     // true = ลดภาพเคลื่อนไหว
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
            { icon: 'motion', tone: 'teal', label: 'ลดภาพเคลื่อนไหว', desc: 'ปิดแอนิเมชัน เหมาะกับเครื่องรุ่นเก่าหรือผู้ที่เวียนหัวง่าย', control: { type: 'switch', key: 'motion' } }
        ]
    };
}
