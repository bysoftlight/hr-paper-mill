// js/app.js

let CURRENT_USER = {};
let ALL_HISTORY = [];
let HISTORY_LOADED = false;
let CURRENT_FILTER = 'week';
const DISPLAY_LIMIT = 10;
let SUBMITTING = false;
let FILTER_MONTH_IDX = new Date().getMonth();
let FILTER_YEAR_VAL = new Date().getFullYear();

const USER_KEY = 'SALES_APP_USER_ID';
const CACHE_KEY = 'SALES_APP_CACHE'; // ข้อมูลผู้ใช้ + ประวัติล่าสุด: เปิดแอปได้ทันทีแล้วค่อยอัปเดตเบื้องหลัง
// ตั้งค่า "จดจำการเข้าสู่ระบบ": ปิด = เก็บไว้เฉพาะแท็บนี้ (sessionStorage) ปิดเบราว์เซอร์แล้วต้องเข้าใหม่
const tabStore = {
    get(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } },
    set(key, val) { try { sessionStorage.setItem(key, val); } catch (e) {} },
    remove(key) { try { sessionStorage.removeItem(key); } catch (e) {} }
};
const userStore = {
    get(key) { return store.get(key) || tabStore.get(key); },
    set(key, val) {
        if (Prefs.get('remember')) { store.set(key, val); tabStore.remove(key); }
        else { tabStore.set(key, val); store.remove(key); }
    },
    remove(key) { store.remove(key); tabStore.remove(key); }
};
const SELF_TYPE = 'ทำการขายด้วยตัวเอง';
const AGENT_TYPE = 'ทำการขายโดยตัวแทน';
const AGENT_LIMIT = 10;     // ข้อ 1.3: ให้ผู้อื่นขายแทนได้ไม่เกินเดือนละ 10 ครั้ง
let TODAY_RECORD = null;    // รายการที่ส่งแล้ววันนี้ (ระบบรับวันละ 1 ครั้ง)
let SESSION = 0;            // เพิ่มทุกครั้งที่ออกจากระบบ: ผลของคำขอที่ค้างจาก session เก่าจะถูกทิ้ง
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const DAYS_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const $ = (id) => document.getElementById(id);

// --- INIT ---
ErrorLog.identify = () => ({ who: CURRENT_USER.id || '', whoName: CURRENT_USER.name || '', role: 'participant' });

window.addEventListener('DOMContentLoaded', () => {
    initDialogs();
    initRules();
    initLogin();
    initForm();
    initHistory();
    initNav();
    document.querySelectorAll('[data-action="logout"]').forEach(btn => btn.addEventListener('click', logout));
    initSettings();

    const savedId = userStore.get(USER_KEY);
    if (savedId && savedId !== "null" && savedId !== "undefined") {
        const cached = readCache(savedId);
        if (cached) {
            CURRENT_USER = cached.user;
            setupApp(cached.history, cached.at);
            performLogin(savedId, true, true);
        } else {
            performLogin(savedId, true);
        }
    } else {
        showRulesModal(true);
    }

    // ออกจากระบบจากอีกแท็บ หรือกลับมาหน้านี้ด้วยปุ่มย้อนกลับหลังออกจากระบบ → กลับหน้าเข้าสู่ระบบ
    window.addEventListener('storage', (e) => {
        if ((e.key === USER_KEY || e.key === null) && !userStore.get(USER_KEY) && CURRENT_USER.id) endSession();
    });
    window.addEventListener('pageshow', (e) => {
        if (e.persisted && !userStore.get(USER_KEY) && !$('appContainer').hidden) endSession();
    });
});

// Clock
function tickClock() {
    const now = new Date();
    $('currentTime').textContent = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    $('currentDate').textContent = now.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
tickClock();
setInterval(tickClock, 1000);

// --- RULES ---
function initRules() {
    const tpl = $('rulesTemplate');
    document.querySelectorAll('[data-rules]').forEach(el => el.appendChild(tpl.content.cloneNode(true)));

    const dlg = $('rulesModal');
    $('rulesAck').addEventListener('change', (e) => { $('rulesAccept').disabled = !e.target.checked; });
    $('rulesAccept').addEventListener('click', () => { delete dlg.dataset.locked; dlg.close(); $('loginId').focus(); });
    // ห้ามกด Esc ปิด ตอนที่ต้องยืนยันการรับทราบ
    dlg.addEventListener('cancel', (e) => { if (dlg.dataset.locked) e.preventDefault(); });
    // เบราว์เซอร์ยอมให้ยกเลิก cancel ได้ครั้งเดียว: ถ้ายังถูกปิดโดยไม่ได้รับทราบ ให้เปิดกลับ
    dlg.addEventListener('close', () => { if (dlg.dataset.locked) showRulesModal(true); });
    // ปุ่มทั่วไปที่เปิดข้อปฏิบัติ: เปิดแบบอ่านอย่างเดียว
    document.querySelectorAll('[data-open="rulesModal"]').forEach(btn => {
        btn.removeAttribute('data-open');
        btn.addEventListener('click', () => showRulesModal(false));
    });
}

function showRulesModal(requireAck) {
    const dlg = $('rulesModal');
    if (requireAck) dlg.dataset.locked = '1'; else delete dlg.dataset.locked;
    $('rulesClose').hidden = requireAck;
    $('rulesFoot').hidden = !requireAck;
    $('rulesAck').checked = false;
    $('rulesAccept').disabled = true;
    showModal('rulesModal');
    dlg.querySelector('.sheet-body').scrollTop = 0;
    (requireAck ? $('rulesAck') : $('rulesClose')).focus();
}

// --- AUTHENTICATION ---
function initLogin() {
    const input = $('loginId');
    input.addEventListener('input', () => {
        const clean = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        if (clean !== input.value) input.value = clean;
        $('loginBtn').disabled = clean.length !== 6;
        setLoginError(null);
        syncOtp();
    });
    ['focus', 'blur', 'keyup', 'click', 'select'].forEach(ev => input.addEventListener(ev, syncOtp));
    syncOtp();
    $('loginForm').addEventListener('submit', (e) => { e.preventDefault(); manualLogin(); });
}

// ช่องรหัสแบบ 6 ช่อง (OTP): ช่องจริงคือ #loginId ที่โปร่งใสทับอยู่ — วาง/กรอกอัตโนมัติได้ตามปกติ
function syncOtp() {
    const input = $('loginId'), v = input.value, focused = document.activeElement === input;
    const cur = Math.min(v.length, 5);
    $('loginOtp').querySelectorAll('.otp-boxes span').forEach((box, i) => {
        box.textContent = v[i] || '';
        box.classList.toggle('is-filled', !!v[i]);
        box.classList.toggle('is-active', focused && i === cur && !input.readOnly);
    });
    $('loginOtp').classList.toggle('is-error', input.getAttribute('aria-invalid') === 'true');
}
function setLoginId(v) { $('loginId').value = v; syncOtp(); }

function setLoginError(message) {
    const hint = $('loginHint');
    $('loginId').setAttribute('aria-invalid', message ? 'true' : 'false');
    hint.classList.toggle('is-error', !!message);
    hint.setAttribute('role', message ? 'alert' : 'note');
    hint.innerHTML = message ? icon('alert', 'ic-16') : '';
    hint.append(message || 'ตัวอักษรภาษาอังกฤษหรือตัวเลข ระบบจะจำรหัสไว้ในเครื่องนี้');
    syncOtp();
}

function manualLogin() {
    const idInput = $('loginId').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(idInput)) { setLoginError('รหัสต้องมี 6 หลัก (A-Z หรือ 0-9)'); return; }
    performLogin(idInput, false);
}

// เข้าสู่ระบบอัตโนมัติ: แสดงโครงหน้าแอป (skeleton) ระหว่างรอข้อมูลผู้ใช้
function showAppSkeleton() {
    $('loginView').hidden = true;
    $('appContainer').hidden = false;
    $('appContainer').classList.add('is-booting');
    $('salesForm').inert = true;
    switchTab(tabFromHash(), false);
}

function backToLogin() {
    $('appContainer').hidden = true;
    $('appContainer').classList.remove('is-booting');
    $('loginView').hidden = false;
}

// ปุ่มเข้าสู่ระบบแบบกำลังทำงาน (ไม่บังทั้งหน้าจอ)
function setLoginBusy(busy) {
    const btn = $('loginBtn');
    btn.disabled = busy || $('loginId').value.length !== 6;
    btn.setAttribute('aria-busy', String(busy));
    btn.classList.toggle('is-busy', busy);
    $('loginId').readOnly = busy;
}

// ลืมรหัสที่จำไว้เฉพาะเมื่อบัญชีไม่มีแล้ว/ถูกปิดใช้งานจริง — ข้อผิดพลาดอื่นของระบบไม่ทำให้ต้องเข้าสู่ระบบใหม่
function isAccountGone(res) {
    if (res.success || res.networkError) return false;
    if (res.code) return res.code === 'NOT_FOUND' || res.code === 'INACTIVE';
    return /ไม่พบรหัสผู้ใช้สิทธิ์|ถูกปิดใช้งาน/.test(res.message || ''); // Apps Script รุ่นก่อนไม่มี code
}

