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
const THEME_KEY = 'HRPM_THEME';
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const DAYS_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const $ = (id) => document.getElementById(id);

// --- INIT ---
window.addEventListener('DOMContentLoaded', () => {
    initDialogs();
    initRules();
    initTheme();
    initLogin();
    initForm();
    initHistory();
    initNav();
    $('logoutBtn').addEventListener('click', logout);

    const savedId = store.get(USER_KEY);
    if (savedId && savedId !== "null" && savedId !== "undefined") {
        performLogin(savedId, true);
    } else {
        showRulesModal(true);
        $('loginId').focus();
    }
});

// Clock
function tickClock() {
    const now = new Date();
    $('currentTime').textContent = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    $('currentDate').textContent = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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
    dlg.querySelector('.dlg-body').scrollTop = 0;
    (requireAck ? $('rulesAck') : $('rulesClose')).focus();
}

// --- THEME ---
function initTheme() {
    const apply = (opt) => {
        if (opt === 'light' || opt === 'dark') { document.documentElement.dataset.theme = opt; store.set(THEME_KEY, opt); }
        else { delete document.documentElement.dataset.theme; store.remove(THEME_KEY); opt = 'auto'; }
        document.querySelectorAll('[data-theme-opt]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeOpt === opt)));
    };
    apply(store.get(THEME_KEY) || 'auto');
    $('themeGroup').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-theme-opt]');
        if (btn) apply(btn.dataset.themeOpt);
    });
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
    hint.textContent = message || 'ตัวอักษรภาษาอังกฤษหรือตัวเลข ระบบจะจำรหัสไว้ในเครื่องนี้';
}

function manualLogin() {
    const idInput = $('loginId').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(idInput)) { setLoginError('รหัสต้องมี 6 หลัก (A-Z หรือ 0-9)'); return; }
    performLogin(idInput, false);
}

async function performLogin(userId, isAuto) {
    showLoading(true, isAuto ? 'กำลังเข้าสู่ระบบ...' : 'กำลังตรวจสอบรหัส...');
    const res = await callApi('login', { userId: userId });
    showLoading(false);

    if (res.success) {
        store.set(USER_KEY, res.data.id);
        CURRENT_USER = res.data;
        setupApp();
    } else if (res.networkError) {
        // เน็ตหลุด ไม่ใช่รหัสผิด: เก็บรหัสที่จำไว้ และให้ลองใหม่
        if (isAuto) {
            const retry = await showMessage({ title: 'เชื่อมต่อไม่ได้', text: res.message, tone: 'warning', okText: 'ลองอีกครั้ง', cancelText: 'ปิด' });
            if (retry) return performLogin(userId, true);
            $('loginId').value = userId;
            $('loginBtn').disabled = false;
        }
        setLoginError(res.message);
    } else {
        store.remove(USER_KEY);
        $('loginId').value = isAuto ? '' : $('loginId').value;
        setLoginError(res.message || 'ไม่พบรหัสผู้ใช้สิทธิ์นี้ กรุณาตรวจสอบอีกครั้ง');
        if (isAuto) showRulesModal(true);
    }
}

async function logout() {
    const ok = await showMessage({
        title: 'ออกจากระบบ?', text: 'ครั้งต่อไปต้องกรอกรหัสผู้ใช้สิทธิ์ใหม่อีกครั้ง',
        tone: 'danger', okText: 'ออกจากระบบ', cancelText: 'ยกเลิก'
    });
    if (ok) {
        store.remove(USER_KEY);
        location.hash = '';
        location.reload();
    }
}

