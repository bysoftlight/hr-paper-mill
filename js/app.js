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
const SELF_TYPE = 'ทำการขายด้วยตัวเอง';
const AGENT_TYPE = 'ทำการขายโดยตัวแทน';
const AGENT_LIMIT = 10;     // ข้อ 1.3: ให้ผู้อื่นขายแทนได้ไม่เกินเดือนละ 10 ครั้ง
let TODAY_RECORD = null;    // รายการที่ส่งแล้ววันนี้ (ระบบรับวันละ 1 ครั้ง)
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const DAYS_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const $ = (id) => document.getElementById(id);

// --- INIT ---
window.addEventListener('DOMContentLoaded', () => {
    initDialogs();
    initRules();
    initLogin();
    initForm();
    initHistory();
    initNav();
    document.querySelectorAll('[data-action="logout"]').forEach(btn => btn.addEventListener('click', logout));

    const savedId = store.get(USER_KEY);
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
    });
    $('loginForm').addEventListener('submit', (e) => { e.preventDefault(); manualLogin(); });
}

function setLoginError(message) {
    const hint = $('loginHint');
    $('loginId').setAttribute('aria-invalid', message ? 'true' : 'false');
    hint.classList.toggle('is-error', !!message);
    hint.setAttribute('role', message ? 'alert' : 'note');
    hint.innerHTML = message ? icon('alert', 'ic-16') : '';
    hint.append(message || 'ตัวอักษรภาษาอังกฤษหรือตัวเลข ระบบจะจำรหัสไว้ในเครื่องนี้');
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

function readCache(id) {
    try {
        const c = JSON.parse(store.get(CACHE_KEY) || 'null');
        return c && c.id === id && c.user && Array.isArray(c.history) ? c : null;
    } catch (e) { return null; }
}

function writeCache() {
    if (!CURRENT_USER.id || !HISTORY_LOADED) return;
    store.set(CACHE_KEY, JSON.stringify({ id: CURRENT_USER.id, user: CURRENT_USER, history: ALL_HISTORY, at: Date.now() }));
}

// background = แสดงข้อมูลจากเครื่องอยู่แล้ว ตรวจสอบกับเซิร์ฟเวอร์เบื้องหลัง
async function performLogin(userId, isAuto, background = false) {
    if (background) $('histRefresh').disabled = true;
    else if (isAuto) showAppSkeleton();
    else setLoginBusy(true);
    const res = await callApi('login', { userId: userId, withHistory: true });
    if (!isAuto) setLoginBusy(false);

    if (res.success) {
        store.set(USER_KEY, res.data.id);
        CURRENT_USER = res.data;
        if (!background) return setupApp(res.history);
        renderUser();
        if (Array.isArray(res.history)) applyHistory(res.history); else loadHistoryData(true);
    } else if (res.networkError && background) {
        // ออฟไลน์: ใช้ข้อมูลที่บันทึกไว้ในเครื่องต่อ
        $('histRefresh').disabled = false;
        $('histUpdated').textContent = 'เชื่อมต่อไม่ได้ · แสดงข้อมูลที่บันทึกไว้';
    } else if (res.networkError) {
        // เน็ตหลุด ไม่ใช่รหัสผิด: เก็บรหัสที่จำไว้ และให้ลองใหม่
        if (isAuto) {
            const retry = await showMessage({ title: 'เชื่อมต่อไม่ได้', text: res.message, tone: 'warn', okText: 'ลองอีกครั้ง', cancelText: 'ปิด' });
            if (retry) return performLogin(userId, true);
            backToLogin();
            $('loginId').value = userId;
            $('loginBtn').disabled = false;
        }
        setLoginError(res.message);
    } else {
        store.remove(USER_KEY);
        store.remove(CACHE_KEY);
        if (isAuto) backToLogin();
        $('loginId').value = isAuto ? '' : $('loginId').value;
        setLoginError(res.message || 'ไม่พบรหัสผู้ใช้สิทธิ์นี้ กรุณาตรวจสอบอีกครั้ง');
        if (isAuto) showRulesModal(true);
    }
}

async function logout() {
    const ok = await showMessage({
        title: 'ออกจากระบบ?', text: 'ครั้งต่อไปต้องกรอกรหัสผู้ใช้สิทธิ์ใหม่อีกครั้ง',
        tone: 'bad', okText: 'ออกจากระบบ', cancelText: 'ยกเลิก'
    });
    if (ok) {
        store.remove(USER_KEY);
        store.remove(CACHE_KEY);
        history.replaceState(null, '', location.pathname);
        location.reload();
    }
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
        img.src = CURRENT_USER.pic;
    }
}

const TABS = ['form', 'history', 'account'];
function tabFromHash() {
    const t = location.hash.replace('#', '');
    return TABS.includes(t) ? t : 'form';
}