function readCache(id) {
    try {
        const c = JSON.parse(userStore.get(CACHE_KEY) || 'null');
        return c && c.id === id && c.user && Array.isArray(c.history) ? c : null;
    } catch (e) { return null; }
}

function writeCache() {
    if (!CURRENT_USER.id || !HISTORY_LOADED) return;
    userStore.set(CACHE_KEY, JSON.stringify({ id: CURRENT_USER.id, user: CURRENT_USER, history: ALL_HISTORY, at: Date.now() }));
}

// background = แสดงข้อมูลจากเครื่องอยู่แล้ว ตรวจสอบกับเซิร์ฟเวอร์เบื้องหลัง
async function performLogin(userId, isAuto, background = false) {
    if (background) $('histRefresh').disabled = true;
    else if (isAuto) showAppSkeleton();
    else setLoginBusy(true);
    const session = SESSION;
    const res = await callApi('login', { userId: userId, withHistory: true });
    if (session !== SESSION) return; // ออกจากระบบไปแล้วระหว่างรอ
    if (!isAuto) setLoginBusy(false);

    if (res.success) {
        userStore.set(USER_KEY, res.data.id);
        CURRENT_USER = res.data;
        if (!isAuto) maybeOnboard();
        if (!background) return setupApp(res.history);
        renderUser();
        if (Array.isArray(res.history)) applyHistory(res.history); else loadHistoryData(true);
    } else if (!isAccountGone(res) && background) {
        // ออฟไลน์ / ระบบขัดข้องชั่วคราว: ใช้ข้อมูลที่บันทึกไว้ในเครื่องต่อ (ยังจำการเข้าสู่ระบบไว้)
        $('histRefresh').disabled = false;
        $('histUpdated').textContent = res.networkError ? 'เชื่อมต่อไม่ได้ · แสดงข้อมูลที่บันทึกไว้' : 'ระบบขัดข้องชั่วคราว · แสดงข้อมูลที่บันทึกไว้';
    } else if (!isAccountGone(res)) {
        // เน็ตหลุด/ระบบขัดข้อง ไม่ใช่รหัสผิด: บันทึกสาเหตุ (ส่งเมื่อเน็ตกลับมา) แล้วให้ลองใหม่
        reportClientError('login', (res.serverError ? 'ระบบหลังบ้านตอบผิดรูปแบบ: ' : res.networkError ? 'เชื่อมต่อไม่ได้: ' : '') + (res.message || 'เข้าสู่ระบบไม่สำเร็จ'), 'รหัส ' + userId + (isAuto ? ' (เข้าอัตโนมัติ)' : ''));
        if (isAuto) {
            const retry = await showMessage({ title: res.networkError ? 'เชื่อมต่อไม่ได้' : 'ระบบขัดข้องชั่วคราว', text: res.message || 'กรุณาลองใหม่อีกครั้ง', tone: 'warn', okText: 'ลองอีกครั้ง', cancelText: 'ปิด' });
            if (retry) return performLogin(userId, true);
            backToLogin();
            setLoginId(userId);
            $('loginBtn').disabled = false;
        }
        setLoginError(res.message);
    } else {
        userStore.remove(USER_KEY);
        userStore.remove(CACHE_KEY);
        if (isAuto) backToLogin();
        setLoginId(isAuto ? '' : $('loginId').value);
        setLoginError(res.message || 'ไม่พบรหัสผู้ใช้สิทธิ์นี้ กรุณาตรวจสอบอีกครั้ง');
        if (isAuto) showRulesModal(true);
    }
}

async function logout() {
    const ok = await showMessage({
        title: 'ออกจากระบบ?', text: 'ครั้งต่อไปต้องกรอกรหัสผู้ใช้สิทธิ์ใหม่อีกครั้ง',
        tone: 'bad', okText: 'ออกจากระบบ', cancelText: 'ยกเลิก'
    });
    if (ok) endSession();
}

// ออกจากระบบ: ล้างข้อมูลในเครื่องแล้วสลับไปหน้าเข้าสู่ระบบทันทีในหน้าเดิม
// (ไม่พึ่ง location.reload() อย่างเดียว เพราะบางเบราว์เซอร์/แอปบนหน้าจอหลักไม่โหลดหน้าใหม่ให้)
function endSession() {
    SESSION++;
    historySeq++;
    historyReq = null;
    userStore.remove(USER_KEY);
    userStore.remove(CACHE_KEY);
    CURRENT_USER = {};
    ALL_HISTORY = [];
    HISTORY_LOADED = false;
    TODAY_RECORD = null;
    // สลับไปหน้าเข้าสู่ระบบก่อนเสมอ แล้วจึงเก็บกวาด — ขั้นใดผิดพลาดในบางเบราว์เซอร์ (เช่น Safari แบบแอป) ก็ไม่ค้างหน้าเดิม
    backToLogin();
    runSteps([
        () => { setLoginId(''); $('loginId').readOnly = false; $('loginBtn').disabled = true; setLoginError(null); },
        () => IMAGE_CACHE.clear(),
        () => document.querySelectorAll('dialog[open]').forEach(d => { delete d.dataset.locked; d.close(); }),
        () => showLoading(false),
        () => $('salesForm').reset(),
        () => { PICKED_FILE = null; GPS_FIX = null; updateFileName().catch(() => {}); },
        () => { $('historyList').innerHTML = ''; },
        () => renderUser(),
        () => setUrl(location.pathname),
        () => window.scrollTo(0, 0),
        () => showRulesModal(true)
    ]);
}

// --- APP NAVIGATION & SETUP ---
// history: ประวัติที่ได้มาพร้อมการเข้าสู่ระบบ หรือจากเครื่อง (cachedAt) — ถ้าไม่มีจะโหลดแยก
function setupApp(history, cachedAt) {
    $('loginView').hidden = true;
    $('appContainer').hidden = false;
    $('appContainer').classList.remove('is-booting');
    $('salesForm').inert = false;

    renderUser();
    getLocation();
    // ใส่ประวัติก่อนเปิดแท็บ ไม่ให้แท็บประวัติขอข้อมูลซ้ำ
    if (Array.isArray(history)) applyHistory(history, cachedAt);
    switchTab(tabFromHash(), false);
    if (!Array.isArray(history)) loadHistoryData();
    refreshOutbox().then(() => { if (navigator.onLine) flushOutbox(); });
}

function renderUser() {
    document.querySelectorAll('[data-user="name"]').forEach(el => el.textContent = CURRENT_USER.name || '-');
    document.querySelectorAll('[data-user="id"]').forEach(el => el.textContent = CURRENT_USER.id || '-');
    document.querySelectorAll('[data-user="status"]').forEach(el => el.textContent = CURRENT_USER.status || '-');
    document.querySelectorAll('[data-user="avatar"]').forEach(renderAvatar);
}

function renderAvatar(el) {
    const initial = (CURRENT_USER.name || '?').trim().charAt(0);
    el.textContent = initial;
    if (CURRENT_USER.pic) {
        const img = document.createElement('img');
        img.alt = '';
        img.onload = () => { el.textContent = ''; el.appendChild(img); };
        // รูปใน Drive ที่ไม่ได้แชร์สาธารณะ: ขอรูปย่อผ่าน API แทน
        img.onerror = () => {
            img.onerror = null;
            const m = String(CURRENT_USER.pic).match(/[?&]id=([\w-]{20,})/);
            if (m) callApi('image', { userId: CURRENT_USER.id, fileId: m[1], thumb: true }).then(r => { if (r.success && r.dataUrl) img.src = r.dataUrl; });
        };
        img.src = String(CURRENT_USER.pic).replace(/([?&]sz=)w\d+/, '$1w240');
    }
}

const TABS = ['form', 'history', 'account'];
function tabFromHash() {
    const t = location.hash.replace('#', '');
    return TABS.includes(t) ? t : 'form';
}

function initNav() {
    document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => { haptic(); switchTab(btn.dataset.tab); }));
    window.addEventListener('hashchange', () => { if (!$('appContainer').hidden) switchTab(tabFromHash(), false); });
}

function switchTab(tab, pushHash = true) {
    $('formView').hidden = tab !== 'form';
    $('historyView').hidden = tab !== 'history';
    $('accountView').hidden = tab !== 'account';
    document.querySelectorAll('[data-tab]').forEach(btn => {
        if (btn.dataset.tab === tab) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
    });
    if (pushHash && location.hash !== '#' + tab) setUrl('#' + tab, true);
    window.scrollTo({ top: 0 });
    if (tab === 'history' && !HISTORY_LOADED) loadHistoryData();
}

// --- FORM HANDLING ---
let COMPRESSED = null;     // { base64, bytes, hash, stamped } ของรูปที่เลือกล่าสุด
let PICKED_FILE = null;    // รูปจากกล้องในแอป (ถ้าไม่ได้เลือกผ่านช่องไฟล์)
let CAPTURE_AT = 0;        // เวลาที่ถ่าย/เลือกรูป (ใช้ประทับบนรูปและเป็นเวลารายงานเมื่อส่งย้อนหลังตอนออฟไลน์)
let GPS_FIX = null;        // { lat, lng, acc } ล่าสุด
const photoFile = () => PICKED_FILE || ($('evidenceImg').files && $('evidenceImg').files[0]) || null;
let compressToken = 0;

