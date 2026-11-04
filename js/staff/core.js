// js/staff/core.js — สถานะกลาง, เข้าสู่ระบบ (Google / LINE), สิทธิ์, เมนู และอัปเดตสด

const ST = {
    token: null, me: null, config: null, perms: new Set(),
    participants: null, participantsReq: null,
    lastSeen: 0, lastSync: 0, view: null
};
const TOKEN_KEY = 'HRPM_STAFF_TOKEN';
const SELF_TYPE = 'ทำการขายด้วยตัวเอง';
const AGENT_TYPE = 'ทำการขายโดยตัวแทน';
const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const ROLE_LABELS = { pending: 'รออนุมัติ', viewer: 'ผู้ดูข้อมูล', billing: 'ผู้ดูแลการเงิน', editor: 'ผู้แก้ไข', admin: 'ผู้ดูแลระบบ', dev: 'Dev (ผู้พัฒนาระบบ)' };
const STATUS_LABELS = { pending: 'รออนุมัติ', active: 'ใช้งาน', suspended: 'ระงับ', rejected: 'ปฏิเสธ' };
const PERM_LABELS = {
    'records.view': 'ดูรายงานการส่ง', 'records.edit': 'เพิ่ม / แก้ไขรายงาน', 'records.delete': 'ลบ / กู้คืนรายงาน', 'participants.view': 'ดูข้อมูลผู้ใช้สิทธิ์',
    'participants.edit': 'เพิ่ม / แก้ไขผู้ใช้สิทธิ์', 'participants.delete': 'ลบ / กู้คืนผู้ใช้สิทธิ์ (ถังขยะ)', 'export': 'ส่งออกข้อมูล (Excel, PDF, Google Sheets)', 'admin': 'จัดการบัญชีเจ้าหน้าที่และดู Log',
    'billing': 'แพ็กเกจ ใบแจ้งหนี้ และการชำระเงินขององค์กร',
    'dev': 'Dev Console: องค์กร แพลน การชำระเงิน ทุกองค์กร'
};
// คำอธิบายสั้นๆ ของแต่ละสิทธิ์ (หน้าบัญชี › สิทธิ์ของคุณ)
const PERM_DESC = {
    'records.view': 'เปิดดูภาพรวม รายการรายงาน แผนที่ และรูปหลักฐาน',
    'records.edit': 'เพิ่มรายงานแทนผู้ใช้สิทธิ์ และแก้ไขประเภทการขาย เวลา หรือหมายเหตุ',
    'records.delete': 'ลบรายงานที่ผิด/ซ้ำ (ไม่นับเป็นการส่ง) และกู้คืนได้ภายหลัง',
    'participants.view': 'ดูรายชื่อ เบอร์โทร จุดขาย ปฏิทินการส่ง และบันทึกการโทรติดตาม',
    'participants.edit': 'เพิ่มผู้ใช้สิทธิ์ใหม่ แก้ชื่อ จุดขาย พิกัด รูป หรือปิดใช้งาน',
    'participants.delete': 'ย้ายผู้ใช้สิทธิ์ไปถังขยะ และกู้คืนได้ภายใน 30 วัน',
    'export': 'ส่งออก Excel / Google Sheets / PDF และรายงานมาตรา 35',
    'billing': 'ดูแพลน สถานะ ใบแจ้งหนี้ และช่องทางชำระเงิน (ไม่เห็นข้อมูลผู้ใช้สิทธิ์ถ้าไม่มีสิทธิ์ดู)',
    'admin': 'อนุมัติ/ระงับบัญชีเจ้าหน้าที่ ตั้งสิทธิ์ ประกาศ แบบสอบถาม เรื่องที่แจ้ง สถิติ Log และประวัติการแก้ไข',
    'dev': 'จัดการองค์กร แพลน ใบแจ้งหนี้ และความปลอดภัยของทั้งระบบ (เฉพาะผู้ให้บริการ)'
};
// ---------- ประวัติการแก้ไข (ผู้ดูแลระบบ): ใคร ทำอะไร เมื่อไร เปลี่ยนจากอะไรเป็นอะไร — จาก Log ขององค์กร ----------
const EditHistory = {
    KEYS: { name: 'ชื่อ', status: 'การใช้สิทธิ์', site: 'จุดขาย', phone: 'เบอร์โทร', active: 'ใช้งาน', siteLat: 'ละติจูดจุดขาย', siteLng: 'ลองจิจูดจุดขาย', pic: 'รูปโปรไฟล์',
        id: 'รหัส', recordsMoved: 'ย้ายรายงาน', reason: 'เหตุผล', type: 'ประเภทการขาย', time: 'เวลา', note: 'หมายเหตุ', date: 'วันที่', lat: 'ละติจูด', lng: 'ลองจิจูด',
        records: 'จำนวนรายงาน', trashDays: 'เก็บในถังขยะ (วัน)', result: 'ผลการติดต่อ', deletedAt: 'ลบเมื่อ', deletedBy: 'ลบโดย', photoTrashed: 'ย้ายรูปไปถังขยะ', force: 'บันทึกซ้ำวันเดิม' },
    val(v) { return v === true ? 'ใช่' : v === false ? 'ไม่' : v === null || v === undefined || v === '' ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v); },
    details(raw) {
        if (!raw) return '';
        let o; try { o = JSON.parse(raw); } catch (e) { return `<li>${esc(raw)}</li>`; }
        return Object.keys(o || {}).filter(k => o[k] !== undefined && o[k] !== '').map(k => {
            const v = o[k], label = esc(this.KEYS[k] || k);
            return Array.isArray(v) && v.length === 2 ? `<li><b>${label}</b> <s>${esc(this.val(v[0]))}</s> → ${esc(this.val(v[1]))}</li>` : `<li><b>${label}</b> ${esc(this.val(v))}</li>`;
        }).join('');
    },
    // ปุ่ม "ประวัติการแก้ไข" ในแผ่นรายละเอียด — โหลดเมื่อแตะ (ไม่ดึง Log ทุกครั้งที่เปิด)
    mount(el, params) {
        el.hidden = !can('admin');
        if (el.hidden) return;
        el.innerHTML = `<button type="button" class="hist-toggle" aria-expanded="false">${icon('activity', 'ic-16')}<span>ประวัติการแก้ไข</span>${icon('chevron-down', 'ic-16')}</button><div class="hist-body" hidden></div>`;
        const btn = el.querySelector('.hist-toggle'), body = el.querySelector('.hist-body');
        btn.onclick = async () => {
            const open = btn.getAttribute('aria-expanded') !== 'true';
            btn.setAttribute('aria-expanded', String(open)); body.hidden = !open;
            if (!open || body.dataset.loaded) return;
            body.innerHTML = '<div class="skel" style="height:60px;border-radius:12px"></div>';
            const r = await api('admin.history', params);
            if (!r.success) { body.innerHTML = `<p class="muted-text">${esc(r.message || 'โหลดไม่สำเร็จ')}</p>`; return; }
            body.dataset.loaded = '1';
            body.innerHTML = r.items.length ? `<ol class="hist-list">${r.items.map(h => `<li class="hist-item">
                <span class="hist-dot ${((typeof ACTION_TONE !== 'undefined' && ACTION_TONE[h.action.split('.')[1] || '']) || '')}"></span>
                <div><b>${esc((typeof ACTION_LABELS !== 'undefined' && ACTION_LABELS[h.action]) || h.action)}</b>
                <small>${esc(h.actorName || '-')}${h.actorRole ? ' · ' + esc(ROLE_LABELS[h.actorRole] || h.actorRole) : ''} · ${thDateTime(h.ts)}</small>
                ${this.details(h.details) ? `<ul class="hist-changes">${this.details(h.details)}</ul>` : ''}</div></li>`).join('')}</ol>${r.total > r.items.length ? `<p class="hint">แสดง ${r.items.length} จาก ${fmtNum(r.total)} รายการล่าสุด · ดูทั้งหมดได้ที่ ผู้ดูแลระบบ › Logs</p>` : ''}`
                : '<p class="muted-text">ยังไม่มีการแก้ไขโดยเจ้าหน้าที่</p>';
        };
    }
};

const thb = n => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const VIEWS = {};      // โมดูลแต่ละหน้า: { show(), onLive?(count) }
const $ = (id) => document.getElementById(id);