// --- APP NAVIGATION & SETUP ---
function setupApp() {
    $('loginView').hidden = true;
    $('mainFooter').hidden = true;
    $('appContainer').hidden = false;

    document.querySelectorAll('[data-user="name"]').forEach(el => el.textContent = CURRENT_USER.name || '-');
    document.querySelectorAll('[data-user="id"]').forEach(el => el.textContent = CURRENT_USER.id || '-');
    document.querySelectorAll('[data-user="status"]').forEach(el => el.textContent = CURRENT_USER.status || '-');
    document.querySelectorAll('[data-user="avatar"]').forEach(renderAvatar);

    getLocation();
    switchTab(tabFromHash(), false);
    loadHistoryData();
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
function initForm() {
    $('salesForm').addEventListener('submit', handleFormSubmit);
    $('locRefresh').addEventListener('click', getLocation);
    $('evidenceImg').addEventListener('change', (e) => updateFileName(e.target));
    $('photoRemove').addEventListener('click', () => { $('evidenceImg').value = ''; updateFileName($('evidenceImg')); });
    updateChecklist();
}

function setLocStatus(tone, icon, title, detail = '') {
    const box = $('locationStatus');
    box.className = `loc-status is-${tone}`;
    box.innerHTML = `<i class="bi ${icon}"></i><div class="loc-status-text"><strong></strong><small></small></div>`;
    box.querySelector('strong').textContent = title;
    box.querySelector('small').textContent = detail;
}

function getLocation() {
    $('lat').value = ''; $('long').value = '';
    $('locMap').hidden = true;
    $('locRefresh').disabled = true;
    setLocStatus('warning', 'bi-arrow-repeat spin', 'กำลังค้นหาพิกัด...', 'กรุณาอยู่ในที่โล่งเพื่อความแม่นยำ');
    updateChecklist();

    if (!navigator.geolocation) {
        setLocStatus('danger', 'bi-x-circle-fill', 'เบราว์เซอร์ไม่รองรับ GPS', 'กรุณาเปิดด้วย Chrome หรือ Safari');
        $('locRefresh').disabled = false;
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            $('lat').value = latitude;
            $('long').value = longitude;
            setLocStatus('success', 'bi-check-circle-fill', 'ระบุตำแหน่งสำเร็จ',
                `${latitude.toFixed(5)}, ${longitude.toFixed(5)} · แม่นยำ ±${Math.round(accuracy)} ม.`);
            $('locMap').href = `https://www.google.com/maps?q=${latitude},${longitude}`;
            $('locMap').hidden = false;
            $('locRefresh').disabled = false;
            $('stepLocation').classList.remove('is-error');
            updateChecklist();
        },
        (err) => {
            const denied = err && err.code === 1;
            setLocStatus('danger', 'bi-x-circle-fill', denied ? 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง' : 'ไม่สามารถระบุพิกัดได้',
                denied ? 'เปิดสิทธิ์ตำแหน่งในการตั้งค่าเบราว์เซอร์ แล้วกดรีเฟรช' : 'ตรวจสอบว่าเปิด GPS แล้วกดรีเฟรชตำแหน่ง');
            $('locRefresh').disabled = false;
            updateChecklist();
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
}

let previewUrl = null;
function updateFileName(input) {
    const hasFile = input.files && input.files.length > 0;
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    $('photoEmpty').hidden = hasFile;
    $('photoFilled').hidden = !hasFile;
    if (hasFile) {
        previewUrl = URL.createObjectURL(input.files[0]);
        $('photoPreview').src = previewUrl;
        $('fileNameDisplay').textContent = `${input.files[0].name} · ${(input.files[0].size / 1024 / 1024).toFixed(1)} MB (ระบบจะย่อขนาดให้อัตโนมัติ)`;
        $('stepPhoto').classList.remove('is-error');
    } else {
        $('photoPreview').removeAttribute('src');
    }
    updateChecklist();
}

function formState() {
    return {
        location: !!$('lat').value,
        photo: $('evidenceImg').files.length > 0
    };
}

function updateChecklist() {
    const s = formState();
    $('stepLocation').classList.toggle('is-done', s.location);
    $('stepPhoto').classList.toggle('is-done', s.photo);
    const items = [
        [s.location, 'ตำแหน่ง GPS'],
        [true, 'ประเภทการขาย'],
        [s.photo, 'ภาพหลักฐาน']
    ];
    $('checklist').innerHTML = items.map(([ok, label]) =>
        `<li class="pill ${ok ? 'is-success' : ''}"><i class="bi ${ok ? 'bi-check-circle-fill' : 'bi-circle'}"></i> ${label}</li>`).join('');
}

function flagStep(id) {
    const el = $(id);
    el.classList.add('is-error');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function handleFormSubmit(e) {
    e.preventDefault();
    if (SUBMITTING) return;
    const s = formState();
    if (!s.location) {
        flagStep('stepLocation');
        await showMessage({ title: 'ยังไม่มีตำแหน่ง GPS', text: 'กรุณารอให้ระบบระบุตำแหน่งสำเร็จ หรือกด "รีเฟรชตำแหน่ง"', tone: 'warning' });
        if ($('locRefresh').disabled === false) getLocation();
        return;
    }
    if (!s.photo) {
        flagStep('stepPhoto');
        await showMessage({ title: 'ยังไม่มีภาพหลักฐาน', text: 'กรุณาถ่ายภาพให้เห็นบัตรประจำร้านค้าผู้พิการ ล็อคที่ขาย และผู้ที่ขาย', tone: 'warning' });
        return;
    }
    const selectedSalesType = document.querySelector('input[name="salesTypeRadio"]:checked')?.value;

    SUBMITTING = true;
    $('submitBtn').disabled = true;
    showLoading(true, 'กำลังส่งหลักฐาน...');
    try {
        const file = $('evidenceImg').files[0];
        const compressedBase64 = await compressImage(file);
        const formData = {
            userName: CURRENT_USER.name, salesType: selectedSalesType,
            lat: $('lat').value, long: $('long').value,
            imageFile: { name: file.name, mimeType: "image/jpeg", data: compressedBase64 }
        };

        const res = await callApi('submit', { userId: CURRENT_USER.id, formData: formData });
        showLoading(false);

        if (res.success) {
            const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            await showMessage({ title: 'ส่งงานสำเร็จ', text: `${res.message || 'บันทึกข้อมูลเรียบร้อย'} (${selectedSalesType} · ${time} น.)`, tone: 'success', okText: 'ดูประวัติ' });
            $('salesForm').reset();
            updateFileName($('evidenceImg'));
            getLocation();
            loadHistoryData(true);
            switchTab('history');
        } else {
            showMessage({ title: 'บันทึกไม่สำเร็จ', text: res.message || 'กรุณาลองใหม่อีกครั้ง', tone: 'danger' });
        }
    } catch (error) {
        showLoading(false);
        showMessage({ title: 'เกิดข้อผิดพลาด', text: 'Client Error: ' + error.toString(), tone: 'danger' });
    } finally {
        SUBMITTING = false;
        $('submitBtn').disabled = false;
    }
}

// --- HISTORY HANDLING ---
let historyReq = null;
let historySeq = 0;
let FILTERED = [];
let LIST_STATE = { shown: 0, lastDate: null, list: null };

function initHistory() {
    $('filterGroup').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-filter]');
        if (btn) changeFilter(btn.dataset.filter);
    });
    $('monthSelect').innerHTML = MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join('');
    $('monthSelect').value = FILTER_MONTH_IDX;
    $('monthSelect').addEventListener('change', (e) => { FILTER_MONTH_IDX = parseInt(e.target.value); renderFilteredHistory(); });
    $('yearSelect').addEventListener('change', (e) => { FILTER_YEAR_VAL = parseInt(e.target.value); renderFilteredHistory(); });
    $('loadMoreBtn').addEventListener('click', () => appendItems(DISPLAY_LIMIT));
    $('histRefresh').addEventListener('click', () => loadHistoryData(true));
}