function initForm() {
    $('salesForm').addEventListener('submit', handleFormSubmit);
    $('locRefresh').addEventListener('click', getLocation);
    $('evidenceImg').addEventListener('change', () => { PICKED_FILE = null; CAPTURE_AT = Date.now(); updateFileName(); });
    $('photoRemove').addEventListener('click', () => { $('evidenceImg').value = ''; PICKED_FILE = null; updateFileName(); });
    // กล้องในแอป (มีกรอบนำถ่าย) — เบราว์เซอร์ที่ไม่รองรับใช้ช่องเลือกรูปเดิม
    // มีกล้องในแอป: ถ่าย ณ ขณะนั้นเท่านั้น (ไม่มีตัวเลือกรูปจากเครื่อง)
    // ไม่มี/เปิดกล้องไม่ได้: ใช้ช่องถ่ายภาพของเครื่อง (capture="environment" เปิดกล้องบนมือถือ)
    if (Camera.supported()) {
        $('cameraOpen').hidden = false;
        $('photoPick').hidden = true;
        $('photoEmpty').classList.add('has-camera');
    }
    $('cameraOpen').addEventListener('click', openCamera);
    $('photoRetake').addEventListener('click', () => (Camera.supported() ? openCamera() : $('evidenceImg').click()));
    initOutbox();
    initOnboarding();
    $('calPrev').addEventListener('click', () => shiftCalendar(-1));
    $('calNext').addEventListener('click', () => shiftCalendar(1));
    // แถบขั้นตอน: แตะเพื่อเลื่อนไปขั้นนั้นอย่างนุ่มนวล
    document.querySelectorAll('#stepper li').forEach(li => li.querySelector('button').addEventListener('click', () => scrollToStep(li.dataset.target)));
    // ทำขั้นตอนเสร็จ → เลื่อนไปขั้นถัดไปที่ยังไม่เสร็จ
    document.querySelectorAll('input[name="salesTypeRadio"]').forEach(r => r.addEventListener('change', () => advanceStep('stepType')));
    updateChecklist();
}

function setLocStatus(state, iconName, title, detail = '') {
    const box = $('locationStatus');
    box.className = `status-box is-${state}`;
    box.querySelector('.icon-box').innerHTML = icon(iconName);
    box.querySelector('b').textContent = title;
    box.querySelector('small').textContent = detail;
}

