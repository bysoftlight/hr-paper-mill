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
const ROLE_LABELS = { pending: 'รออนุมัติ', viewer: 'ผู้ดูข้อมูล', editor: 'ผู้แก้ไข', admin: 'ผู้ดูแลระบบ' };
const STATUS_LABELS = { pending: 'รออนุมัติ', active: 'ใช้งาน', suspended: 'ระงับ', rejected: 'ปฏิเสธ' };
const PERM_LABELS = {
    'records.view': 'ดูรายงานการส่ง', 'records.edit': 'เพิ่ม / แก้ไข / ลบรายงาน', 'participants.view': 'ดูข้อมูลผู้ใช้สิทธิ์',
    'participants.edit': 'เพิ่ม / แก้ไขผู้ใช้สิทธิ์', 'export': 'ส่งออกข้อมูล (Excel, PDF, Google Sheets)', 'admin': 'จัดการบัญชีเจ้าหน้าที่และดู Log'
};
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
    return res;
}

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', async () => {
    initDialogs();
    initShell();
    initSettings();
    Object.values(VIEWS).forEach(v => v.init && v.init());

    const params = new URLSearchParams(location.search);
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
    if (r.success) { keepToken(r.token); return enter(r.staff); }
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

function setupGoogle(config) {
    const slot = $('googleBtn');
    if (!config.googleClientId) {
        slot.innerHTML = '<button type="button" class="btn btn-outline" disabled>เข้าสู่ระบบด้วย Google (ยังไม่ได้ตั้งค่า)</button>';
        return;
    }
    loadScript('https://accounts.google.com/gsi/client').then(() => {
        google.accounts.id.initialize({ client_id: config.googleClientId, callback: handleGoogleCredential, ux_mode: 'popup', auto_select: false });
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
    enter(res.staff);
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
    Object.assign(ST, { token: null, me: null, perms: new Set(), participants: null, participantsReq: null, participantMeta: null, prefetch: null, lastSeen: 0, view: null });
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
function enter(me) {
    ST.me = me;
    ST.perms = new Set(me.permissions || []);
    $('authView').hidden = true;
    if (me.status !== 'active' || !ST.perms.size) return showPending(me);
    $('pendingView').hidden = true;
    showApp();
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
    const [title, text] = msgs[me.status] || msgs.pending;
    $('pendTitle').textContent = title;
    $('pendText').textContent = text;
    $('pendKv').innerHTML = `<div><dt>ชื่อ</dt><dd>${esc(me.name)}</dd></div><div><dt>บัญชี</dt><dd>${esc(me.provider === 'line' ? 'LINE' : 'Google')}${me.email ? ' · ' + esc(me.email) : ''}</dd></div><div><dt>สถานะ</dt><dd>${esc(STATUS_LABELS[me.status] || me.status)}</dd></div>`;
    clearInterval(pendingTimer);
    if (me.status === 'pending') pendingTimer = setInterval(refreshMe, 30000);
}

async function refreshMe() {
    const r = await api('staff.me');
    if (!r.success) return;
    keepToken(r.token);
    const wasActive = ST.me && ST.me.status === 'active' && ST.perms.size;
    const permsChanged = (r.staff.permissions || []).join() !== Array.from(ST.perms).join();
    if (r.staff.status === 'active' && r.staff.permissions.length) clearInterval(pendingTimer);
    if (!wasActive || permsChanged || r.staff.status !== 'active') enter(r.staff);
}

function showApp() {
    const app = $('appContainer');
    app.hidden = false;
    app.classList.remove('is-booting');
    applyPerms();
    document.querySelectorAll('[data-me="name"]').forEach(el => { el.textContent = ST.me.name; });
    document.querySelectorAll('[data-me="role"]').forEach(el => { el.textContent = ROLE_LABELS[ST.me.role] || ST.me.role; });
    document.querySelectorAll('[data-me="avatar"]').forEach(el => {
        const html = avatarHtml(ST.me.name, ST.me.picture, el.className.replace('avatar', '').trim());
        el.innerHTML = html.replace(/^<div[^>]*>|<\/div>$/g, '');
    });
    if (!ST.lastSeen) ST.lastSeen = Date.now();
    ST.lastSync = Date.now();
    switchTab(tabFromHash(), false);
    startLive();
}

function applyPerms() {
    document.querySelectorAll('[data-perm]').forEach(el => { el.hidden = !can(el.dataset.perm); });
    const n = document.querySelectorAll('.bottomnav .nav-item:not([hidden])').length;
    document.querySelector('.bottomnav').style.setProperty('--nav-n', n);
}

// ---------- Navigation ----------
const TAB_ORDER = ['overview', 'records', 'participants', 'admin', 'account'];
const TAB_PERM = { overview: 'records.view', records: 'records.view', participants: 'participants.view', admin: 'admin' };
function tabAllowed(t) { return !TAB_PERM[t] || can(TAB_PERM[t]); }
function tabFromHash() {
    const t = location.hash.replace('#', '').split('?')[0];
    if (TAB_ORDER.includes(t) && tabAllowed(t)) return t;
    const start = Prefs.get('startTab');
    if (TAB_ORDER.includes(start) && tabAllowed(start)) return start;
    return TAB_ORDER.find(tabAllowed);
}

function switchTab(tab, push = true) {
    if (!tabAllowed(tab)) tab = TAB_ORDER.find(tabAllowed);
    ST.view = tab;
    TAB_ORDER.forEach(t => { $(t + 'View').hidden = t !== tab; });
    document.querySelectorAll('[data-tab]').forEach(b => {
        if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (push && location.hash !== '#' + tab) setUrl('#' + tab, true);
    window.scrollTo({ top: 0 });
    if (VIEWS[tab] && VIEWS[tab].show) VIEWS[tab].show();
}

function initShell() {
    document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { haptic(); switchTab(b.dataset.tab); }));
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
    renderSettings($('settingsBody'), [displaySettings()]);
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
    show() {
        const me = ST.me;
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
        $('accPerms').innerHTML = Object.keys(PERM_LABELS).map(p =>
            `<li class="${can(p) ? '' : 'is-off'}">${icon(can(p) ? 'check-circle' : 'x-circle')}<span>${PERM_LABELS[p]}</span></li>`).join('');
    }
};