// รวมคำขอที่ซ้อนกันเป็นคำขอเดียว; force = โหลดใหม่แม้มีคำขอค้างอยู่ (ผลของคำขอเก่าจะถูกทิ้ง)
function loadHistoryData(force = false) {
    if (historyReq && !force) return historyReq;
    const seq = ++historySeq;
    if (!HISTORY_LOADED) $('historyList').innerHTML = '<div class="stack"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
    $('histUpdated').textContent = 'กำลังโหลด...';
    $('histRefresh').disabled = true;

    historyReq = callApi('history', { userId: CURRENT_USER.id }).then(res => {
        if (seq !== historySeq) return;
        historyReq = null;
        $('histRefresh').disabled = false;
        if (res.success) {
            ALL_HISTORY = (res.history || []).slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            HISTORY_LOADED = true;
            $('histUpdated').textContent = 'อัปเดตล่าสุด ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
            updateTodayStatus();
            renderYearOptions();
            renderFilteredHistory();
        } else {
            $('histUpdated').textContent = res.message || 'โหลดข้อมูลไม่สำเร็จ';
            if (!HISTORY_LOADED) $('historyList').innerHTML = '<div class="empty"><i class="bi bi-wifi-off"></i>โหลดประวัติไม่สำเร็จ กดรีเฟรชเพื่อลองใหม่</div>';
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

function updateTodayStatus() {
    const today = new Date();
    const count = ALL_HISTORY.filter(h => sameDay(new Date(h.timestamp), today)).length;
    const pill = $('todayPill');
    pill.className = 'pill' + (count ? ' is-success' : ' is-warning');
    pill.innerHTML = count
        ? `<i class="bi bi-check-circle-fill"></i> ส่งแล้ววันนี้${count > 1 ? ' ' + count + ' ครั้ง' : ''}`
        : '<i class="bi bi-exclamation-circle"></i> ยังไม่ส่งวันนี้';
    $('navDot').hidden = !count;
}

function changeFilter(type) {
    CURRENT_FILTER = type;
    document.querySelectorAll('[data-filter]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.filter === type)));
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
        label = 'ยอดส่งงานรายเดือน';
        buckets = new Date(FILTER_YEAR_VAL, FILTER_MONTH_IDX + 1, 0).getDate();
        axis = ['1', String(Math.ceil(buckets / 2)), String(buckets)]; bucketOf = (d) => d.getDate() - 1;
    } else {
        label = 'ยอดรวมทั้งปี';
        buckets = 12; axis = [MONTHS_SHORT[0], MONTHS_SHORT[5], MONTHS_SHORT[11]]; bucketOf = (d) => d.getMonth();
    }
    const counts = new Array(buckets).fill(0);
    data.forEach(item => { const i = bucketOf(new Date(item.timestamp)); if (i >= 0 && i < buckets) counts[i]++; });
    const max = Math.max(1, ...counts);
    $('sumBars').innerHTML = counts.map(c => `<span class="${c ? 'is-on' : ''}" style="height:${c ? Math.max(12, (c / max) * 100) : 6}%"></span>`).join('');
    $('sumAxis').innerHTML = axis.map(a => `<span>${a}</span>`).join('');
    $('sumLabel').textContent = label;
    $('sumCount').textContent = data.length;
}

function renderList() {
    const container = $('historyList');
    container.textContent = '';
    LIST_STATE = { shown: 0, lastDate: null, list: null };
    if (FILTERED.length === 0) {
        container.innerHTML = '<div class="empty"><i class="bi bi-inbox"></i>ไม่พบประวัติการส่งงานในช่วงนี้</div>';
        $('loadMoreBtn').hidden = true;
        return;
    }
    appendItems(DISPLAY_LIMIT);
}

// เพิ่มรายการต่อท้ายโดยไม่สร้างรายการเดิมใหม่
function appendItems(count) {
    const container = $('historyList');
    const st = LIST_STATE;
    FILTERED.slice(st.shown, st.shown + count).forEach(item => {
        if (!st.list || item.date !== st.lastDate) {
            st.lastDate = item.date;
            const head = document.createElement('p');
            head.className = 'hist-group-label';
            head.textContent = item.date;
            st.list = document.createElement('ul');
            st.list.className = 'hist-list';
            container.append(head, st.list);
        }
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hist-item';
        btn.innerHTML = `<img class="hist-thumb" alt="" loading="lazy"><div class="hist-text"><strong></strong><small><i class="bi bi-clock"></i> </small></div><i class="bi bi-chevron-right"></i>`;
        if (item.image) btn.querySelector('img').src = item.image;
        btn.querySelector('strong').textContent = item.type;
        btn.querySelector('small').append(`${item.time} น.`);
        btn.addEventListener('click', () => openViewer(item));
        li.appendChild(btn);
        st.list.appendChild(li);
        st.shown++;
    });
    $('loadMoreBtn').hidden = st.shown >= FILTERED.length;
}

function openViewer(item) {
    const img = $('viewerImg');
    $('viewerTitle').textContent = item.type;
    $('viewerMeta').textContent = `${item.date} · ${item.time} น.`;
    img.removeAttribute('src');
    img.hidden = !item.image;
    $('viewerEmpty').hidden = !!item.image;
    if (item.image) img.src = item.image;
    showModal('viewerModal');
}