function getLocation() {
    $('lat').value = ''; $('long').value = '';
    $('locMap').hidden = true;
    $('locRefresh').disabled = true;
    setLocStatus('pending', 'pin', 'กำลังค้นหาพิกัด…', 'กรุณาอยู่ในที่โล่งเพื่อความแม่นยำ');
    updateChecklist();

    if (!navigator.geolocation) {
        setLocStatus('error', 'x-circle', 'เบราว์เซอร์นี้ไม่รองรับ GPS', 'กรุณาเปิดด้วย Chrome หรือ Safari บนมือถือ');
        $('locRefresh').disabled = false;
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            $('lat').value = latitude;
            $('long').value = longitude;
            const hadGps = !!GPS_FIX;
            GPS_FIX = { lat: latitude, lng: longitude, acc: accuracy };
            // ถ่ายรูปก่อนได้พิกัด: ประทับใหม่ให้มีพิกัด
            if (!hadGps && photoFile() && !(COMPRESSED && COMPRESSED.withGps)) updateFileName({ restamp: true });
            setLocStatus('ok', 'check-circle', 'ระบุตำแหน่งแล้ว', `${latitude.toFixed(5)}, ${longitude.toFixed(5)} · ±${Math.round(accuracy)} ม.`);
            $('locMap').href = `https://www.google.com/maps?q=${latitude},${longitude}`;
            $('locMap').hidden = false;
            $('locRefresh').disabled = false;
            $('stepLocation').classList.remove('is-error');
            updateChecklist();
        },
        (err) => {
            const denied = err && err.code === 1;
            setLocStatus('error', 'x-circle', denied ? 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง' : 'ยังไม่ได้รับพิกัด',
                denied ? 'เปิดสิทธิ์ตำแหน่งในการตั้งค่าเบราว์เซอร์ แล้วกด "ลองใหม่"' : 'กรุณาเปิด GPS แล้วกด "ลองใหม่"');
            $('locRefresh').disabled = false;
            updateChecklist();
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
}

let previewUrl = null;
async function updateFileName(opts = {}) {
    const file = photoFile();
    const token = ++compressToken;
    COMPRESSED = null;
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    $('photoEmpty').hidden = !!file;
    $('photoFilled').hidden = !file;
    updateChecklist();
    if (!file) { $('photoPreview').removeAttribute('src'); return; }

    previewUrl = URL.createObjectURL(file);
    $('photoPreview').src = previewUrl;
    $('stepPhoto').classList.remove('is-error');
    $('fileNameDisplay').textContent = `${file.name} · ${formatBytes(file.size)} · กำลังย่อขนาด…`;
    if (!opts.restamp) advanceStep('stepPhoto');
    try {
        const result = await compressImage(file, ...photoSize(), { stamp: stampLines(), hash: true });
        if (token !== compressToken) return;
        COMPRESSED = Object.assign(result, { withGps: !!GPS_FIX });
        // แสดงรูปที่ประทับวัน-เวลา-พิกัดแล้ว (รูปนี้คือรูปที่จะส่งจริง)
        $('photoPreview').src = 'data:image/jpeg;base64,' + result.base64;
        $('fileNameDisplay').textContent = `${file.name} · ${formatBytes(file.size)} → ${formatBytes(result.bytes)} · ประทับวัน-เวลา${GPS_FIX ? '-พิกัด' : ''}แล้ว`;
    } catch (e) {
        if (token !== compressToken) return;
        $('fileNameDisplay').textContent = `${file.name} · อ่านรูปไม่ได้ กรุณาเลือกรูปใหม่`;
    }
}

// ข้อความที่ประทับลงรูป
function stampLines() {
    const at = new Date(CAPTURE_AT || Date.now());
    const day = at.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const time = at.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return [
        `${CURRENT_USER.id || ''} · ${CURRENT_USER.name || ''}`,
        `${day} ${time} น.`,
        GPS_FIX ? `พิกัด ${GPS_FIX.lat.toFixed(5)}, ${GPS_FIX.lng.toFixed(5)} (±${Math.round(GPS_FIX.acc)} ม.)` : 'ยังไม่ได้รับพิกัด GPS',
        'HR Paper Mill · หลักฐานการขาย มาตรา 35'
    ];
}

async function openCamera() {
    haptic();
    const res = await Camera.open({
        profile: { name: CURRENT_USER.name, id: CURRENT_USER.id, pic: CURRENT_USER.pic },
        stampPreview: () => { const l = stampLines(); return [l[1].replace(/:\d\d น\.$/, ' น.'), GPS_FIX ? `±${Math.round(GPS_FIX.acc)} ม.` : 'รอพิกัด GPS']; }
    });
    if (res && res.error) { await showMessage({ title: 'เปิดกล้องไม่ได้', text: res.error, tone: 'warn' }); return $('evidenceImg').click(); }
    if (res instanceof File) {
        PICKED_FILE = res;
        CAPTURE_AT = Date.now();
        $('evidenceImg').value = '';
        updateFileName();
    }
}

function formState() {
    return {
        location: !!$('lat').value,
        photo: !!photoFile()
    };
}

function updateChecklist() {
    const s = formState();
    markStep('stepLocation', s.location);
    markStep('stepType', true);
    markStep('stepPhoto', s.photo);
    const items = [
        [s.location, 'ยืนยันตำแหน่ง GPS', 'ยังไม่ได้รับพิกัด'],
        [true, 'เลือกประเภทการขาย', ''],
        [s.photo, 'แนบภาพหลักฐาน', 'ยังไม่ได้ถ่ายภาพ']
    ];
    $('checklist').innerHTML = items.map(([ok, done, missing]) =>
        `<li class="${ok ? 'is-ok' : ''}">${icon(ok ? 'check-circle' : 'x-circle')}<span>${ok ? done : missing}</span></li>`).join('');
    $('submitBtn').classList.toggle('is-ready', s.location && s.photo && !TODAY_RECORD);
    updateStepper(s);
    $('todayBanner').hidden = !TODAY_RECORD;
    if (TODAY_RECORD) $('todayTime').textContent = `${TODAY_RECORD.time} น.`;
}

function queuedToday() {
    const today = new Date().toDateString();
    return OUTBOX_PENDING.some(x => new Date(x.formData.capturedAt || x.createdAt).toDateString() === today);
}

// แถบขั้นตอนด้านบน: บอกว่าเหลืออีกกี่ขั้นตอน
const STEP_ORDER = ['stepLocation', 'stepType', 'stepPhoto', 'submitCard'];
function stepsDone(s) {
    if (TODAY_RECORD || queuedToday()) return { stepLocation: true, stepType: true, stepPhoto: true, submitCard: true };
    return { stepLocation: s.location, stepType: true, stepPhoto: s.photo, submitCard: false };
}
function updateStepper(s) {
    const done = stepsDone(s);
    const current = STEP_ORDER.find(id => !done[id]);
    document.querySelectorAll('#stepper li').forEach(li => {
        const id = li.dataset.target;
        li.classList.toggle('is-done', !!done[id]);
        li.classList.toggle('is-current', id === current);
        li.querySelector('.st-dot').innerHTML = done[id] ? icon('check', 'ic-16') : String(STEP_ORDER.indexOf(id) + 1);
        li.querySelector('button').setAttribute('aria-current', id === current ? 'step' : 'false');
    });
    const left = STEP_ORDER.filter(id => !done[id]).length;
    // สถานะแยกเด่นใต้แถบขั้นตอน: ส่งแล้ว (เขียว) / รอส่ง (ฟ้า) / เหลือกี่ขั้น
    const state = TODAY_RECORD ? 'done' : queuedToday() ? 'queued' : 'todo';
    const note = $('stepperNote');
    note.className = 'stepper-note is-' + state;
    note.querySelector('use').setAttribute('href', state === 'done' ? '#i-check-circle' : state === 'queued' ? '#i-wifi-off' : '#i-info');
    note.querySelector('span').textContent = state === 'done' ? `ส่งรายงานของวันนี้แล้ว · เวลา ${TODAY_RECORD.time} น. — ส่งครั้งถัดไปได้พรุ่งนี้`
        : state === 'queued' ? 'รายงานวันนี้รอส่งอยู่ในเครื่อง — จะส่งเองเมื่อมีสัญญาณ'
        : left === 1 ? 'เหลือขั้นตอนสุดท้าย — กดบันทึกรายงาน' : `เหลืออีก ${left} ขั้นตอน`;
}
function scrollToStep(id) {
    const el = $(id);
    if (el) el.scrollIntoView({ behavior: Prefs.get('motion') ? 'auto' : 'smooth', block: 'start' });
}
function advanceStep(fromId) {
    const done = stepsDone(formState());
    const next = STEP_ORDER.slice(STEP_ORDER.indexOf(fromId) + 1).find(id => !done[id]);
    if (next) setTimeout(() => scrollToStep(next), 250);
}

// สถานะขั้นตอน: เลขขั้นตอนเป็นพื้นเขียวเมื่อเสร็จ + ข้อความสำหรับโปรแกรมอ่านหน้าจอ (ไม่สื่อด้วยสีอย่างเดียว)
function markStep(id, done) {
    const step = $(id);
    step.classList.toggle('is-done', done);
    const title = step.querySelector('.step-head h3');
    let sr = title.querySelector('.sr-only');
    if (!sr) { sr = document.createElement('span'); sr.className = 'sr-only'; title.appendChild(sr); }
    sr.textContent = done ? ' (เสร็จแล้ว)' : ' (ยังไม่เสร็จ)';
}

function flagStep(id) {
    const el = $(id);
    el.classList.add('is-error');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function handleFormSubmit(e) {
    e.preventDefault();
    if (SUBMITTING) return;
    if (queuedToday()) {
        await showMessage({ title: 'รายงานวันนี้รอส่งอยู่', text: 'รายงานของวันนี้เก็บไว้ในเครื่องแล้ว ระบบจะส่งให้เมื่อมีสัญญาณ กด "ส่งตอนนี้" ที่แถบสีเหลืองเพื่อลองส่งทันที', tone: 'warn' });
        return;
    }
    if (TODAY_RECORD) {
        await showMessage({ title: 'วันนี้ส่งรายงานแล้ว', text: `ส่งไปเมื่อเวลา ${TODAY_RECORD.time} น. ระบบรับรายงานวันละหนึ่งครั้ง ส่งครั้งถัดไปได้พรุ่งนี้`, tone: 'ok' });
        return;
    }
    const s = formState();
    if (!s.location) {
        flagStep('stepLocation');
        await showMessage({ title: 'ยังไม่ได้รับพิกัด', text: 'กรุณาเปิด GPS แล้วกด "ลองใหม่" ในขั้นตอนที่ 1', tone: 'warn' });
        if ($('locRefresh').disabled === false) getLocation();
        return;
    }
    if (!s.photo) {
        flagStep('stepPhoto');
        await showMessage({ title: 'ยังไม่ได้ถ่ายภาพหลักฐาน', text: 'ถ่ายภาพให้เห็นบัตรประจำร้านค้าผู้พิการ ล็อคที่ขาย และผู้ที่ขาย', tone: 'warn' });
        return;
    }
    const selectedSalesType = document.querySelector('input[name="salesTypeRadio"]:checked')?.value;

    SUBMITTING = true;
    $('submitBtn').disabled = true;
    showLoading(true, 'กำลังบันทึกข้อมูล…');
    try {
        const file = photoFile();
        const image = COMPRESSED || await compressImage(file, ...photoSize(), { stamp: stampLines(), hash: true });
        const formData = {
            userName: CURRENT_USER.name, salesType: selectedSalesType,
            lat: $('lat').value, long: $('long').value,
            accuracy: GPS_FIX ? Math.round(GPS_FIX.acc) : '',
            photoHash: image.hash || '',
            capturedAt: CAPTURE_AT || Date.now(),
            imageFile: { name: file.name, mimeType: "image/jpeg", data: image.base64 }
        };

        const session = SESSION;
        // ไม่มีสัญญาณ: เก็บไว้ในเครื่องแล้วส่งเองเมื่อเน็ตกลับมา
        const res = navigator.onLine === false ? { success: false, networkError: true } : await callApi('submit', { userId: CURRENT_USER.id, formData: formData });
        showLoading(false);
        if (session !== SESSION) return;

        if (res.success) {
            const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            await showMessage({ title: 'บันทึกรายงานแล้ว', text: `${res.message || 'บันทึกข้อมูลเรียบร้อย'} · ${selectedSalesType} · ${time} น.`, tone: 'ok', okText: 'ดูประวัติ' });
            resetReportForm();
            loadHistoryData(true);
            switchTab('history');
        } else if (res.networkError && !res.serverError) {
            await queueReport(formData);
        } else {
            showMessage({ title: 'บันทึกไม่สำเร็จ', text: res.message || 'กรุณาลองใหม่อีกครั้ง', tone: 'bad' });
        }
    } catch (error) {
        showLoading(false);
        showMessage({ title: 'เกิดข้อผิดพลาด', text: 'Client Error: ' + error.toString(), tone: 'bad' });
    } finally {
        SUBMITTING = false;
        $('submitBtn').disabled = false;
    }
}

function resetReportForm() {
    $('salesForm').reset();
    PICKED_FILE = null;
    CAPTURE_AT = 0;
    updateFileName();
    getLocation();
}

// ---------- ส่งได้แม้สัญญาณหลุด (คิวในเครื่อง) ----------
let OUTBOX_PENDING = [];
async function queueReport(formData) {
    try {
        await Outbox.put({ id: 'r' + Date.now(), userId: CURRENT_USER.id, userName: CURRENT_USER.name, createdAt: Date.now(), formData });
    } catch (e) {
        return showMessage({ title: 'เก็บรายงานไว้ในเครื่องไม่ได้', text: 'เบราว์เซอร์นี้ไม่อนุญาตให้เก็บข้อมูล กรุณาลองส่งใหม่เมื่อมีสัญญาณ', tone: 'bad' });
    }
    requestBackgroundSync();
    await refreshOutbox();
    await showMessage({ title: 'เก็บรายงานไว้ในเครื่องแล้ว', text: 'ตอนนี้ไม่มีสัญญาณ ระบบจะส่งให้อัตโนมัติเมื่อเน็ตกลับมา (ใช้วันและเวลาที่กดบันทึกจริง) ไม่ต้องกดส่งซ้ำ', tone: 'ok' });
    resetReportForm();
}

async function requestBackgroundSync() {
    try {
        const reg = await navigator.serviceWorker.ready;
        if (reg.sync) await reg.sync.register('hrpm-outbox');
    } catch (e) { /* Safari ไม่มี Background Sync: ส่งเมื่อเปิดแอป/เน็ตกลับมาแทน */ }
}

async function refreshOutbox() {
    try { OUTBOX_PENDING = (await Outbox.all()).filter(x => x.userId === CURRENT_USER.id); } catch (e) { OUTBOX_PENDING = []; }
    const n = OUTBOX_PENDING.length;
    $('outboxBanner').hidden = !n;
    if (n) {
        const first = OUTBOX_PENDING[0];
        const when = new Date(first.createdAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        $('outboxText').textContent = `${n} รายการ · บันทึกเมื่อ ${when} น.${first.lastError ? ' · ' + first.lastError : ''}`;
    }
    // รายงานที่รอส่งของวันนี้ นับว่าวันนี้ทำแล้ว (กันกดส่งซ้ำ)
    updateChecklist();
    renderTodayChip();
}

async function flushOutbox(manual) {
    if (!OUTBOX_PENDING.length && !manual) return;
    if (manual) { $('outboxSend').disabled = true; $('outboxSend').classList.add('is-busy'); }
    let results = [];
    try { results = await Outbox.flush(); } catch (e) {}
    if (manual) { $('outboxSend').disabled = false; $('outboxSend').classList.remove('is-busy'); }
    await handleOutboxResults(results.filter(r => r.sent).length, results.filter(r => r.rejected).map(r => r.res && r.res.message), manual && results.some(r => r.pending));
}

async function handleOutboxResults(sent, rejected, stillPending) {
    await refreshOutbox();
    if (sent) { toastUser(`ส่งรายงานที่ค้างไว้แล้ว ${sent} รายการ`); loadHistoryData(true); }
    if (rejected && rejected.length) showMessage({ title: 'ส่งรายงานที่ค้างไว้ไม่ได้', text: rejected[0] || 'กรุณาติดต่อเจ้าหน้าที่', tone: 'warn' });
    else if (stillPending) showMessage({ title: 'ยังส่งไม่ได้', text: 'ยังไม่มีสัญญาณอินเทอร์เน็ต ระบบจะลองส่งให้อีกครั้งอัตโนมัติ', tone: 'warn' });
}

function initOutbox() {
    $('outboxSend').addEventListener('click', () => flushOutbox(true));
    window.addEventListener('online', () => flushOutbox());
    document.addEventListener('visibilitychange', () => { if (!document.hidden && navigator.onLine) flushOutbox(); });
    // service worker ส่งให้ระหว่างปิดแอป แล้วแจ้งผลกลับมา
    if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', e => {
        if (e.data && e.data.type === 'outbox') handleOutboxResults(e.data.sent, e.data.rejected, false);
    });
    setInterval(() => { if (navigator.onLine && OUTBOX_PENDING.length) flushOutbox(); }, 60000);
}

function toastUser(text) {
    let t = $('userToast');
    if (!t) { t = document.createElement('div'); t.id = 'userToast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = text;
    t.classList.add('is-show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('is-show'), 3200);
}

// --- HISTORY HANDLING ---
let historyReq = null;
let historySeq = 0;
let FILTERED = [];
let LIST_STATE = { shown: 0, list: null };

function initHistory() {
    const tabs = [...document.querySelectorAll('[data-filter]')];
    tabs.forEach((btn, i) => {
        btn.addEventListener('click', () => changeFilter(btn.dataset.filter));
        // ลูกศรซ้าย/ขวาเลื่อนแท็บ (คีย์บอร์ดบนคอมพิวเตอร์)
        btn.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
            next.focus();
            changeFilter(next.dataset.filter);
        });
    });
    tabs.forEach(b => { b.tabIndex = b.getAttribute('aria-selected') === 'true' ? 0 : -1; });
    $('monthSelect').innerHTML = MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join('');
    $('monthSelect').value = FILTER_MONTH_IDX;
    $('monthSelect').addEventListener('change', (e) => { FILTER_MONTH_IDX = parseInt(e.target.value); renderFilteredHistory(); });
    $('yearSelect').addEventListener('change', (e) => { FILTER_YEAR_VAL = parseInt(e.target.value); renderFilteredHistory(); });
    $('loadMoreBtn').addEventListener('click', () => appendItems(DISPLAY_LIMIT));
    $('histRefresh').addEventListener('click', () => loadHistoryData(true));
    setHistoryLoading(true);
}

// รวมคำขอที่ซ้อนกันเป็นคำขอเดียว; force = โหลดใหม่แม้มีคำขอค้างอยู่ (ผลของคำขอเก่าจะถูกทิ้ง)
function setHistoryLoading(loading) {
    $('appContainer').classList.toggle('is-syncing', loading);
    document.querySelector('#historyView .summary').setAttribute('aria-busy', String(loading));
    $('historyList').setAttribute('aria-busy', String(loading));
    if (loading) {
        $('historyList').innerHTML = historySkeleton(6);
        $('sumBars').classList.add('bars');
        $('sumBars').innerHTML = [40, 70, 30, 85, 55, 65, 45].map(h => `<span class="skel" style="height:${h}%"></span>`).join('');
        $('sumAxis').innerHTML = '';
    }
}

// โครงรายการประวัติ: วันที่ + เวลา + ป้ายประเภท เหมือนแถวจริง
function historySkeleton(rows) {
    const row = (w) => `<div class="hist-row hist-skel"><span class="hist-when"><span class="skel skel-text" style="width:${w}%"></span><span class="skel skel-text skel-sm" style="width:22%"></span></span><span class="skel skel-chip"></span><span class="skel skel-icon"></span></div>`;
    return `<div class="hist-list" aria-hidden="true">${Array.from({ length: rows }, (_, i) => row([46, 38, 52, 42, 48, 36][i % 6])).join('')}</div><span class="sr-only" role="status">กำลังโหลดประวัติการส่งงาน</span>`;
}

// cachedAt: ข้อมูลจากเครื่อง (กำลังอัปเดตจากเซิร์ฟเวอร์) — ไม่ใช่ข้อมูลล่าสุด
function applyHistory(list, cachedAt) {
    ALL_HISTORY = list.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    HISTORY_LOADED = true;
    setHistoryLoading(false);
    $('histUpdated').textContent = cachedAt ? 'กำลังอัปเดต…'
        : 'อัปเดตล่าสุด ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    if (!cachedAt) { $('histRefresh').disabled = false; writeCache(); }
    updateTodayStatus();
    renderYearOptions();
    $('exportOpen').disabled = false;
    renderFilteredHistory();
}

function loadHistoryData(force = false) {
    if (!CURRENT_USER.id) return Promise.resolve();
    if (historyReq && !force) return historyReq;
    const seq = ++historySeq;
    if (!HISTORY_LOADED) setHistoryLoading(true);
    $('histUpdated').innerHTML = '<span class="skel skel-text" style="width:9em" aria-hidden="true"></span><span class="sr-only">กำลังโหลด</span>';
    $('histRefresh').disabled = true;

    historyReq = callApi('history', { userId: CURRENT_USER.id }).then(res => {
        if (seq !== historySeq) return;
        historyReq = null;
        $('histRefresh').disabled = false;
        if (res.success) {
            applyHistory(res.history || []);
        } else {
            $('histUpdated').textContent = res.message || 'โหลดข้อมูลไม่สำเร็จ';
            if (!HISTORY_LOADED) {
                setHistoryLoading(false);
                document.querySelectorAll('[data-today]').forEach(chip => { chip.className = 'chip'; chip.textContent = 'ไม่ทราบสถานะวันนี้'; });
            }
            if (!HISTORY_LOADED) $('historyList').innerHTML = `<div class="card empty">${icon('wifi-off')}โหลดประวัติไม่สำเร็จ กด "รีเฟรช" เพื่อลองใหม่</div>`;
        }
    });
    return historyReq;
}

function renderYearOptions() {
    const years = [...new Set(ALL_HISTORY.map(h => new Date(h.timestamp).getFullYear()).filter(y => !isNaN(y)))];
    if (!years.includes(new Date().getFullYear())) years.push(new Date().getFullYear());
    years.sort((a, b) => b - a);
    $('yearSelect').innerHTML = years.map(y => `<option value="${y}">พ.ศ. ${y + 543}</option>`).join('');
    $('yearSelect').value = FILTER_YEAR_VAL;
}

function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatThaiDate(ts) {
    return new Date(ts).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function updateTodayStatus() {
    const today = new Date();
    const todays = ALL_HISTORY.filter(h => sameDay(new Date(h.timestamp), today));
    TODAY_RECORD = todays[0] || null;
    updateChecklist();
    updateAgentMeter();
    renderTodayChip();
}

function renderTodayChip() {
    const count = TODAY_RECORD ? ALL_HISTORY.filter(h => new Date(h.timestamp).toDateString() === new Date().toDateString()).length : 0;
    const queued = !count && queuedToday();
    document.querySelectorAll('[data-today]').forEach(chip => {
        chip.className = 'chip ' + (count ? 'is-ok' : queued ? 'is-info' : 'is-warn');
        chip.innerHTML = count
            ? `${icon('check-circle')} ส่งแล้ววันนี้${count > 1 ? ` <span class="mono">${count}</span> ครั้ง` : ''}`
            : queued ? `${icon('wifi-off')} รอส่ง (ออฟไลน์)` : `${icon('alert')} ยังไม่ส่งวันนี้`;
    });
}

// มิเตอร์ "ขายโดยตัวแทน เดือนนี้" — สีตามเกณฑ์: < 50% accent, ≥ 50% warn, ≥ 80% bad
function updateAgentMeter() {
    const now = new Date();
    const used = ALL_HISTORY.filter(h => {
        const d = new Date(h.timestamp);
        return h.type === AGENT_TYPE && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const ratio = used / AGENT_LIMIT;
    const level = ratio >= 0.8 ? 'bad' : ratio >= 0.5 ? 'warn' : 'ok';
    document.querySelectorAll('[data-agent-used]').forEach(el => { el.textContent = used; });
    const meter = $('agentMeter');
    meter.dataset.level = level;
    meter.querySelector('.meter-bar').style.width = Math.min(100, ratio * 100) + '%';
    meter.querySelector('[role="meter"]').setAttribute('aria-valuenow', String(used));
    // ตัวนับโควตา: 10 ช่อง ใช้แล้ว = ติ๊ก, ที่เหลือ = วงว่าง
    $('agentDots').innerHTML = Array.from({ length: AGENT_LIMIT }, (_, i) => `<span class="${i < used ? 'is-used' : ''}">${i < used ? icon('check', 'ic-16') : i + 1}</span>`).join('');
    $('agentLeft').textContent = used >= AGENT_LIMIT ? 'ใช้ครบโควตาเดือนนี้แล้ว' : `เหลืออีก ${AGENT_LIMIT - used} ครั้งในเดือนนี้`;
    renderCalendar();
}

// ---------- ปฏิทินของฉัน: วันที่ส่ง (ขายเอง/ตัวแทน) / ขาด ----------
let CAL_MONTH = null; // Date วันที่ 1 ของเดือนที่แสดง
function renderCalendar() {
    const now = new Date();
    if (!CAL_MONTH) CAL_MONTH = new Date(now.getFullYear(), now.getMonth(), 1);
    const y = CAL_MONTH.getFullYear(), m = CAL_MONTH.getMonth();
    const byDay = {};
    ALL_HISTORY.forEach(h => { const d = new Date(h.timestamp); if (d.getFullYear() === y && d.getMonth() === m) (byDay[d.getDate()] = byDay[d.getDate()] || []).push(h); });
    // วันที่ "ขาด" นับตั้งแต่วันแรกที่เคยส่ง (ก่อนเริ่มใช้ระบบไม่นับ)
    const first = ALL_HISTORY.reduce((a, h) => Math.min(a, new Date(h.timestamp).getTime()), Infinity);
    const firstDay = isFinite(first) ? new Date(new Date(first).toDateString()) : null;
    const today = new Date(now.toDateString());
    const days = new Date(y, m + 1, 0).getDate(), lead = new Date(y, m, 1).getDay();
    let self = 0, agent = 0, missed = 0;
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<span class="cal-cell is-pad"></span>');
    for (let d = 1; d <= days; d++) {
        const date = new Date(y, m, d), list = byDay[d] || [];
        let cls = '', label = '';
        if (list.length) {
            const isAgent = list.some(h => h.type === AGENT_TYPE);
            cls = isAgent ? 'is-agent' : 'is-self'; label = isAgent ? 'ขายโดยตัวแทน' : 'ขายเอง';
            isAgent ? agent++ : self++;
        } else if (date < today && firstDay && date >= firstDay) { cls = 'is-missed'; label = 'ไม่ได้ส่ง'; missed++; }
        else if (date > today) cls = 'is-future';
        if (date.getTime() === today.getTime()) cls += ' is-today';
        cells.push(`<button type="button" class="cal-cell ${cls}" data-day="${d}" aria-label="${d} ${MONTHS[m]}${label ? ' · ' + label : ''}" ${cls.includes('is-future') ? 'disabled' : ''}>${d}</button>`);
    }
    $('calTitle').textContent = `${MONTHS[m]} ${y + 543}`;
    $('calGrid').innerHTML = DAYS_SHORT.map(x => `<span class="cal-dow">${x}</span>`).join('') + cells.join('');
    $('calStats').innerHTML = `<span><i class="lg lg-self"></i>ขายเอง <b>${self}</b></span><span><i class="lg lg-agent"></i>ตัวแทน <b>${agent}</b></span><span><i class="lg lg-missed"></i>ขาด <b>${missed}</b></span>`;
    $('calNext').disabled = y === now.getFullYear() && m === now.getMonth();
    $('calInfo').hidden = true;
    $('calGrid').querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => {
        $('calGrid').querySelectorAll('.is-picked').forEach(x => x.classList.remove('is-picked'));
        b.classList.add('is-picked');
        const d = Number(b.dataset.day), list = byDay[d] || [];
        const info = $('calInfo');
        info.hidden = false;
        const dateText = new Date(y, m, d).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });
        if (!list.length) { info.innerHTML = `<b>${dateText}</b><span>${b.classList.contains('is-missed') ? 'ไม่ได้ส่งรายงาน' : 'ยังไม่มีรายงาน'}</span>`; return; }
        const h = list[0];
        info.innerHTML = `<b>${dateText}</b><span>ส่งเวลา ${settingsEsc(h.time)} น. · ${h.type === AGENT_TYPE ? 'ขายโดยตัวแทน' : 'ขายด้วยตัวเอง'}</span>${h.image || h.fileId ? '<button type="button" class="btn-chip" id="calPhoto">ดูภาพหลักฐาน</button>' : ''}`;
        const ph = $('calPhoto');
        if (ph) ph.addEventListener('click', () => openPhotoViewer(h));
    }));
}
function shiftCalendar(delta) {
    CAL_MONTH = new Date(CAL_MONTH.getFullYear(), CAL_MONTH.getMonth() + delta, 1);
    renderCalendar();
}