// ---------- helpers ----------
function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function can(perm) { return ST.perms.has(perm); }
function pad2(n) { return String(n).padStart(2, '0'); }
// วันที่/เวลาทั้งหมดอิงเวลาประเทศไทย (ตรงกับ Apps Script) ไม่ว่าเครื่องจะตั้งเขตเวลาใด
const TZ = 'Asia/Bangkok';
const ISO_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const HM_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
function isoDate(d) { return ISO_FMT.format(d); }
function todayIso() { return isoDate(new Date()); }
function nowHM() { return HM_FMT.format(new Date()); }
function bkkParts(d = new Date()) { const [y, m, day] = isoDate(d).split('-').map(Number); return { y, m: m - 1, d: day }; }
// วันที่แบบ yyyy-mm-dd → เวลาเที่ยงวันของไทย (แสดงผลเป็นวันเดียวกันเสมอ)
function parseIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 5)); }
function thDate(v, opts) {
    const d = typeof v === 'string' ? parseIso(v) : new Date(v);
    return d.toLocaleDateString('th-TH', Object.assign({ timeZone: TZ }, opts || { day: 'numeric', month: 'short', year: 'numeric' }));
}
function thDateLong(v) { return thDate(v, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
function thTime(ts, withSec) { return new Date(ts).toLocaleTimeString('th-TH', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: withSec ? '2-digit' : undefined }); }
function thDateTime(ts) { return `${thDate(ts)} ${thTime(ts)} น.`; }
function relTime(ts) {
    if (!ts) return '-';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 45) return 'เมื่อสักครู่';
    if (s < 3600) return `${Math.round(s / 60)} นาทีที่แล้ว`;
    if (s < 86400) return `${Math.round(s / 3600)} ชั่วโมงที่แล้ว`;
    if (s < 86400 * 7) return `${Math.round(s / 86400)} วันที่แล้ว`;
    return thDate(ts);
}
function fmtNum(n) { return Number(n || 0).toLocaleString('th-TH'); }
function fmtDistance(m) { return m === null || m === undefined ? '-' : m >= 1000 ? `${(m / 1000).toFixed(1)} กม.` : `${m} ม.`; }
// รูปโปรไฟล์: ใช้รูปย่อจาก Drive ก่อน ถ้าไฟล์ไม่ได้แชร์สาธารณะจะขอผ่าน API (avatarFallback) ไม่ได้ก็แสดงตัวอักษรแรก
function avatarHtml(name, pic, cls = '') {
    const initial = esc(String(name || '?').trim().charAt(0) || '?');
    const size = /avatar-(lg|xl)/.test(cls) ? 'w240' : 'w96';
    const src = pic ? String(pic).replace(/([?&]sz=)w\d+/, '$1' + size) : '';
    const img = src ? `<img src="${esc(src)}" alt="" referrerpolicy="no-referrer" loading="lazy" decoding="async" onerror="avatarFallback(this)">` : '';
    return `<div class="avatar ${cls}"><span>${initial}</span>${img}</div>`;
}
function avatarFallback(img) {
    img.onerror = null;
    const m = img.src.match(/drive\.google\.com\/thumbnail\?id=([\w-]{20,})/);
    if (!m || !ST.token) return img.remove();
    imageData(m[1], true).then(u => {
        if (!u || !img.isConnected) return img.remove();
        img.onerror = () => img.remove();
        img.src = u;
    });
}
function typeChip(type) {
    return type === AGENT_TYPE ? '<span class="chip chip-agent">โดยตัวแทน</span>' : '<span class="chip chip-self">ขายเอง</span>';
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function toast(text, ms = 2600) {
    const t = $('toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}
const scriptCache = {};
function loadScript(src) {
    if (!scriptCache[src]) {
        scriptCache[src] = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src; s.async = true; s.onload = resolve;
            s.onerror = () => { delete scriptCache[src]; reject(new Error('โหลดไฟล์ไม่สำเร็จ: ' + src)); };
            document.head.appendChild(s);
        });
    }
    return scriptCache[src];
}
function loadStyle(href) {
    if (!document.querySelector(`link[href="${href}"]`)) {
        const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
    }
}
function skeletonRows(cols, rows = 6) {
    return `<table class="dtable" aria-hidden="true"><tbody>${Array.from({ length: rows }, (_, i) =>
        `<tr class="skel-row">${Array.from({ length: cols }, (__, j) => `<td><span class="skel skel-text" style="width:${[70, 55, 80, 45, 60][(i + j) % 5]}%"></span></td>`).join('')}</tr>`).join('')}</tbody></table><span class="sr-only" role="status">กำลังโหลด</span>`;
}
function emptyState(text, iconName = 'inbox') { return `<div class="empty table-empty">${icon(iconName)}${esc(text)}</div>`; }

// ---------- API ----------
async function api(action, payload = {}) {
    const token = ST.token;
    const res = await callApi(action, Object.assign({ token, userAgent: navigator.userAgent.slice(0, 200) }, payload));
    // ออกจากระบบไปแล้วระหว่างรอ: ไม่ใช้ผลของ session เก่า
    if (token && token !== ST.token && !/^staff\.auth/.test(action)) return { success: false, code: 'ENDED', message: '' };
    if (!res.success && res.code === 'AUTH' && ST.token && !/^staff\.auth/.test(action)) {
        endSession(res.message);
    } else if (!res.success && (res.code === 'PENDING' || res.code === 'FORBIDDEN') && ST.me) {
        refreshMe();
    }
    trackApi(action, payload, res);
    return res;
}

// สถิติการใช้งาน: นับการกระทำสำคัญของเจ้าหน้าที่ (ไม่เก็บข้อมูลในคำขอ)
const TRACK_API = {
    'staff.auth.google': ['login', 'google'], 'staff.auth.line': ['login', 'line'],
    'staff.records.save': ['record_save'], 'staff.records.delete': ['record_delete'], 'staff.records.restore': ['record_restore'],
    'staff.participants.save': ['participant_save'], 'staff.participants.delete': ['participant_delete'], 'staff.contacts.add': ['contact_add'],
    'staff.export.gsheet': ['export', 'gsheet'], 'staff.report.monthly': ['report_view', 'monthly'], 'staff.report.section35': ['report_view', 'section35'],
    'staff.report.monthly.send': ['report_email', 'monthly']
};
function trackApi(action, payload, res) {
    if (action === 'staff.log.client' && res.success) return Analytics.track('export', { l: String(payload.logAction || '').replace('export.', '') });
    const t = TRACK_API[action];
    if (t) Analytics.track(res.success ? t[0] : t[0] + '_fail', t[1] ? { l: t[1] } : {});
}

ErrorLog.identify = () => ({ who: ST.me ? ST.me.id : '', whoName: ST.me ? ST.me.name : '', role: 'staff' });

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', async () => {
    Analytics.init({ app: 'staff', role: 'staff' });
    initDialogs();
    initShell();
    initSettings();
    Object.values(VIEWS).forEach(v => v.init && v.init());

    const params = new URLSearchParams(location.search);
    if (params.has('openExternalBrowser')) { params.delete('openExternalBrowser'); setUrl(location.pathname + (params.toString() ? '?' + params : '') + location.hash); }
    if (params.get('code') && params.get('state')) return finishLineLogin(params);
    if (params.get('error')) {
        setUrl(location.pathname + location.hash);
        return showAuth('ยกเลิกการเข้าสู่ระบบด้วย LINE แล้ว');
    }

    ST.token = store.get(TOKEN_KEY);
    if (ST.token) {
        $('appContainer').hidden = false;
        $('appContainer').classList.add('is-booting');
        // โหลดภาพรวมไปพร้อมกับตรวจ session (ไม่ต้องรอทีละคำขอ) — ถ้า session ใช้ไม่ได้ ผลนี้จะถูกทิ้ง
        const tab = location.hash.replace('#', '').split('?')[0];
        if (!tab || tab === 'overview') ST.prefetch = { overview: callApi('staff.overview', { token: ST.token, userAgent: navigator.userAgent.slice(0, 200) }) };
        return resumeSession();
    }
    showAuth();
});