function initNav() {
    document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    window.addEventListener('hashchange', () => { if (!$('appContainer').hidden) switchTab(tabFromHash(), false); });
}

function switchTab(tab, pushHash = true) {
    $('formView').hidden = tab !== 'form';
    $('historyView').hidden = tab !== 'history';
    $('accountView').hidden = tab !== 'account';
    document.querySelectorAll('[data-tab]').forEach(btn => {
        if (btn.dataset.tab === tab) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
    });
    if (pushHash && location.hash !== '#' + tab) history.pushState(null, '', '#' + tab);
    window.scrollTo({ top: 0 });
    if (tab === 'history' && !HISTORY_LOADED) loadHistoryData();
}

// --- FORM HANDLING ---
let COMPRESSED = null;     // { base64, bytes } ของรูปที่เลือกล่าสุด
let compressToken = 0;

function initForm() {
    $('salesForm').addEventListener('submit', handleFormSubmit);
    $('locRefresh').addEventListener('click', getLocation);
    $('evidenceImg').addEventListener('change', (e) => updateFileName(e.target));
    $('photoRemove').addEventListener('click', () => { $('evidenceImg').value = ''; updateFileName($('evidenceImg')); });
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
async function updateFileName(input) {
    const file = input.files && input.files[0];
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
    try {
        const result = await compressImage(file);
        if (token !== compressToken) return;
        COMPRESSED = result;
        $('fileNameDisplay').textContent = `${file.name} · ${formatBytes(file.size)} → ${formatBytes(result.bytes)} (ย่อขนาดแล้ว)`;
    } catch (e) {
        if (token !== compressToken) return;
        $('fileNameDisplay').textContent = `${file.name} · อ่านรูปไม่ได้ กรุณาเลือกรูปใหม่`;
    }
}

function formState() {
    return {
        location: !!$('lat').value,
        photo: $('evidenceImg').files.length > 0
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
    $('todayBanner').hidden = !TODAY_RECORD;
    if (TODAY_RECORD) $('todayTime').textContent = `${TODAY_RECORD.time} น.`;
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
        const file = $('evidenceImg').files[0];
        const image = COMPRESSED || await compressImage(file);
        const formData = {
            userName: CURRENT_USER.name, salesType: selectedSalesType,
            lat: $('lat').value, long: $('long').value,
            imageFile: { name: file.name, mimeType: "image/jpeg", data: image.base64 }
        };

        const res = await callApi('submit', { userId: CURRENT_USER.id, formData: formData });
        showLoading(false);

        if (res.success) {
            const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            await showMessage({ title: 'บันทึกรายงานแล้ว', text: `${res.message || 'บันทึกข้อมูลเรียบร้อย'} · ${selectedSalesType} · ${time} น.`, tone: 'ok', okText: 'ดูประวัติ' });
            $('salesForm').reset();
            await updateFileName($('evidenceImg'));
            getLocation();
            loadHistoryData(true);
            switchTab('history');
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
    const count = todays.length;
    TODAY_RECORD = todays[0] || null;
    updateChecklist();
    updateAgentMeter();
    document.querySelectorAll('[data-today]').forEach(chip => {
        chip.className = 'chip ' + (count ? 'is-ok' : 'is-warn');
        chip.innerHTML = count
            ? `${icon('check-circle')} ส่งแล้ววันนี้${count > 1 ? ` <span class="mono">${count}</span> ครั้ง` : ''}`
            : `${icon('alert')} ยังไม่ส่งวันนี้`;
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
    const max = Math.max(1, ...counts);
    $('sumBars').innerHTML = counts.map(c => `<span class="${c ? 'is-on' : ''}" style="height:${c ? Math.max(14, (c / max) * 100) : 8}%"></span>`).join('');
    $('sumAxis').innerHTML = axis.map(a => `<span>${a}</span>`).join('');
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
          <div class="hist-body" id="${id}" hidden></div>`;
        row.querySelector('.hist-when b').textContent = formatThaiDate(item.timestamp);
        row.querySelector('.hist-when .mono').textContent = `${item.time} น.`;
        const head = row.querySelector('.hist-head');
        const body = row.querySelector('.hist-body');
        head.addEventListener('click', () => {
            const open = head.getAttribute('aria-expanded') !== 'true';
            head.setAttribute('aria-expanded', String(open));
            body.hidden = !open;
            // สร้างเนื้อหาเมื่อเปิดครั้งแรกเท่านั้น
            if (open && !body.childElementCount) renderHistoryBody(body, item);
        });
        st.list.appendChild(row);
        st.shown++;
    });
    $('loadMoreBtn').hidden = st.shown >= FILTERED.length;
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