function changeFilter(type) {
    CURRENT_FILTER = type;
    document.querySelectorAll('[data-filter]').forEach(btn => {
        const on = btn.dataset.filter === type;
        btn.setAttribute('aria-selected', String(on));
        btn.tabIndex = on ? 0 : -1;
    });
    renderFilteredHistory();
}

function startOfWeek(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
}

function renderFilteredHistory() {
    const weekStart = startOfWeek(new Date());
    FILTERED = ALL_HISTORY.filter(item => {
        const d = new Date(item.timestamp);
        if (CURRENT_FILTER === 'week') return d >= weekStart;
        if (CURRENT_FILTER === 'month') return d.getMonth() === FILTER_MONTH_IDX && d.getFullYear() === FILTER_YEAR_VAL;
        if (CURRENT_FILTER === 'year') return d.getFullYear() === FILTER_YEAR_VAL;
        return true;
    });
    updateDashboard(FILTERED, weekStart);
    renderList();
}

function updateDashboard(data, weekStart) {
    $('monthSelect').hidden = CURRENT_FILTER !== 'month';
    $('yearSelect').hidden = CURRENT_FILTER === 'week';

    // แท่งกราฟแสดงจำนวนรายการในแต่ละวัน/เดือน
    let buckets, axis, bucketOf, label;
    if (CURRENT_FILTER === 'week') {
        const end = new Date(weekStart); end.setDate(end.getDate() + 6);
        const fmt = (d) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
        label = `สัปดาห์นี้ · ${fmt(weekStart)} – ${fmt(end)}`;
        buckets = 7; axis = DAYS_SHORT; bucketOf = (d) => d.getDay();
    } else if (CURRENT_FILTER === 'month') {
        label = 'ยอดรายเดือน';
        buckets = new Date(FILTER_YEAR_VAL, FILTER_MONTH_IDX + 1, 0).getDate();
        axis = ['1', String(Math.ceil(buckets / 2)), String(buckets)]; bucketOf = (d) => d.getDate() - 1;
    } else {
        label = 'ยอดรวมทั้งปี';
        buckets = 12; axis = [MONTHS_SHORT[0], MONTHS_SHORT[5], MONTHS_SHORT[11]]; bucketOf = (d) => d.getMonth();
    }
    const counts = new Array(buckets).fill(0);
    data.forEach(item => { const i = bucketOf(new Date(item.timestamp)); if (i >= 0 && i < buckets) counts[i]++; });
    const agentCounts = new Array(buckets).fill(0);
    data.forEach(item => { if (item.type === AGENT_TYPE) { const i = bucketOf(new Date(item.timestamp)); if (i >= 0 && i < buckets) agentCounts[i]++; } });
    const labels = CURRENT_FILTER === 'week' ? DAYS_SHORT.slice() : CURRENT_FILTER === 'year' ? MONTHS_SHORT.slice() : counts.map((_, i) => String(i + 1));
    const now = new Date();
    const curIdx = CURRENT_FILTER === 'week' ? now.getDay() : CURRENT_FILTER === 'year' ? (FILTER_YEAR_VAL === now.getFullYear() ? now.getMonth() : null) : (FILTER_MONTH_IDX === now.getMonth() && FILTER_YEAR_VAL === now.getFullYear() ? now.getDate() - 1 : null);
    $('sumBars').classList.remove('bars');
    $('sumAxis').innerHTML = '';
    Charts.bars($('sumBars'), {
        labels, height: 130, active: curIdx,
        xLabels: CURRENT_FILTER === 'month' ? [0, Math.floor(buckets / 2) - 1, buckets - 1] : CURRENT_FILTER === 'year' ? [0, 3, 6, 9, 11] : undefined,
        series: [{ label: 'ขายเอง', values: counts.map((c, i) => c - agentCounts[i]), color: Charts.color('--accent') }, { label: 'โดยตัวแทน', values: agentCounts, color: Charts.color('--warn') }],
        ariaLabel: 'กราฟจำนวนรายงานในช่วงที่เลือก',
        tooltip: i => `<small>${CURRENT_FILTER === 'week' ? 'วัน' + ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'][i] : CURRENT_FILTER === 'year' ? MONTHS[i] : 'วันที่ ' + (i + 1)}</small><b>${counts[i]} รายการ</b>${agentCounts[i] ? `<small>โดยตัวแทน ${agentCounts[i]}</small>` : ''}`
    });
    $('sumLabel').textContent = label;
    $('sumCount').textContent = data.length;
    $('sumDays').textContent = new Set(data.map(h => new Date(h.timestamp).toDateString())).size;
    const self = data.filter(h => h.type === SELF_TYPE).length;
    $('sumSelf').textContent = self;
    $('sumAgent').textContent = data.length - self;
}