// เปิดเว็บด้วย session ที่จำไว้: ต่ออายุ token อัตโนมัติ
// ลืม session เฉพาะเมื่อเซิร์ฟเวอร์ยืนยันว่าใช้ไม่ได้ (AUTH) — เน็ตหลุด/ระบบขัดข้องชั่วคราว ให้ลองใหม่โดยไม่ต้องเข้าสู่ระบบใหม่
async function resumeSession() {
    const r = await callApi('staff.me', { token: ST.token });
    if (r.success) { keepToken(r.token); return enter(r.staff, r.subscription); }
    if (r.code === 'AUTH') {
        store.remove(TOKEN_KEY); ST.token = null; ST.prefetch = null;
        $('appContainer').hidden = true;
        $('appContainer').classList.remove('is-booting');
        return showAuth(r.message || 'Session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
    }
    const retry = await showMessage({ title: r.networkError ? 'เชื่อมต่อไม่ได้' : 'ระบบขัดข้องชั่วคราว', text: (r.message || 'กรุณาลองใหม่อีกครั้ง') + ' — ยังจำการเข้าสู่ระบบไว้', tone: 'warn', okText: 'ลองอีกครั้ง', cancelText: 'ปิด' });
    if (retry) { ST.prefetch = null; return resumeSession(); }
    $('appContainer').hidden = true;
    $('appContainer').classList.remove('is-booting');
    showAuth('ยังจำการเข้าสู่ระบบไว้ — รีเฟรชหน้าเมื่ออินเทอร์เน็ตกลับมา');
}
// token ใหม่จากเซิร์ฟเวอร์ (ต่ออายุ) เก็บแทนของเดิม
function keepToken(token) {
    if (!token) return;
    ST.token = token;
    store.set(TOKEN_KEY, token);
}

// ---------- Sign in ----------
async function showAuth(message) {
    $('authView').hidden = false;
    $('appContainer').hidden = true;
    $('pendingView').hidden = true;
    setAuthHint(message || '');
    let config = ST.config;
    if (!config) {
        const cfg = await callApi('staff.config');
        if (cfg.success) ST.config = config = cfg; // โหลดไม่สำเร็จไม่จำไว้ ครั้งหน้าลองใหม่
        else { config = {}; if (!message) setAuthHint(cfg.message || 'โหลดการตั้งค่าไม่สำเร็จ', true); }
    }
    setupGoogle(config);
    $('lineBtn').disabled = !config.lineChannelId;
    $('lineBtn').title = config.lineChannelId ? '' : 'ยังไม่ได้ตั้งค่า LINE Login';
}

function setAuthHint(text, isError) {
    const h = $('authHint');
    h.textContent = text;
    h.classList.toggle('is-error', !!isError);
}

// เบราว์เซอร์ในแอป (LINE, Facebook, Instagram…): Google ไม่อนุญาตให้เข้าสู่ระบบในนี้ (disallowed_useragent → "มีข้อผิดพลาดเกิดขึ้น")
// จึงพาไปเปิดหน้าเดิมใน Safari/Chrome ก่อน แล้วค่อยกดเข้าสู่ระบบด้วย Google ที่นั่น
const GOOGLE_BTN = '<button type="button" class="btn btn-google" id="googleSignIn"><svg class="g-logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.6 12.23c0-.71-.06-1.4-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.32 2.98-7.35Z"/><path fill="currentColor" d="M12 22c2.7 0 4.97-.9 6.62-2.42l-3.24-2.5c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.58A10 10 0 0 0 12 22Z"/><path fill="currentColor" d="M6.41 13.92a6 6 0 0 1 0-3.84V7.5H3.07a10 10 0 0 0 0 9z"/><path fill="currentColor" d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.5l3.34 2.58C7.2 7.72 9.4 5.96 12 5.96Z"/></svg>เข้าสู่ระบบด้วย Google</button>';
const IN_APP = (() => {
    const ua = navigator.userAgent || '';
    if (/\bLine\//i.test(ua)) return 'LINE';
    if (/FBAN|FBAV|FB_IAB|FBIOS|Messenger/i.test(ua)) return 'Facebook';
    if (/Instagram/i.test(ua)) return 'Instagram';
    if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return 'TikTok';
    if (/MicroMessenger/i.test(ua)) return 'WeChat';
    if (/Android/i.test(ua) && /; wv\)/.test(ua)) return 'แอปนี้';
    return '';
})();
const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
async function openOutside() {
    const url = new URL(location.href);
    url.hash = '';
    if (IN_APP === 'LINE') { url.searchParams.set('openExternalBrowser', '1'); location.href = url.toString(); return; } // LINE เปิดลิงก์นี้ใน Safari/Chrome ให้เอง
    if (!IS_IOS && /Android/i.test(navigator.userAgent)) { location.href = 'intent://' + url.host + url.pathname + url.search + '#Intent;scheme=https;S.browser_fallback_url=' + encodeURIComponent(url.toString()) + ';end'; return; }
    const copy = await showMessage({ title: `เปิดใน ${IS_IOS ? 'Safari' : 'เบราว์เซอร์'} เพื่อใช้ Google`, tone: 'info',
        text: `Google ไม่อนุญาตให้เข้าสู่ระบบในเบราว์เซอร์ของ ${IN_APP} · แตะ ⋯ แล้วเลือก "เปิดในเบราว์เซอร์" หรือคัดลอกลิงก์ไปวางใน ${IS_IOS ? 'Safari' : 'Chrome'}`,
        okText: 'คัดลอกลิงก์', cancelText: 'ปิด' });
    if (!copy) return;
    try { await navigator.clipboard.writeText(url.toString()); toast('คัดลอกลิงก์แล้ว'); } catch (e) { setAuthHint(url.toString()); }
}

function setupGoogle(config) {
    const slot = $('googleBtn');
    if (IN_APP && config.googleClientId) {
        slot.innerHTML = GOOGLE_BTN;
        $('googleSignIn').addEventListener('click', () => { setAuthHint(''); openOutside(); });
        setAuthHint(IN_APP === 'LINE' ? 'เปิดอยู่ในแอป LINE: ใช้ปุ่ม LINE ได้ทันที · ปุ่ม Google จะเปิดหน้านี้ใน Safari/Chrome ก่อน' : `เปิดอยู่ในแอป ${IN_APP}: ปุ่ม Google จะพาไปเปิดในเบราว์เซอร์ก่อน (Google ไม่ให้เข้าสู่ระบบในแอป)`);
        return;
    }
    if (!config.googleClientId) {
        slot.innerHTML = '<button type="button" class="btn btn-outline" disabled>เข้าสู่ระบบด้วย Google (ยังไม่ได้ตั้งค่า)</button>';
        return;
    }
    loadScript('https://accounts.google.com/gsi/client').then(() => {
        google.accounts.id.initialize({ client_id: config.googleClientId, callback: handleGoogleCredential, ux_mode: 'popup', auto_select: false });
        // ระบบหลังบ้านรุ่นใหม่รองรับ access token → ใช้ปุ่มที่ออกแบบเอง (ฟ้าไล่สี · โลโก้ G ขาว) · รุ่นเก่า → ปุ่มมาตรฐานของ Google
        if (config.googleAccessToken && google.accounts.oauth2) {
            const client = google.accounts.oauth2.initTokenClient({
                client_id: config.googleClientId, scope: 'openid email profile', prompt: 'select_account',
                callback: r => { if (r && r.access_token) handleGoogleAccess(r.access_token); else if (r && r.error) setAuthHint('เข้าสู่ระบบด้วย Google ไม่สำเร็จ (' + r.error + ')', true); },
                error_callback: e => { if (e && e.type !== 'popup_closed') setAuthHint('เปิดหน้าต่าง Google ไม่ได้ — อนุญาต pop-up แล้วลองใหม่', true); }
            });
            slot.innerHTML = GOOGLE_BTN;
            $('googleSignIn').addEventListener('click', () => { setAuthHint(''); client.requestAccessToken(); });
            return;
        }
        slot.innerHTML = '';
        google.accounts.id.renderButton(slot, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', locale: 'th', width: Math.min(400, slot.clientWidth || 320) });
    }).catch(() => {
        slot.innerHTML = '<button type="button" class="btn btn-outline" disabled>โหลดปุ่ม Google ไม่สำเร็จ</button>';
    });
}

// Google Identity Services เรียกฟังก์ชันนี้เมื่อผู้ใช้เลือกบัญชีแล้ว
async function handleGoogleCredential(response) {
    showLoading(true, 'กำลังเข้าสู่ระบบ…');
    const res = await api('staff.auth.google', { credential: response.credential });
    showLoading(false);
    onLoginResult(res);
}

async function handleGoogleAccess(accessToken) {
    showLoading(true, 'กำลังเข้าสู่ระบบ…');
    const res = await api('staff.auth.google', { accessToken });
    showLoading(false);
    onLoginResult(res);
}

function randomString(len) {
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    return Array.from(bytes, b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[b % 66]).join('');
}
function base64url(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// LINE Login (OAuth 2.0 + PKCE) — แลก code เป็นตัวตนที่ฝั่ง Apps Script (เก็บ Channel secret ไว้ที่นั่น)
async function startLineLogin() {
    if (!ST.config || !ST.config.lineChannelId) return;
    const state = randomString(32), verifier = randomString(64);
    const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    sessionStorage.setItem('line_state', state);
    sessionStorage.setItem('line_verifier', verifier);
    const q = new URLSearchParams({
        response_type: 'code', client_id: ST.config.lineChannelId, redirect_uri: location.origin + location.pathname,
        state, scope: 'profile openid email', code_challenge: challenge, code_challenge_method: 'S256', nonce: randomString(16), bot_prompt: 'normal'
    });
    location.href = 'https://access.line.me/oauth2/v2.1/authorize?' + q.toString();
}

async function finishLineLogin(params) {
    const state = sessionStorage.getItem('line_state'), verifier = sessionStorage.getItem('line_verifier');
    sessionStorage.removeItem('line_state'); sessionStorage.removeItem('line_verifier');
    setUrl(location.pathname);
    if (!state || state !== params.get('state') || !verifier) return showAuth('การเข้าสู่ระบบด้วย LINE ไม่ถูกต้อง กรุณาลองใหม่');
    showLoading(true, 'กำลังเข้าสู่ระบบด้วย LINE…');
    const res = await api('staff.auth.line', { code: params.get('code'), codeVerifier: verifier, redirectUri: location.origin + location.pathname });
    showLoading(false);
    onLoginResult(res);
}

function onLoginResult(res) {
    if (!res.success) {
        if ($('authView').hidden) showAuth(res.message); else setAuthHint(res.message || 'เข้าสู่ระบบไม่สำเร็จ', true);
        return;
    }
    ST.token = res.token;
    store.set(TOKEN_KEY, res.token);
    enter(res.staff, res.subscription);
}

async function logout() {
    const ok = await showMessage({ title: 'ออกจากระบบ?', text: 'ครั้งต่อไปต้องเข้าสู่ระบบด้วย Google หรือ LINE อีกครั้ง', tone: 'bad', okText: 'ออกจากระบบ', cancelText: 'ยกเลิก' });
    if (!ok) return;
    api('staff.logout');
    try { window.google && google.accounts.id.disableAutoSelect(); } catch (e) {}
    endSession();
}

// ออกจากระบบ / session ใช้ไม่ได้: ล้างข้อมูลแล้วสลับไปหน้าเข้าสู่ระบบทันทีในหน้าเดิม
// (ไม่พึ่ง location.replace() เพราะบางเบราว์เซอร์/แอปบนหน้าจอหลักไม่โหลดหน้าใหม่ให้ จนต้องกด F5)
function endSession(message) {
    store.remove(TOKEN_KEY);
    if (typeof Prefs !== 'undefined' && Prefs.useAccount) Prefs.useAccount(null);
    Object.assign(ST, { token: null, me: null, perms: new Set(), participants: null, participantsReq: null, participantMeta: null, prefetch: null, lastSeen: 0, view: null });
    Analytics.setUser('');
    clearInterval(liveTimer); clearInterval(liveTextTimer); clearInterval(pendingTimer);
    // สลับไปหน้าเข้าสู่ระบบก่อนเสมอ แล้วจึงเก็บกวาด — ขั้นใดผิดพลาดในบางเบราว์เซอร์ก็ไม่ค้างหน้าเดิม
    $('appContainer').hidden = true;
    $('pendingView').hidden = true;
    $('authView').hidden = false;
    $('appContainer').classList.remove('is-booting');
    runSteps([
        () => IMG_CACHE.clear(),
        () => document.querySelectorAll('dialog[open]').forEach(d => d.close()),
        () => showLoading(false),
        ...Object.values(VIEWS).map(v => () => v.reset && v.reset()),
        () => setUrl(location.pathname),
        () => window.scrollTo(0, 0),
        () => { showAuth(message || '').catch(e => console.warn(e)); }
    ]);
}

// ---------- After sign in ----------
// องค์กรหมดช่วงทดลอง/ค้างชำระเกินกำหนด/ถูกระงับ (Dev ใช้งานได้เสมอ)
// หน้าแพ็กเกจและราคา (เว็บไซต์ softlight) — เห็นเฉพาะผู้ดูแลระบบ/Dev
const PRODUCT_URL = 'https://bysoftlight.github.io/software/hr-paper-mill.html';
// ผู้ที่เห็นเรื่องแพลน/การชำระเงินขององค์กร: ผู้ดูแลระบบ · ผู้ดูแลการเงิน · Dev
const isOrgAdmin = me => !!me && (me.role === 'admin' || me.role === 'dev' || me.role === 'billing');
function subLocked(sub, me) { return !!(sub && sub.ok === false && !(me && me.role === 'dev')); }
const SUB_STATE_TH = { trial: 'ทดลองใช้ฟรี', active: 'ใช้งาน', past_due: 'ค้างชำระ', trial_expired: 'หมดช่วงทดลองใช้', expired: 'หมดอายุ', suspended: 'ถูกระงับ', cancelled: 'ยกเลิกแล้ว' };
// แถบแจ้งสถานะการสมัครสมาชิกขององค์กร: ทดลองใช้ (เหลือกี่วัน) · ใกล้หมดรอบ · ค้างชำระ
// ผู้ดูแลระบบเห็นทุกช่วง · ผู้แก้ไขเห็นเฉพาะตอนใกล้หมดอายุ/ค้างชำระ (ไม่มีปุ่มแพ็กเกจ ให้แจ้งผู้ดูแล) · ผู้ดูข้อมูลไม่เห็น
function renderSubBanner() {
    const el = $('subBanner'), s = ST.sub;
    if (typeof OrgMark !== 'undefined') OrgMark.set(s && s.org ? s.org : null, { // การ์ดองค์กรในเมนูด้านข้าง
        meta: s && s.plan ? s.plan.name : '', count: OrgMark.opts && OrgMark.org && s && s.org && OrgMark.org.id === s.org.id ? OrgMark.opts.count : null,
        open: () => { haptic(); if (can('dev') && VIEWS.dev) { VIEWS.dev.sec = 'orgs'; switchTab('dev'); } else switchTab(can('participants.view') ? 'participants' : 'account'); }
    });
    if (!el) return;
    // ผู้ดูแลระบบ: ช่วงทดลองใช้ทั้งหมด + ใกล้หมดรอบ/ค้างชำระ · ผู้แก้ไข: เฉพาะใกล้หมดอายุ (≤ 7 วัน) หรือค้างชำระ · Dev = ผู้ให้บริการ ไม่ใช่ลูกค้า
    const role = ST.me ? ST.me.role : '', admin = isOrgAdmin(ST.me) && role !== 'dev', editor = role === 'editor';
    const show = !!(s && s.ok && ((admin && (s.state === 'trial' || s.warn)) || (editor && s.warn)));
    el.hidden = !show;
    if (!show) return;
    const tone = s.state === 'past_due' ? 'is-bad' : s.warn ? 'is-warn' : 'is-accent';
    const left = s.daysLeft === null || s.daysLeft === undefined ? '' : s.daysLeft <= 0 ? 'วันนี้วันสุดท้าย' : `เหลือ ${fmtNum(s.daysLeft)} วัน`;
    // หัวเรื่อง + วันที่เหลือ (ป้าย) · องค์กร/วันสิ้นสุด · ข้อความเพิ่มเติมเฉพาะค้างชำระ/ใกล้หมดรอบ (ไม่ซ้ำกับหัวเรื่อง) · ปุ่มแพ็กเกจขึ้นบรรทัดใหม่บนมือถือ
    const extra = s.state !== 'trial' && s.message && s.state !== 'active' ? s.message : '';
    el.innerHTML = `<div class="sub-card ${tone}">
      <span class="sub-ic">${icon(s.state === 'past_due' ? 'alert' : 'calendar')}</span>
      <span class="sub-text"><span class="sub-title"><b>${esc(SUB_STATE_TH[s.state] || s.state)}${s.plan ? ' · แพลน ' + esc(s.plan.name) : ''}</b>${left ? `<span class="sub-left">${left}</span>` : ''}</span>
        <small>${esc(s.org ? s.org.name : '')}${s.endsAt ? ' · ถึง ' + thDate(s.endsAt, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</small>${extra ? `<small>${esc(extra)}</small>` : ''}${admin ? '' : '<small class="sub-note">โปรดแจ้งผู้ดูแลระบบขององค์กรเพื่อต่ออายุการใช้งาน</small>'}</span>
      ${admin ? `<a class="btn btn-sm sub-btn ${s.state === 'past_due' ? 'btn-primary' : 'btn-tonal'}" href="${PRODUCT_URL}#packages" target="_blank" rel="noopener">ดูแพ็กเกจ ${icon('arrow-right', 'ic-16')}</a>` : ''}
    </div>`;
}

function enter(me, sub) {
    if (typeof Prefs !== 'undefined' && Prefs.useAccount) Prefs.useAccount(me.id); // การตั้งค่าของบัญชีนี้บนเครื่องนี้
    ST.me = me;
    ST.sub = sub || null;
    ST.perms = new Set(me.permissions || []);
    Analytics.setRole(me.role || 'staff');
    Analytics.setUser(me.email || '');
    $('authView').hidden = true;
    if (me.status !== 'active' || !ST.perms.size || subLocked(ST.sub, me)) return showPending(me);
    $('pendingView').hidden = true;
    showApp();
    renderSubBanner();
}

let pendingTimer = null;
function showPending(me) {
    $('appContainer').hidden = true;
    $('pendingView').hidden = false;
    $('pendAvatar').outerHTML = avatarHtml(me.name, me.picture, 'avatar-xl').replace('<div class="avatar', '<div id="pendAvatar" class="avatar');
    const msgs = {
        pending: ['รอผู้ดูแลระบบอนุมัติ', 'บัญชีของคุณถูกสร้างแล้ว แต่ยังไม่มีสิทธิ์เข้าถึงข้อมูล กรุณาแจ้งผู้ดูแลระบบให้อนุมัติ หน้านี้จะตรวจสอบสถานะให้อัตโนมัติ'],
        suspended: ['บัญชีถูกระงับการใช้งาน', 'กรุณาติดต่อผู้ดูแลระบบหากคิดว่าเป็นความผิดพลาด'],
        rejected: ['คำขอใช้งานไม่ได้รับอนุมัติ', 'กรุณาติดต่อผู้ดูแลระบบหากต้องการใช้งาน'],
        active: ['ยังไม่ได้รับสิทธิ์ใดๆ', 'บัญชีของคุณใช้งานได้ แต่ยังไม่ได้รับสิทธิ์ดูข้อมูล กรุณาติดต่อผู้ดูแลระบบ']
    };
    let [title, text] = msgs[me.status] || msgs.pending;
    if (me.status === 'active' && subLocked(ST.sub, me)) [title, text] = isOrgAdmin(me)
        ? [`${ST.sub.org ? ST.sub.org.name + ' · ' : ''}${SUB_STATE_TH[ST.sub.state] || 'ใช้งานไม่ได้'}`, ST.sub.message + ' — ดูแพ็กเกจและช่องทางชำระเงินได้ที่เว็บไซต์ softlight หน้านี้จะตรวจสอบสถานะให้อัตโนมัติเมื่อชำระแล้ว']
        : ['ระบบปิดใช้งานชั่วคราว', 'ระบบขององค์กรยังใช้งานไม่ได้ในขณะนี้ กรุณาติดต่อผู้ดูแลระบบขององค์กร หน้านี้จะตรวจสอบสถานะให้อัตโนมัติ'];
    const pkg = $('pendPkg');
    if (pkg) pkg.hidden = !(me.status === 'active' && subLocked(ST.sub, me) && isOrgAdmin(me));
    $('pendTitle').textContent = title;
    $('pendText').textContent = text;
    $('pendKv').innerHTML = `<div><dt>ชื่อ</dt><dd>${esc(me.name)}</dd></div><div><dt>บัญชี</dt><dd>${esc(me.provider === 'line' ? 'LINE' : 'Google')}${me.email ? ' · ' + esc(me.email) : ''}</dd></div><div><dt>สถานะ</dt><dd>${esc(STATUS_LABELS[me.status] || me.status)}</dd></div>`;
    clearInterval(pendingTimer);
    if (me.status === 'pending' || subLocked(ST.sub, me)) pendingTimer = setInterval(refreshMe, 30000);
}

async function refreshMe() {
    const r = await api('staff.me');
    if (!r.success) return;
    keepToken(r.token);
    const wasActive = ST.me && ST.me.status === 'active' && ST.perms.size;
    const permsChanged = (r.staff.permissions || []).join() !== Array.from(ST.perms).join();
    const lockChanged = subLocked(r.subscription, r.staff) !== subLocked(ST.sub, ST.me);
    if (r.staff.status === 'active' && r.staff.permissions.length && !subLocked(r.subscription, r.staff)) clearInterval(pendingTimer);
    if (!wasActive || permsChanged || lockChanged || r.staff.status !== 'active') enter(r.staff, r.subscription);
    else { ST.sub = r.subscription || null; renderSubBanner(); }
}

function showApp() {
    const app = $('appContainer');
    app.hidden = false;
    app.classList.remove('is-booting');
    applyPerms();
    document.querySelectorAll('[data-me="name"]').forEach(el => { el.textContent = ST.me.name; });
    document.querySelectorAll('[data-me="role"]').forEach(el => { el.textContent = ROLE_LABELS[ST.me.role] || ST.me.role; });
    renderMeAvatars();
    if (!ST.lastSeen) ST.lastSeen = Date.now();
    ST.lastSync = Date.now();
    switchTab(tabFromHash(), false);
    startLive();
}

function renderMeAvatars() {
    document.querySelectorAll('[data-me="avatar"]').forEach(el => {
        const html = avatarHtml(ST.me.name, ST.me.picture, el.className.replace('avatar', '').trim());
        el.innerHTML = html.replace(/^<div[^>]*>|<\/div>$/g, '');
    });
}

function applyPerms() {
    document.querySelectorAll('[data-perm]').forEach(el => { el.hidden = !can(el.dataset.perm); });
    // ความปลอดภัยของระบบใช้ร่วมกันทุกองค์กร: เฉพาะ Dev และบัญชีที่ไม่ได้ผูกองค์กร
    const sys = !(ST.me && ST.me.org && ST.me.role !== 'dev');
    document.querySelectorAll('[data-sys]').forEach(el => { el.hidden = !sys; });
    const n = document.querySelectorAll('.bottomnav .nav-item:not([hidden])').length;
    document.querySelector('.bottomnav').style.setProperty('--nav-n', n);
}

// ---------- Navigation ----------
const TAB_ORDER = ['overview', 'records', 'participants', 'analytics', 'dev', 'admin', 'inbox', 'account'];
const TAB_PERM = { overview: 'records.view', records: 'records.view', participants: 'participants.view', analytics: 'admin', dev: 'dev', admin: 'admin' };
function tabAllowed(t) { return !TAB_PERM[t] || can(TAB_PERM[t]); }
function tabFromHash() {
    const t = location.hash.replace('#', '').split('?')[0];
    if (TAB_ORDER.includes(t) && tabAllowed(t)) return t;
    const start = Prefs.get('startTab');
    if (TAB_ORDER.includes(start) && tabAllowed(start)) return start;
    if (!can('records.view') && can('billing')) return 'account'; // ผู้ดูแลการเงิน: เปิดที่หน้าบัญชี (แพ็กเกจและการชำระเงิน)
    return TAB_ORDER.find(tabAllowed);
}

function switchTab(tab, push = true) {
    if (!tabAllowed(tab)) tab = TAB_ORDER.find(tabAllowed);
    ST.view = tab;
    TAB_ORDER.forEach(t => { $(t + 'View').hidden = t !== tab; });
    const navTab = tab === 'analytics' || tab === 'dev' ? 'admin' : tab; // สถิติ / Dev Console อยู่ใต้เมนูผู้ดูแล
    document.querySelectorAll('[data-tab]').forEach(b => {
        if (b.dataset.tab === navTab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (push && location.hash !== '#' + tab) setUrl('#' + tab, true);
    window.scrollTo({ top: 0 });
    Analytics.page(tab);
    if (VIEWS[tab] && VIEWS[tab].show) VIEWS[tab].show();
    if (tab === 'analytics') centerSelectedTab($('anAdmTabs'), true);
    if (tab === 'dev') centerSelectedTab($('devAdmTabs'), true);
    if (tab === 'inbox' && typeof Inbox !== 'undefined') Inbox.onShow();
}

// แถบแท็บผู้ดูแล (6 แท็บ) เลื่อนแนวนอนได้บนมือถือ: เลื่อนแท็บที่เลือกมาไว้กลางแถบ (ไม่เลื่อนหน้าแนวตั้ง)
function centerSelectedTab(bar, instant) {
    const sel = bar && bar.querySelector('[aria-selected="true"], [aria-checked="true"]');
    if (!sel || bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollTo({ left: Math.max(0, sel.offsetLeft - bar.offsetLeft - (bar.clientWidth - sel.offsetWidth) / 2), behavior: instant ? 'auto' : 'smooth' });
}

function initShell() {
    document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { haptic(); switchTab(b.dataset.tab); }));
    // โลโก้ = กลับหน้าแรก (แท็บแรกที่มีสิทธิ์ เช่น ภาพรวม)
    document.querySelectorAll('[data-home]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); haptic(); switchTab(TAB_ORDER.find(tabAllowed)); }));
    // แถบแท็บผู้ดูแลในหน้าสถิติ / Dev Console: สถิติ และ Dev เป็นหน้าแยก แท็บอื่นอยู่ในหน้าผู้ดูแล
    ['anAdmTabs', 'devAdmTabs'].forEach(id => $(id).addEventListener('click', e => {
        const b = e.target.closest('[data-t]');
        if (!b) return;
        if (b.dataset.t === 'analytics' || b.dataset.t === 'dev') return ST.view !== b.dataset.t && switchTab(b.dataset.t);
        VIEWS.admin.tab = b.dataset.t;
        switchTab('admin');
    }));
    document.addEventListener('click', e => {
        const go = e.target.closest('[data-goto]');
        if (go) switchTab(go.dataset.goto);
        if (e.target.closest('[data-action="logout"]')) logout();
    });
    window.addEventListener('hashchange', () => { if (ST.me && !$('appContainer').hidden) switchTab(tabFromHash(), false); });
    $('lineBtn').addEventListener('click', startLineLogin);
    $('pendRefresh').addEventListener('click', async () => {
        $('pendRefresh').disabled = true;
        await refreshMe();
        $('pendRefresh').disabled = false;
        if (!$('pendingView').hidden) toast('ยังรอการอนุมัติอยู่');
    });
}

// ---------- Participants (ใช้ร่วมกันหลายหน้า) ----------
function loadParticipants(force) {
    if (!can('participants.view')) return Promise.resolve(ST.participants || []);
    if (ST.participants && !force) return Promise.resolve(ST.participants);
    if (!ST.participantsReq || force) {
        ST.participantsReq = api('staff.participants.list').then(r => {
            ST.participantsReq = null;
            if (r.success) { ST.participants = r.participants; ST.participantMeta = { daysSoFar: r.daysSoFar, agentLimit: r.agentLimit }; }
            return ST.participants || [];
        });
    }
    return ST.participantsReq;
}

// รูปหลักฐาน: thumbnail ก่อน ถ้าไม่ได้แชร์สาธารณะให้ขอผ่าน API (แคชไว้)
const IMG_CACHE = new Map();
// คำขอรูปผ่าน Apps Script ช้าและกินโควตาการทำงานพร้อมกัน: จำกัดครั้งละ 3 คำขอ
const IMG_QUEUE = { running: 0, waiting: [] };
function queueImage(task) {
    return new Promise(resolve => {
        const run = () => {
            IMG_QUEUE.running++;
            task().then(resolve, () => resolve(null)).finally(() => {
                IMG_QUEUE.running--;
                if (IMG_QUEUE.waiting.length) IMG_QUEUE.waiting.shift()();
            });
        };
        if (IMG_QUEUE.running < 3) run(); else IMG_QUEUE.waiting.push(run);
    });
}
// thumb = รูปย่อจาก Drive (เล็กกว่าไฟล์จริงมาก) สำหรับตาราง
function imageData(fileId, thumb = false) {
    if (!fileId) return Promise.resolve(null);
    const key = fileId + (thumb ? ':t' : '');
    if (!IMG_CACHE.has(key)) {
        const p = queueImage(() => api('staff.image', { fileId, thumb }).then(r => (r.success ? r.dataUrl : null)));
        p.then(v => { if (!v) IMG_CACHE.delete(key); });
        IMG_CACHE.set(key, p);
    }
    return IMG_CACHE.get(key);
}
function loadImg(img, rec, onDone, thumb = false) {
    const finish = ok => { img.classList.remove('is-loading'); if (onDone) onDone(ok); };
    img.classList.add('is-loading');
    img.onload = () => finish(true);
    img.onerror = () => {
        img.onerror = null;
        imageData(rec.fileId, thumb).then(u => { if (u) img.src = u; else finish(false); });
    };
    // รูปในตารางขอขนาดเล็ก (Drive thumbnail รองรับ sz=w…)
    if (rec.image) img.src = thumb ? rec.image.replace(/([?&]sz=)w\d+/, '$1w200') : rec.image; else img.onerror();
}

// ---------- Live updates ----------
let liveTimer = null, liveTextTimer = null;
function startLive() {
    clearInterval(liveTimer); clearInterval(liveTextTimer);
    const sec = Number(Prefs.get('live')) || 0;
    if (sec) liveTimer = setInterval(pollLive, sec * 1000);
    liveTextTimer = setInterval(updateLiveText, 5000);
    updateLiveText();
}
// ผูกครั้งเดียว (เดิมผูกซ้ำทุกครั้งที่สิทธิ์เปลี่ยน ทำให้ยิงคำขอซ้ำหลายรอบ)
document.addEventListener('visibilitychange', () => {
    if (!ST.me || $('appContainer').hidden) return;
    updateLiveText();
    if (!document.hidden && Number(Prefs.get('live'))) pollLive();
});
// ออกจากระบบจากอีกแท็บ หรือกลับมาด้วยปุ่มย้อนกลับหลังออกจากระบบ → กลับหน้าเข้าสู่ระบบ
window.addEventListener('storage', e => {
    if ((e.key === TOKEN_KEY || e.key === null) && !store.get(TOKEN_KEY) && ST.token) endSession('ออกจากระบบจากหน้าต่างอื่นแล้ว');
    else if (e.key === TOKEN_KEY && e.newValue && ST.token) ST.token = e.newValue; // อีกแท็บต่ออายุ token
});
window.addEventListener('pageshow', e => {
    if (e.persisted && !store.get(TOKEN_KEY) && ST.token) endSession();
});

async function pollLive() {
    if (document.hidden || !ST.me || !can('records.view')) return;
    const r = await api('staff.records.latest', { since: ST.lastSeen });
    if (!r.success) return;
    ST.lastSync = Date.now();
    updateLiveText();
    if (r.count > 0) {
        ST.lastSeen = r.newest;
        Object.values(VIEWS).forEach(v => v.onLive && v.onLive(r.count));
    }
    if (can('admin') && VIEWS.admin && VIEWS.admin.refreshBadge) VIEWS.admin.refreshBadge();
}

const LIVE_LABELS = { 20: '20 วินาที', 60: '1 นาที', 300: '5 นาที' };
function updateLiveText() {
    const every = Number(Prefs.get('live')) || 0;
    const paused = document.hidden || !every;
    const sec = Math.round((Date.now() - (ST.lastSync || Date.now())) / 1000);
    const ago = sec < 60 ? sec + ' วิ' : Math.round(sec / 60) + ' นาที';
    const text = !every ? 'ปิดอัปเดตอัตโนมัติ' : document.hidden ? 'หยุดชั่วคราว' : sec < 10 ? 'อัปเดตสด' : `อัปเดตสด · ${ago}`;
    document.querySelectorAll('[data-live]').forEach(el => {
        el.classList.toggle('is-paused', paused);
        el.querySelector('[data-live-text]').textContent = text;
        el.title = every ? `ตรวจสอบรายการใหม่ทุก ${LIVE_LABELS[every] || every + ' วินาที'}` : 'เปิดได้ที่ บัญชี › ตั้งค่า';
    });
}

// ---------- Settings ----------
function initSettings() {
    document.addEventListener('click', e => {
        if (e.target.closest('[data-settings]')) openSettings();
        if (e.target.closest('[data-action="logout-all"]')) logoutEverywhere();
    });
    document.addEventListener('prefchange', e => {
        const key = e.detail.key;
        if (!ST.me || $('appContainer').hidden) return;
        if (key === 'live' || key === null) startLive();
        if ((key === 'pageSize' || key === 'thumbs' || key === null) && VIEWS.records.loaded) { VIEWS.records.page = 1; VIEWS.records.load(); }
    });
}

function openSettings() {
    const signedIn = ST.me && !$('appContainer').hidden;
    const tabs = [['auto', 'อัตโนมัติ (หน้าแรกที่มีสิทธิ์)']].concat(
        [['overview', 'ภาพรวม'], ['records', 'รายงาน'], ['participants', 'ผู้ใช้สิทธิ์'], ['admin', 'ผู้ดูแลระบบ'], ['account', 'บัญชี']].filter(([t]) => !signedIn || tabAllowed(t)));
    const work = !signedIn ? [] : [
        { icon: 'home', tone: 'blue', label: 'หน้าแรกหลังเข้าสู่ระบบ', desc: 'หน้าที่เปิดทุกครั้งเมื่อเข้าเว็บนี้', control: { type: 'select', key: 'startTab', options: tabs } },
        can('records.view') && { icon: 'refresh', tone: 'green', label: 'อัปเดตรายการใหม่อัตโนมัติ', desc: 'ถี่ = เห็นรายงานใหม่เร็ว · ห่าง/ปิด = ประหยัดเน็ตและโควตาระบบ', control: { type: 'seg', key: 'live', options: [[20, '20 วิ'], [60, '1 นาที'], [300, '5 นาที'], [0, 'ปิด']] } },
        can('records.view') && { icon: 'list', tone: 'purple', label: 'จำนวนรายการต่อหน้า', desc: 'หน้ารายงาน · มากขึ้น = เลื่อนดูได้ยาว แต่โหลดนานขึ้น', control: { type: 'seg', key: 'pageSize', options: [['auto', 'อัตโนมัติ'], ['20', '20'], ['50', '50'], ['100', '100']] } },
        can('records.view') && { icon: 'image', tone: 'teal', label: 'แสดงรูปย่อในตาราง', desc: 'ปิดเพื่อให้หน้ารายงานโหลดเร็วขึ้น (ยังเปิดดูรูปเต็มได้)', control: { type: 'switch', key: 'thumbs' } }
    ].filter(Boolean);
    renderSettings($('settingsBody'), [{ title: 'แอป', rows: [installSettingsRow()] }, displaySettings()]);
    renderSettings($('settingsMore'), [{ title: 'การทำงาน', rows: work }]);
    showModal('settingsModal');
    $('notifyBody').innerHTML = '';
    if (signedIn) {
        NotifyUI.kind = 'staff';
        NotifyUI.call = api;
        NotifyUI.extra = () => ({});
        NotifyUI.mount($('notifyBody'));
    }
}

async function logoutEverywhere() {
    const ok = await showMessage({ title: 'ออกจากระบบทุกอุปกรณ์?', text: 'ทุกเครื่องที่เคยเข้าสู่ระบบด้วยบัญชีนี้ (รวมเครื่องนี้) จะต้องเข้าสู่ระบบใหม่ ใช้เมื่อลืมออกจากระบบในเครื่องอื่น หรือสงสัยว่ามีคนอื่นใช้บัญชี', tone: 'bad', okText: 'ออกจากทุกอุปกรณ์', cancelText: 'ยกเลิก' });
    if (!ok) return;
    showLoading(true, 'กำลังออกจากระบบทุกอุปกรณ์…');
    const r = await api('staff.logout', { everywhere: true });
    showLoading(false);
    if (!r.success) return toast(r.message || 'ทำรายการไม่สำเร็จ กรุณาลองใหม่');
    if (!r.everywhere) {
        // Apps Script รุ่นก่อนยังไม่รองรับ: แจ้งให้ผู้ดูแลอัปเดต แทนการบอกว่าสำเร็จ
        return showMessage({ title: 'ระบบหลังบ้านยังไม่รองรับ', text: 'กรุณาให้ผู้ดูแลอัปเดตไฟล์ Staff.gs ใน Apps Script ก่อน ระหว่างนี้ผู้ดูแลสามารถ "บังคับออกจากระบบ" บัญชีนี้ได้จากหน้าผู้ดูแลระบบ', tone: 'warn' });
    }
    try { window.google && google.accounts.id.disableAutoSelect(); } catch (e) {}
    endSession('ออกจากระบบทุกอุปกรณ์แล้ว');
}

// ---------- Account ----------
VIEWS.account = {
    init() {
        // รูปโปรไฟล์ของตัวเอง: บัญชี Google/LINE ที่ไม่ได้ตั้งรูปไว้ อัปโหลดเองได้ (ใช้แทนรูปจากผู้ให้บริการ)
        // กดที่รูป (หรือ "แก้ไขรูปโปรไฟล์") → แผ่นตัวเลือก: เลือกจากคลังภาพ · ถ่ายรูป · ลบรูปปัจจุบัน
        const open = () => { haptic(); $('accPhotoResetRow').hidden = !ST.me.customPicture; showModal('photoSheet'); };
        $('accAvaBtn').addEventListener('click', open);
        // การ์ดพับได้ (แพ็กเกจ / สิทธิ์): แตะหัวการ์ดเพื่อเปิด — เปิดอันหนึ่ง อันอื่นพับ
        const folds = [...document.querySelectorAll('#accountView .acc-fold')];
        const setFold = (card, on) => {
            const head = card.querySelector('.fold-head'), body = card.querySelector('.fold-body');
            head.setAttribute('aria-expanded', String(on)); body.hidden = !on; card.classList.toggle('is-open', on);
        };
        folds.forEach(card => {
            const head = card.querySelector('.fold-head');
            const flip = () => {
                haptic(); const on = head.getAttribute('aria-expanded') !== 'true';
                folds.forEach(c => setFold(c, c === card ? on : false));
                // เปิดแล้วเลื่อนให้หัวการ์ดอยู่บนสุด — อ่านรายการจากบนลงล่าง (การ์ดอื่นที่พับลงทำให้หน้ากระโดด)
                if (on) requestAnimationFrame(() => {
                    const bar = document.querySelector('.topbar'), bs = bar && getComputedStyle(bar);
                    const off = bar && bs.display !== 'none' && /sticky|fixed/.test(bs.position) ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
                    const top = card.getBoundingClientRect().top - off - 12;
                    if (Math.abs(top) > 4) window.scrollTo({ top: window.scrollY + top, behavior: document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
                });
            };
            head.addEventListener('click', e => { if (e.target.closest('a, button:not(.fold-head)')) return; flip(); });
            head.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
        });
        $('accAvaLink').addEventListener('click', open);
        const pick = async e => {
            const f = e.target.files[0]; e.target.value = ''; if (!f) return;
            $('photoSheet').close();
            let img; try { img = await shrinkImage(f, 512, false); } catch (err) { return showMessage({ title: 'ใช้รูปนี้ไม่ได้', text: err.message, tone: 'warn' }); }
            this.savePhoto({ photo: { data: img.data, mimeType: img.mimeType } }, 'เปลี่ยนรูปโปรไฟล์แล้ว');
        };
        $('accPhoto').addEventListener('change', pick);
        $('accPhotoCam').addEventListener('change', pick);
        $('accPhotoReset').addEventListener('click', () => { $('photoSheet').close(); this.savePhoto({ remove: true }, 'ลบรูปแล้ว · ใช้รูปจากบัญชี Google/LINE'); });
    },
    async savePhoto(args, msg) {
        showLoading(true, 'กำลังบันทึกรูป…');
        const r = await api('staff.profile.photo', args);
        showLoading(false);
        if (!r.success) return showMessage({ title: 'บันทึกรูปไม่สำเร็จ', text: r.message || (r.code === 'INVALID' ? '' : 'ต้องอัปเดตไฟล์ Staff.gs / Auth.gs / Schema.gs ใน Apps Script ก่อน'), tone: 'bad' });
        ST.me = Object.assign({}, ST.me, { picture: r.staff.picture, customPicture: r.staff.customPicture });
        renderMeAvatars(); this.show(); toast(msg);
    },
    show() {
        const me = ST.me;
        $('accPhotoResetRow').hidden = !me.customPicture;
        document.querySelectorAll('[data-me="roleChip"]').forEach(el => {
            el.textContent = ROLE_LABELS[me.role] || me.role;
            el.className = 'chip ' + (me.role === 'admin' ? 'chip-self' : '');
        });
        let exp = '-';
        try { exp = thDateTime(JSON.parse(atob(ST.token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).exp); } catch (e) {}
        $('accKv').innerHTML = [
            ['บัญชี', (me.provider === 'line' ? 'LINE' : 'Google') + (me.email ? ' · ' + me.email : '')],
            ['สถานะ', STATUS_LABELS[me.status] || me.status],
            ['อนุมัติโดย', me.approvedBy || '-'],
            ['เข้าใช้ล่าสุด', me.lastLoginAt ? thDateTime(me.lastLoginAt) : '-'],
            ['จำการเข้าสู่ระบบถึง', exp + ' (ต่ออายุอัตโนมัติเมื่อเปิดใช้งาน)']
        ].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
        // สิทธิ์ที่มีก่อน แล้วตามด้วยที่ไม่มี (จาง) — แต่ละข้อมีคำอธิบายว่าทำอะไรได้ · Dev แสดงเฉพาะบัญชี Dev
        const perms = Object.keys(PERM_LABELS).filter(p => p !== 'dev' || can('dev'));
        $('accPerms').innerHTML = perms.filter(can).concat(perms.filter(p => !can(p))).map(p =>
            `<li class="${can(p) ? '' : 'is-off'}">${icon(can(p) ? 'check-circle' : 'x-circle')}<span class="perm-txt"><b>${PERM_LABELS[p]}</b>${PERM_DESC[p] ? `<small>${PERM_DESC[p]}</small>` : ''}</span></li>`).join('');
        $('accPermCount').textContent = `${perms.filter(can).length}/${perms.length}`;
        $('accPermsNote').textContent = can('admin') ? 'ผู้ดูแลระบบได้ทุกสิทธิ์ขององค์กร' : 'ต้องการสิทธิ์เพิ่ม ติดต่อผู้ดูแลระบบขององค์กร';
        this.billing();
    },

    // ---------- แพ็กเกจและการชำระเงินขององค์กร (ผู้ดูแลระบบ / ผู้ดูแลการเงิน) ----------
    async billing() {
        const box = $('accBilling');
        const show = can('billing') && !!(ST.me && ST.me.org);
        box.hidden = !show;
        // ไม่มีการ์ดแพ็กเกจ: ย้ายปุ่มท้ายหน้าไปคอลัมน์ขวา (ใต้สิทธิ์) ให้สองคอลัมน์สูงใกล้กัน · มือถือเรียงตาม order เหมือนเดิม
        const place = withBill => { const cols = $('accountView').querySelectorAll('.acc-col'); if (cols.length === 2) cols[withBill ? 0 : 1].append($('accountView').querySelector('.acc-btns'), $('accountView').querySelector('.acc-o7')); };
        place(false); // การ์ดพับอยู่ → คอลัมน์ขวาสั้น: ปุ่มท้ายหน้าอยู่ขวาเสมอ
        if (!show) return;
        if (!this.bill) $('accBillBody').innerHTML = '<div class="skel" style="height:120px;border-radius:16px"></div>';
        const r = await api('staff.billing.info');
        if (!r.success) { $('accBillBody').innerHTML = emptyState(r.message || 'โหลดไม่สำเร็จ', 'wifi-off'); return; }
        this.bill = r;
        if (!r.org) { box.hidden = true; return; }
        const a = r.access || {}, st = SUB_STATE_TH[a.state] || a.state || '-';
        const tone = a.state === 'past_due' || a.ok === false ? 'is-bad' : a.warn ? 'is-warn' : a.state === 'trial' ? 'is-info' : 'is-ok';
        const meter = (label, n, max) => {
            const pct = max ? Math.min(100, Math.round(n / max * 100)) : 0, cls = !max ? '' : pct >= 100 ? 'is-bad' : pct >= 80 ? 'is-warn' : '';
            return `<div class="bill-meter ${cls}"><div class="bill-meter-top"><small>${label}</small><b>${fmtNum(n)}<span>${max ? ' / ' + fmtNum(max) : ' · ไม่จำกัด'}</span></b></div>${max ? `<span class="bill-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${label} ${pct}%"><i style="width:${pct}%"></i></span>` : ''}</div>`;
        };
        const price = r.plan ? (r.org.cycle === 'yearly' ? `${thb(r.plan.priceYearly)} <small>/ ปี</small>` : `${thb(r.plan.priceMonthly)} <small>/ เดือน</small>`) : '';
        const INV = { pending: ['รอชำระ', 'is-warn'], paid: ['ชำระแล้ว', 'is-ok'] };
        const inv = (r.invoices || []).map(i => {
            const [t, c] = INV[i.status] || [i.status, ''], late = i.status === 'pending' && i.due && i.due < Date.now();
            return `<li class="bill-row"><span class="bill-row-main"><b class="mono">${esc(i.id)}</b><small>${i.periodStart ? thDate(i.periodStart) : ''}${i.periodEnd ? ' – ' + thDate(i.periodEnd) : ''}</small><small>${i.status === 'paid' && i.paidAt ? 'ชำระ ' + thDate(i.paidAt) : i.due ? 'ครบกำหนด ' + thDate(i.due) : ''}</small></span>
              <span class="bill-amt"><b>${thb(i.amount)}</b><span class="badge ${late ? 'is-bad' : c}">${late ? 'เลยกำหนด' : t}</span></span></li>`;
        }).join('');
        const acc = (r.accounts || []).map(x => `<li class="bill-row"><span class="icon-box">${icon(x.type === 'promptpay' ? 'phone' : 'database')}</span>
            <span class="bill-row-main"><b>${esc(x.bank || (x.type === 'promptpay' ? 'พร้อมเพย์' : 'บัญชี'))}${x.isDefault ? ' <span class="badge is-info">หลัก</span>' : ''}</b><small><span class="mono">${esc(x.number)}</span></small><small>${esc(x.name)}${x.branch ? ' · สาขา' + esc(x.branch) : ''}${x.note ? ' · ' + esc(x.note) : ''}</small></span>
            <button type="button" class="icon-btn" data-copy="${esc(x.number)}" aria-label="คัดลอกเลข ${esc(x.number)}" title="คัดลอก">${icon('copy')}</button></li>`).join('');
        const until = a.endsAt ? `${a.state === 'trial' ? 'ทดลองใช้ถึง' : 'รอบบิลถึง'} ${thDate(a.endsAt)}${a.daysLeft != null ? ` · เหลือ ${fmtNum(Math.max(0, a.daysLeft))} วัน` : ''}` : '';
        const alert = a.ok === false || a.state === 'past_due' || (a.warn && a.state !== 'trial') ? `<p class="bill-alert ${tone}">${icon('alert', 'ic-16')}<span>${esc(a.message || '')}</span></p>` : '';
        $('accBillBody').innerHTML = `
          <div class="bill-plan">
            <div><small>แพลนปัจจุบัน</small><b class="bill-plan-name">${esc(r.plan ? r.plan.name : '-')}</b>${price ? `<span class="bill-price">${price}</span>` : ''}</div>
            <span class="badge bill-state ${tone}">${esc(st)}</span>
          </div>
          ${until ? `<p class="bill-until ${a.warn ? 'is-warn' : ''}">${icon('calendar', 'ic-16')}<span>${until}</span></p>` : ''}
          ${alert}
          <div class="bill-meters">${meter('ผู้ใช้สิทธิ์', r.usage.users, r.limits.users)}${meter('เจ้าหน้าที่', r.usage.staff, r.limits.staff)}</div>`;
        const phone = r.salesPhone ? String(r.salesPhone).trim() : '', mail = r.salesEmail ? String(r.salesEmail).replace(/[,\s]+$/, '') : '';
        $('accBillMore').innerHTML = `
          <h4 class="bill-sub">ใบแจ้งหนี้</h4>
          ${inv ? `<ul class="bill-list">${inv}</ul>` : '<p class="bill-empty">ยังไม่มีใบแจ้งหนี้</p>'}
          ${acc ? `<h4 class="bill-sub">ช่องทางชำระเงิน</h4><ul class="bill-list">${acc}</ul>` : ''}
          ${acc && (phone || mail) ? `<div class="bill-contact"><p>${icon('info', 'ic-16')}<span>โอนแล้วส่งหลักฐานให้ผู้ให้บริการ</span></p>
            <div class="bill-contact-links">${phone ? `<a href="tel:${esc(phone.replace(/[^0-9+]/g, ''))}">${icon('phone', 'ic-16')}<span>${esc(phone)}</span></a>` : ''}${mail ? `<a href="mailto:${esc(mail)}">${icon('mail', 'ic-16')}<span>${esc(mail)}</span></a>` : ''}</div></div>` : ''}
          <a class="btn btn-tonal btn-sm bill-pkg" href="${PRODUCT_URL}#packages" target="_blank" rel="noopener">${icon('external', 'ic-16')} ดูแพ็กเกจทั้งหมด</a>`;
        $('accBillMore').querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy).then(() => toast('คัดลอกเลขบัญชีแล้ว')).catch(() => {}); }));
    }
};

// ---------- ดูภาพเต็มจอ: ซูมด้วยแตะสองครั้ง/ล้อเมาส์/สองนิ้ว · ลากเพื่อเลื่อน ----------
const PhotoViewer = (() => {
    let z = 1, x = 0, y = 0, ready = false;
    const MAX = 5;
    const el = () => $('photoViewer'), img = () => $('pvImg'), stage = () => $('pvStage');
    function apply(anim) {
        const i = img();
        i.style.transition = anim ? 'transform .22s ease' : 'none';
        i.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
        $('pvZoom').textContent = Math.round(z * 100) + '%';
        stage().classList.toggle('is-zoomed', z > 1.01);
    }
    function clamp() {
        const r = stage().getBoundingClientRect(), i = img();
        const w = i.offsetWidth * z, h = i.offsetHeight * z;
        const mx = Math.max(0, (w - r.width) / 2), my = Math.max(0, (h - r.height) / 2);
        x = Math.min(mx, Math.max(-mx, x)); y = Math.min(my, Math.max(-my, y));
    }
    // ซูมรอบจุด (cx, cy) ในพิกัดหน้าจอ
    function zoomAt(nz, cx, cy, anim) {
        nz = Math.min(MAX, Math.max(1, nz));
        const r = stage().getBoundingClientRect(), ox = cx - (r.left + r.width / 2), oy = cy - (r.top + r.height / 2);
        x = ox - (ox - x) * nz / z; y = oy - (oy - y) * nz / z; z = nz;
        if (z === 1) { x = 0; y = 0; }
        clamp(); apply(anim);
    }
    function init() {
        if (ready) return; ready = true;
        const st = stage(), d = el();
        d.addEventListener('click', e => { if (e.target.closest('[data-close]')) d.close(); });
        d.addEventListener('close', () => { img().removeAttribute('src'); });
        st.addEventListener('wheel', e => { e.preventDefault(); zoomAt(z * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY, false); }, { passive: false });
        let touchAt = 0;
        st.addEventListener('dblclick', e => { if (Date.now() - touchAt < 800) return; zoomAt(z > 1.01 ? 1 : 2.5, e.clientX, e.clientY, true); }); // นิ้วจัดการเองด้านล่าง
        // ลาก/สองนิ้ว ด้วย pointer events
        const pts = new Map(); let last = null, pinch = null, tap = 0;
        st.addEventListener('pointerdown', e => {
            st.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
            if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z }; }
            last = [e.clientX, e.clientY];
            if (e.pointerType === 'touch') touchAt = Date.now();
            if (e.pointerType === 'touch' && pts.size === 1) { const now = Date.now(); if (now - tap < 300) zoomAt(z > 1.01 ? 1 : 2.5, e.clientX, e.clientY, true); tap = now; }
        });
        st.addEventListener('pointermove', e => {
            if (!pts.has(e.pointerId)) return;
            pts.set(e.pointerId, [e.clientX, e.clientY]);
            if (pts.size === 2 && pinch) {
                const [a, b] = [...pts.values()];
                zoomAt(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, false);
            } else if (z > 1 && last) {
                x += e.clientX - last[0]; y += e.clientY - last[1]; clamp(); apply(false);
            }
            last = [e.clientX, e.clientY];
        });
        const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; last = pts.size ? [...pts.values()][0] : null; };
        st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
        window.addEventListener('resize', () => { if (d.open) { clamp(); apply(false); } });
    }
    // src = รูปที่โหลดแล้ว (แสดงทันที) · hi = ลิงก์ Drive (ขอความละเอียดสูงกว่าถ้ามี)
    function open(src, title, hi, onDownload) {
        init();
        z = 1; x = 0; y = 0; apply(false);
        const i = img();
        i.src = src; i.alt = 'ภาพหลักฐาน ' + (title || '');
        if (hi && /[?&]sz=w\d+/.test(hi)) { const big = new Image(); big.referrerPolicy = 'no-referrer'; big.onload = () => { if (el().open && i.src === src) i.src = big.src; }; big.src = hi.replace(/([?&]sz=)w\d+/, '$1w2400'); }
        $('pvTitle').textContent = title || '';
        $('pvDownload').hidden = !onDownload;
        $('pvDownload').onclick = onDownload || null;
        if (!el().open) el().showModal();
    }
    return { open };
})();

// ---------- แถบเมนูด้านข้าง: ย่อเป็นแถบไอคอน / ขยาย (จอ ≥ 768px) ----------
// ค่าเริ่มต้น = ย่อ (แถบไอคอน กดเปลี่ยนหน้าได้ทันที) · ปุ่มบนสุดของแถบ / Ctrl(⌘)+B = ขยาย/ย่อ
// คอมพิวเตอร์ (≥ 1100): จำสถานะไว้ (ขยาย = ดันเนื้อหา) · แท็บเล็ต: ขยายแบบลอยทับชั่วคราว แตะนอกแถบ/เลือกเมนู = ย่อ
const SideNav = (() => {
    const root = document.documentElement;
    const wide = () => window.matchMedia('(min-width: 1100px)').matches;
    const collapsed = () => root.dataset.side !== 'pinned' && !root.classList.contains('side-peek');
    const overlay = on => root.classList.toggle('side-peek', !!on && root.dataset.side !== 'pinned');
    function toggle() {
        haptic();
        if (root.classList.contains('side-peek')) { overlay(false); return sync(); }
        if (wide() || root.dataset.side === 'pinned') { Prefs.set('sidebar', root.dataset.side === 'pinned' ? 'hidden' : 'pinned'); return sync(); }
        overlay(true); sync(); // แท็บเล็ต: ขยายชั่วคราว
    }
    function sync() {
        const c = collapsed();
        document.querySelectorAll('.sidenav [data-side-toggle]').forEach(b => { const t = c ? 'ขยายแถบเมนู' : 'ย่อแถบเมนู'; b.setAttribute('aria-label', t); b.title = t + ' (Ctrl/⌘ + B)'; b.setAttribute('aria-expanded', String(!c)); });
        // แถบไอคอน: ชี้ไอคอนเพื่อดูชื่อเมนู
        document.querySelectorAll('.sidenav .nav-item').forEach(n => {
            const label = [...n.children].filter(x => x.tagName === 'SPAN' && !/nav-(bell-ic|ava-wrap|badge)/.test(x.className)).map(x => x.textContent.trim()).join(' ');
            if (c && label) n.title = label; else n.removeAttribute('title');
        });
    }
    function init() {
        const nav = $('sideNav');
        if (!nav) return;
        if (!nav.parentElement.querySelector('.side-scrim')) { const sc = document.createElement('div'); sc.className = 'side-scrim'; sc.addEventListener('click', () => { overlay(false); sync(); }); nav.after(sc); }
        document.querySelectorAll('[data-side-toggle]').forEach(b => b.addEventListener('click', toggle));
        nav.addEventListener('click', e => { if (e.target.closest('[data-tab], [data-goto]') && root.classList.contains('side-peek')) setTimeout(() => { overlay(false); sync(); }, 120); });
        document.addEventListener('keydown', e => {
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'b' || e.key === 'B') && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); toggle(); }
            if (e.key === 'Escape' && root.classList.contains('side-peek')) { overlay(false); sync(); }
        });
        window.addEventListener('resize', () => { if (wide() && root.classList.contains('side-peek')) { overlay(false); sync(); } });
        document.addEventListener('prefchange', sync);
        sync();
    }
    return { init, toggle, sync };
})();
document.addEventListener('DOMContentLoaded', () => SideNav.init());