function renderList() {
    const container = $('historyList');
    container.textContent = '';
    LIST_STATE = { shown: 0, list: null };
    if (FILTERED.length === 0) {
        container.innerHTML = `<div class="card empty">${icon('inbox')}ไม่พบประวัติการส่งงานในช่วงนี้</div>`;
        $('loadMoreBtn').hidden = true;
        return;
    }
    LIST_STATE.list = document.createElement('div');
    LIST_STATE.list.className = 'hist-list';
    container.appendChild(LIST_STATE.list);
    appendItems(DISPLAY_LIMIT);
}

// เพิ่มรายการต่อท้ายโดยไม่สร้างรายการเดิมใหม่
function appendItems(count) {
    const st = LIST_STATE;
    FILTERED.slice(st.shown, st.shown + count).forEach(item => {
        const id = `hist-${st.shown}`;
        const row = document.createElement('div');
        row.className = 'hist-row';
        const isSelf = item.type === SELF_TYPE;
        row.innerHTML = `
          <button type="button" class="hist-head" aria-expanded="false" aria-controls="${id}">
            <span class="hist-when"><b></b><span class="mono"></span></span>
            <span class="chip ${isSelf ? 'chip-self' : 'chip-agent'}">${isSelf ? 'ขายเอง' : 'โดยตัวแทน'}</span>
            ${icon('chevron-down')}
          </button>
          <div class="hist-panel" id="${id}" inert><div class="hist-body"><div class="hist-inner"></div></div></div>`;
        row.querySelector('.hist-when b').textContent = formatThaiDate(item.timestamp);
        row.querySelector('.hist-when .mono').textContent = `${item.time} น.`;
        const head = row.querySelector('.hist-head');
        const body = row.querySelector('.hist-inner');
        head.addEventListener('click', () => {
            const open = head.getAttribute('aria-expanded') !== 'true';
            // เปิดได้ทีละรายการ: ปิดรายการอื่นที่เปิดค้างไว้
            if (open) st.list.querySelectorAll('.hist-head[aria-expanded="true"]').forEach(h => { if (h !== head) setHistOpen(h, false); });
            // สร้างเนื้อหาเมื่อเปิดครั้งแรกเท่านั้น
            if (open && !body.childElementCount) renderHistoryBody(body, item);
            setHistOpen(head, open);
            if (open) setTimeout(() => row.scrollIntoView({ block: 'nearest', behavior: Prefs.get('motion') ? 'auto' : 'smooth' }), 300);
        });
        st.list.appendChild(row);
        st.shown++;
    });
    $('loadMoreBtn').hidden = st.shown >= FILTERED.length;
}

function setHistOpen(head, open) {
    const panel = document.getElementById(head.getAttribute('aria-controls'));
    head.setAttribute('aria-expanded', String(open));
    panel.classList.toggle('is-open', open);
    panel.inert = !open;
}

// --- History row detail: photo (tap to enlarge) + location ---
function renderHistoryBody(body, item) {
    if (item.image || item.fileId) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'photo-btn';
        btn.setAttribute('aria-label', `ขยายภาพหลักฐาน ${formatThaiDate(item.timestamp)} ${item.time} น.`);
        btn.classList.add('is-loading');
        btn.setAttribute('aria-busy', 'true');
        btn.innerHTML = `<img alt="" referrerpolicy="no-referrer"><span class="photo-zoom">${icon('maximize', 'ic-16')} ขยายภาพ</span>`;
        const img = btn.querySelector('img');
        const done = () => { btn.classList.remove('is-loading'); btn.setAttribute('aria-busy', 'false'); };
        img.addEventListener('load', done);
        loadImageInto(img, item, () => { done(); btn.classList.add('is-failed'); });
        btn.addEventListener('click', () => openPhotoViewer(item));
        body.appendChild(btn);
    } else {
        body.innerHTML = `<div class="empty">${icon('image')}ไม่มีภาพหลักฐานสำหรับรายการนี้</div>`;
    }
    const meta = document.createElement('div');
    meta.className = 'hist-meta';
    meta.innerHTML = `<p></p>`;
    meta.querySelector('p').textContent = item.type;
    meta.appendChild(locationLink(item));
    body.appendChild(meta);
}

function mapUrlOf(item) {
    if (item.mapUrl) return item.mapUrl;
    if (item.lat != null && item.lng != null) return `https://maps.google.com/maps?q=${item.lat},${item.lng}`;
    return '';
}

// แถวตำแหน่ง: ไอคอน + พิกัด + URL (กดเปิด Google Maps)
function locationLink(item) {
    const url = mapUrlOf(item);
    const el = document.createElement(url ? 'a' : 'span');
    el.className = 'loc-link';
    if (url) { el.href = url; el.target = '_blank'; el.rel = 'noopener'; }
    el.innerHTML = `${icon('pin', 'ic-16')}<span><b class="mono"></b><small></small></span>`;
    el.querySelector('b').textContent = item.lat != null ? `${Number(item.lat).toFixed(5)}, ${Number(item.lng).toFixed(5)}` : 'ไม่มีข้อมูลตำแหน่ง';
    el.querySelector('small').textContent = url;
    return el;
}

// รูปจาก API (data URL) — เก็บแคชไว้ใช้ซ้ำตอนขยาย ดาวน์โหลด และทำ PDF
const IMAGE_CACHE = new Map();
function fetchImageData(item) {
    if (!item.fileId) return Promise.resolve(null);
    if (!IMAGE_CACHE.has(item.fileId)) {
        const req = callApi('image', { userId: CURRENT_USER.id, fileId: item.fileId })
            .then(res => (res.success && res.dataUrl) ? res.dataUrl : null);
        req.then(v => { if (!v) IMAGE_CACHE.delete(item.fileId); });
        IMAGE_CACHE.set(item.fileId, req);
    }
    return IMAGE_CACHE.get(item.fileId);
}

// แสดงรูป: ใช้ thumbnail ก่อน ถ้าโหลดไม่ได้ (รูปไม่ได้แชร์สาธารณะ) ให้ขอผ่าน API
function loadImageInto(img, item, onFail) {
    const fallback = () => {
        img.onerror = null;
        fetchImageData(item).then(url => { if (url) img.src = url; else if (onFail) onFail(); });
    };
    img.onerror = fallback;
    if (item.image) img.src = item.image; else fallback();
}

let VIEWER_ITEM = null;
function openPhotoViewer(item) {
    VIEWER_ITEM = item;
    const img = $('photoLarge');
    const stage = img.parentElement;
    img.removeAttribute('src');
    img.hidden = false;
    stage.classList.add('is-loading');
    stage.setAttribute('aria-busy', 'true');
    img.onload = () => { stage.classList.remove('is-loading'); stage.setAttribute('aria-busy', 'false'); };
    $('photoLargeEmpty').hidden = true;
    img.alt = `ภาพหลักฐาน ${formatThaiDate(item.timestamp)} ${item.time} น.`;
    $('photoTitle').textContent = formatThaiDate(item.timestamp);
    $('photoMeta').textContent = `${item.time} น. · ${item.type}`;
    const url = mapUrlOf(item);
    $('photoMap').hidden = !url;
    $('photoLoc').hidden = !url;
    if (url) {
        $('photoMap').href = url;
        $('photoLoc').replaceWith(Object.assign(locationLink(item), { id: 'photoLoc' }));
    }
    // แสดงรูปจาก Drive ทันที แล้วเปลี่ยนเป็นไฟล์จริงจาก API (คมกว่า) เมื่อโหลดเสร็จ
    loadImageInto(img, item, () => {
        if (VIEWER_ITEM !== item) return;
        stage.classList.remove('is-loading'); img.hidden = true; $('photoLargeEmpty').hidden = false;
    });
    fetchImageData(item).then(dataUrl => {
        if (VIEWER_ITEM !== item || !dataUrl) return;
        img.hidden = false; $('photoLargeEmpty').hidden = true;
        img.onerror = null;
        img.src = dataUrl;
    });
    showModal('photoModal');
}

async function downloadPhoto() {
    const item = VIEWER_ITEM;
    if (!item) return;
    const btn = $('photoDownload');
    btn.disabled = true;
    try {
        const dataUrl = await fetchImageData(item);
        const name = `${CURRENT_USER.id}_${new Date(item.timestamp).toISOString().slice(0, 10)}_${String(item.time).replace(':', '')}.jpg`;
        if (dataUrl) {
            const blob = await (await fetch(dataUrl)).blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        } else if (item.image) {
            // ดึงไฟล์ผ่าน API ไม่ได้: เปิดรูปในแท็บใหม่ให้บันทึกเอง
            window.open(item.image, '_blank', 'noopener');
        } else {
            showMessage({ title: 'ดาวน์โหลดไม่สำเร็จ', text: 'ไม่พบไฟล์รูปของรายการนี้', tone: 'bad' });
        }
    } finally {
        btn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    $('photoDownload').addEventListener('click', downloadPhoto);
});

// --- SETTINGS ---
const PHOTO_SIZES = { save: [800, 0.5], std: [1024, 0.6], hi: [1600, 0.72] };
function photoSize() { return PHOTO_SIZES[Prefs.get('photo')] || PHOTO_SIZES.std; }

function initSettings() {
    document.addEventListener('click', (e) => {
        if (e.target.closest('[data-settings]')) openSettings();
    });
    document.addEventListener('prefchange', (e) => {
        const key = e.detail.key;
        if (key === 'remember') {
            // ย้ายข้อมูลที่จำไว้ไปที่เก็บใหม่ทันที
            [USER_KEY, CACHE_KEY].forEach(k => { const v = userStore.get(k); if (v) userStore.set(k, v); });
        }
        if ($('settingsModal').open && (key === 'remember' || key === null)) renderParticipantSettings();
    });
}

function openSettings() {
    renderParticipantSettings();
    showModal('settingsModal');
    checkGeoPermission();
    // การแจ้งเตือนผูกกับรหัสผู้ใช้สิทธิ์: แสดงเมื่อเข้าสู่ระบบแล้ว
    $('notifyBody').innerHTML = '';
    if (CURRENT_USER.id) {
        NotifyUI.kind = 'user';
        NotifyUI.call = callApi;
        NotifyUI.extra = () => ({ userId: CURRENT_USER.id });
        NotifyUI.mount($('notifyBody'));
    }
}

function cacheInfo() {
    const raw = userStore.get(CACHE_KEY);
    if (!raw) return 'ยังไม่มีข้อมูลที่เก็บไว้';
    let n = 0;
    try { n = (JSON.parse(raw).history || []).length; } catch (e) {}
    return `ประวัติ ${n} รายการ · ${formatBytes(raw.length * 2)}`;
}

function renderParticipantSettings() {
    const signedIn = !!CURRENT_USER.id;
    renderSettings($('settingsBody'), [{ title: 'แอป', rows: [installSettingsRow()] }, displaySettings()]);
    const sections = [{
        title: 'การส่งรายงาน',
        rows: [
            { id: 'geo', icon: 'pin', tone: 'green', label: 'สิทธิ์ใช้ตำแหน่ง (GPS)', desc: 'ใช้ยืนยันตำแหน่งตอนส่งรายงาน', control: { type: 'info', html: '<span class="set-status" id="geoStatus">กำลังตรวจสอบ…</span><span id="geoHelp"></span><div class="row-actions"><button type="button" class="btn-chip" id="geoTest">ทดสอบตำแหน่ง</button></div>' } },
            { icon: 'image', tone: 'blue', label: 'คุณภาพรูปหลักฐาน', desc: 'ประหยัดเน็ต ส่งได้เร็ว · คมชัด เห็นรายละเอียดบัตรชัดขึ้นแต่ใช้เน็ตมากกว่า', control: { type: 'seg', key: 'photo', options: [['save', 'ประหยัดเน็ต'], ['std', 'มาตรฐาน'], ['hi', 'คมชัด']] } }
        ]
    }, {
        title: 'บัญชีและความเป็นส่วนตัว',
        rows: [
            { icon: 'lock', tone: 'indigo', label: 'จดจำการเข้าสู่ระบบ', desc: 'ปิดเมื่อใช้เครื่องร่วมกับผู้อื่น — ปิดเบราว์เซอร์แล้วต้องกรอกรหัสใหม่', control: { type: 'switch', key: 'remember' } }
        ].concat(signedIn ? [
            { id: 'clearCache', icon: 'database', tone: 'amber', label: 'ข้อมูลที่เก็บในเครื่อง', desc: settingsEsc(cacheInfo()) + ' · ช่วยให้เปิดแอปได้ทันที', control: { type: 'button', label: 'ล้างข้อมูล', tone: 'bad', onClick: clearLocalData } }
        ] : [])
    }];
    renderSettings($('settingsMore'), sections);
    $('geoTest').addEventListener('click', testGeo);
}

async function clearLocalData() {
    const ok = await showMessage({ title: 'ล้างข้อมูลในเครื่อง?', text: 'ลบประวัติที่เก็บไว้ในเครื่องนี้ (ข้อมูลในระบบไม่หาย) ครั้งหน้าจะโหลดใหม่จากระบบ', tone: 'warn', okText: 'ล้างข้อมูล', cancelText: 'ยกเลิก' });
    if (!ok) return;
    userStore.remove(CACHE_KEY);
    showModal('settingsModal');
    renderParticipantSettings();
    checkGeoPermission();
}

const GEO_HELP = 'iPhone: การตั้งค่า › ความเป็นส่วนตัว › บริการหาตำแหน่ง › Safari/Chrome › "ขณะใช้แอป" · Android: แตะรูปแม่กุญแจข้างที่อยู่เว็บ › สิทธิ์ › ตำแหน่ง › อนุญาต';
function setGeoStatus(tone, text, help) {
    const el = $('geoStatus');
    if (!el) return;
    el.className = 'set-status ' + (tone ? 'is-' + tone : '');
    el.innerHTML = icon(tone === 'ok' ? 'check-circle' : tone === 'bad' ? 'x-circle' : 'pin', 'ic-16') + settingsEsc(text);
    $('geoHelp').textContent = help || '';
}
async function checkGeoPermission() {
    if (!navigator.geolocation) return setGeoStatus('bad', 'เบราว์เซอร์นี้ไม่รองรับ GPS', 'กรุณาเปิดด้วย Chrome หรือ Safari');
    try {
        const st = await navigator.permissions.query({ name: 'geolocation' });
        const show = () => {
            if (st.state === 'granted') setGeoStatus('ok', 'อนุญาตแล้ว');
            else if (st.state === 'denied') setGeoStatus('bad', 'ถูกปิดอยู่ — ส่งรายงานไม่ได้', GEO_HELP);
            else setGeoStatus('warn', 'ยังไม่ได้อนุญาต', 'กด "ทดสอบตำแหน่ง" แล้วเลือก "อนุญาต"');
        };
        show();
        st.onchange = show;
    } catch (e) {
        setGeoStatus('', 'กด "ทดสอบตำแหน่ง" เพื่อตรวจสอบ'); // Safari รุ่นเก่าไม่มี permissions API
    }
}
function testGeo() {
    if (!navigator.geolocation) return;
    $('geoTest').disabled = true;
    setGeoStatus('warn', 'กำลังค้นหาพิกัด…');
    navigator.geolocation.getCurrentPosition(
        (pos) => { $('geoTest').disabled = false; setGeoStatus('ok', `ใช้งานได้ · แม่นยำ ±${Math.round(pos.coords.accuracy)} ม.`); },
        (err) => {
            $('geoTest').disabled = false;
            if (err && err.code === 1) setGeoStatus('bad', 'ถูกปิดอยู่ — ส่งรายงานไม่ได้', GEO_HELP);
            else setGeoStatus('warn', 'ยังหาพิกัดไม่ได้', 'เปิด GPS ของเครื่อง และอยู่ในที่โล่ง แล้วลองอีกครั้ง');
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
}

// ---------- แนะนำการใช้งานครั้งแรก (3 หน้าจอ เลื่อนแบบ snap) ----------
const ONBOARD_KEY = 'HRPM_ONBOARDED';
function initOnboarding() {
    const track = $('obTrack'), slides = track.children.length;
    const index = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    const go = i => track.scrollTo({ left: i * track.clientWidth, behavior: Prefs.get('motion') ? 'auto' : 'smooth' });
    const sync = () => {
        const i = index();
        $('obDots').querySelectorAll('span').forEach((d, k) => d.classList.toggle('is-on', k === i));
        $('obNext').textContent = i === slides - 1 ? 'เริ่มใช้งาน' : 'ถัดไป';
        $('obSkip').textContent = i === 0 ? 'ข้าม' : 'ย้อนกลับ';
    };
    track.addEventListener('scroll', () => { clearTimeout(track._t); track._t = setTimeout(sync, 60); }, { passive: true });
    $('obNext').addEventListener('click', () => { haptic(); const i = index(); if (i >= slides - 1) closeOnboarding(); else go(i + 1); });
    $('obSkip').addEventListener('click', () => { const i = index(); if (i === 0) closeOnboarding(); else go(i - 1); });
    $('onboardModal').addEventListener('keydown', e => { if (e.key === 'ArrowRight') go(Math.min(slides - 1, index() + 1)); if (e.key === 'ArrowLeft') go(Math.max(0, index() - 1)); });
    $('onboardModal').addEventListener('close', () => store.set(ONBOARD_KEY, '1'));
    document.addEventListener('click', e => { if (e.target.closest('[data-onboard]')) openOnboarding(); });
    sync();
}
function openOnboarding() {
    const dlg = $('onboardModal');
    if (dlg.open) return;
    dlg.showModal();
    $('obTrack').scrollLeft = 0;
    $('obTrack').dispatchEvent(new Event('scroll'));
    $('obNext').focus();
}
function closeOnboarding() { $('onboardModal').close(); }
function maybeOnboard() { if (!store.get(ONBOARD_KEY)) setTimeout(openOnboarding, 400); }
