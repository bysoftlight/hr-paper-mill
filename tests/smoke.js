// tests/smoke.js — Smoke test: เปิดทุกหน้าของผู้ใช้สิทธิ์และเจ้าหน้าที่ บนจอมือถือ (iPhone 13) และจอคอม (1440×900)
// ถ่ายภาพเต็มหน้า และตรวจ error ใน console · error ที่แอปส่งเข้า Log (log.error) · คำขอที่ล้มเหลว · เนื้อหากว้างเกินจอ
// ระบบหลังบ้าน (Apps Script) ถูกจำลองทั้งหมด — ไม่มีคำขอไปถึงข้อมูลจริง
// ใช้งาน: node tests/smoke.js [โฟลเดอร์ภาพ]   (ต้องมี playwright · ค่าเริ่มต้นเก็บภาพที่ tests/output/) · พบปัญหา = exit code 1
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'output'));
fs.mkdirSync(OUT, { recursive: true });
let BASE = '';

// ---------- static server (เหมือน GitHub Pages) ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
function serve() {
    const srv = http.createServer((req, res) => {
        const p = path.normalize(decodeURIComponent(req.url.split(/[?#]/)[0]));
        const file = path.join(ROOT, p === '/' ? 'index.html' : p);
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(r => srv.listen(0, '127.0.0.1', () => { BASE = 'http://127.0.0.1:' + srv.address().port; r(srv); }));
}
// คำเตือนที่เกิดจากสภาพแวดล้อมทดสอบเอง ไม่ใช่ปัญหาของแอป
const IGNORE = [/Service Worker registration blocked by Playwright/];

// ---------- mock data ----------
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const TYPES = ['ทำการขายด้วยตัวเอง', 'ทำการขายโดยตัวแทน'];
const SITES = [['ตลาดนัดจตุจักร', 13.7999, 100.5502], ['หน้าเซ็นทรัลลาดพร้าว', 13.8163, 100.5605], ['ตลาดสามย่าน', 13.7325, 100.5291]];
const NAMES = ['สมชาย ใจดี', 'สมหญิง รักไทย', 'ประเสริฐ ทองคำ', 'วันเพ็ญ แสงจันทร์', 'บุญมี มากมี', 'กัญญา ศรีสุข'];
const PIC = 'img/apple-touch-icon.png';
const participants = NAMES.map((name, i) => {
    const s = SITES[i % SITES.length];
    return { id: 'AB12C' + i, name, status: 'ผู้พิการทางการเคลื่อนไหว', pic: '', picRaw: '', site: s[0], siteLat: s[1], siteLng: s[2], phone: '08123456' + pad(i), active: true, note: '', updatedBy: 'admin', updatedAt: now.getTime(), monthCount: 20 - i, monthAgent: i, yearCount: 200 - i * 10, anomaliesMonth: i % 2, reportedToday: i < 4, lastReport: now.getTime() - i * 3600e3, lastLat: s[1], lastLng: s[2] };
});
const records = [];
for (let d = 0; d < 40; d++) participants.forEach((p, i) => {
    if ((d + i) % 7 === 6) return;
    const ts = new Date(now.getTime() - d * 86400e3); ts.setHours(8 + i, 15 + d % 40, 0, 0);
    if (ts > now) ts.setTime(now.getTime() - (i + 1) * 600e3);
    const type = (d + i) % 5 === 0 ? TYPES[1] : TYPES[0];
    const anomaly = (d + i) % 11 === 0;
    records.push({ row: records.length + 2, ts: ts.getTime(), date: ymd(ts), time: `${pad(ts.getHours())}:${pad(ts.getMinutes())}`, userId: p.id, userName: p.name, userPic: '', site: p.site, type, image: PIC, fileId: '', lat: p.siteLat + (anomaly ? 0.05 : 0.0003), lng: p.siteLng, mapUrl: 'https://maps.google.com/maps?q=1,1', distance: anomaly ? 5400 : 30, anomaly, hasGps: true, note: '', status: 'active', source: 'web', updatedBy: '', updatedAt: null, accuracy: 12, lowAccuracy: false, dup: false, dupWith: [], receivedAt: ts.getTime() });
});
records.sort((a, b) => b.ts - a.ts);
const today = ymd(now);
const todayRecs = records.filter(r => r.date === today);
const daysIn = (y, m) => new Date(y, m, 0).getDate();
const dayNow = now.getDate();
const countByDate = {}; records.forEach(r => { countByDate[r.date] = (countByDate[r.date] || 0) + 1; });
const monthArr = (y, m, n) => Array.from({ length: n }, (_, i) => countByDate[`${y}-${pad(m)}-${pad(i + 1)}`] || 0);
const py = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), pm = now.getMonth() === 0 ? 12 : now.getMonth();
const agg = rows => {
    const byDay = {}, bySite = {}, users = {};
    rows.forEach(r => { byDay[r.date] = (byDay[r.date] || 0) + 1; bySite[r.site] = (bySite[r.site] || 0) + 1; const u = users[r.userId] || (users[r.userId] = { id: r.userId, name: r.userName, site: r.site, count: 0, agent: 0, anomalies: 0, days: 0 }); u.count++; if (r.type === TYPES[1]) u.agent++; if (r.anomaly) u.anomalies++; });
    return { total: rows.length, users: Object.keys(users).length, self: rows.filter(r => r.type === TYPES[0]).length, agent: rows.filter(r => r.type === TYPES[1]).length, anomalies: rows.filter(r => r.anomaly).length, nogps: 0, duplicates: 0, lowAccuracy: 0, byDay, bySite, byUser: Object.values(users) };
};
const me = { id: 'S1', provider: 'google', email: 'tester@example.com', name: 'ผู้ทดสอบ ระบบ', picture: '', role: 'dev', permissions: ['records.view', 'records.edit', 'participants.view', 'participants.edit', 'export', 'admin', 'dev'], storedPermissions: [], status: 'active', createdAt: now.getTime() - 9e9, lastLoginAt: now.getTime(), approvedBy: '', approvedAt: null, note: '', org: '', customPicture: false };
const inboxItems = [{ id: 'n1', kind: 'news', title: 'ประกาศ: วันหยุดสิ้นปี', body: 'ระบบเปิดให้ส่งรายงานตามปกติ', at: now.getTime() - 86400e3 }];
const user = { id: 'AB12C0', name: NAMES[0], status: 'ผู้พิการทางการเคลื่อนไหว', pic: '', active: true, org: '' };
const history = records.filter(r => r.userId === user.id).slice(0, 30).map(r => ({ date: r.date, time: r.time, type: r.type, image: PIC, fileId: '', lat: r.lat, lng: r.lng, mapUrl: r.mapUrl, timestamp: r.ts }));

// สถิติการใช้งาน (รูปแบบเดียวกับ analyticsReport_ ใน apps-script/Analytics.gs)
function analyticsReport(app, days) {
    const totals = (k) => ({ users: 38 * k, newUsers: 6 * k, sessions: 120 * k, views: 410 * k, events: 900 * k, avgSession: 95, engagementRate: 72, viewsPerSession: 3.4 });
    const from = ymd(new Date(now.getTime() - (days - 1) * 86400e3));
    const share = keys => keys.map((key, i) => ({ key, users: 30 - i * 8 }));
    return {
        success: true, from, to: today, days, app, generatedAt: Date.now(),
        totals: totals(1), previous: totals(0.9),
        daily: Array.from({ length: days }, (_, i) => ({ date: ymd(new Date(now.getTime() - (days - 1 - i) * 86400e3)), users: 20 + (i * 7) % 15, sessions: 40 + (i * 11) % 25, views: 120 + (i * 13) % 60 })),
        realtime: { active: 3, perMinute: Array.from({ length: 30 }, (_, i) => (i * 7) % 5), users30: 9, pages: [{ key: 'user:form', views: 4 }, { key: 'staff:overview', views: 2 }] },
        pages: [{ app: 'user', page: 'form', views: 220, users: 30, avgTime: 75 }, { app: 'user', page: 'history', views: 90, users: 22, avgTime: 40 }, { app: 'staff', page: 'overview', views: 60, users: 4, avgTime: 120 }],
        events: [{ app: 'user', event: 'submit_success', count: 95, users: 30, labels: [] }, { app: 'user', event: 'login', count: 40, users: 28, labels: [{ label: 'manual', count: 12 }, { label: 'auto', count: 28 }] }],
        devices: share(['mobile', 'desktop', 'tablet']), os: share(['Android', 'iOS', 'Windows']), browsers: share(['Chrome', 'Safari', 'Samsung Internet']),
        pwa: share(['เบราว์เซอร์', 'แอปบนหน้าจอโฮม']), sources: share(['เข้าตรง', 'line.me']), apps: share(['user', 'staff']),
        heat: Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => (d && h >= 7 && h <= 17 ? (h * d) % 9 : 0))),
        funnel: [['form_view', 'เปิดหน้าส่งรายงาน', 120], ['location_ok', 'ระบุตำแหน่งแล้ว', 110], ['type_select', 'เลือกประเภทการขาย', 105], ['photo_ok', 'ถ่ายภาพแล้ว', 100], ['submit', 'กดบันทึก', 98], ['submit_success', 'ส่งสำเร็จ', 95]].map(([step, label, sessions]) => ({ step, label, sessions })),
        outcomes: { submitSuccess: 95, submitFail: 3, queued: 2, loginFail: 4, errors: 0, failReasons: [{ label: 'เครือข่ายขัดข้อง', count: 3 }] }
    };
}

function mock(action, body) {
    switch (action) {
        case 'login': return { success: true, data: user, history, trust: 't', surveys: [], inbox: inboxItems, inboxState: {} };
        case 'history': return { success: true, history };
        case 'inbox.list': case 'staff.inbox.list': return { success: true, items: inboxItems, state: {}, at: Date.now() };
        case 'inbox.state': case 'inbox.read': case 'staff.inbox.state': case 'staff.inbox.read': return { success: true, state: {} };
        case 'survey.pending': return { success: true, surveys: [] };
        case 'analytics.track': case 'staff.log.client': case 'log.client': return { success: true };
        case 'staff.config': return { success: true, googleClientId: '', googleAccessToken: true, lineChannelId: '', agentLimit: 10, anomalyRadius: 500, salesTypes: TYPES };
        case 'staff.me': return { success: true, staff: me, token: 'tok', subscription: null };
        case 'staff.overview': return {
            success: true, today, isToday: true, realToday: today, generatedAt: Date.now(),
            kpi: { participants: 6, reportedToday: 4, missingToday: 2, agentToday: 1, anomaliesToday: 1, nogpsToday: 0, duplicatesToday: 0, lowAccToday: 0, monthRecords: 90, monthExpected: 6 * dayNow, monthRate: 82, agentOverLimit: 0 },
            missing: participants.slice(4).map(p => ({ id: p.id, name: p.name, pic: '', site: p.site, phone: p.phone, contact: null })),
            agentWatch: [{ id: participants[5].id, name: participants[5].name, pic: '', site: participants[5].site, used: 6, limit: 10 }],
            anomalies: todayRecs.filter(r => r.anomaly), trend: Array.from({ length: 30 }, (_, i) => { const d = ymd(new Date(now.getTime() - (29 - i) * 86400e3)); return { date: d, count: countByDate[d] || 0, agent: 1 }; }),
            compare: { thisMonth: today.slice(0, 7), lastMonth: `${py}-${pad(pm)}`, today: dayNow, current: monthArr(now.getFullYear(), now.getMonth() + 1, dayNow), previous: monthArr(py, pm, daysIn(py, pm)), totals: { current: 20, previousSamePeriod: 18, previousMonth: 150 }, rate: { current: 82, previous: 78 }, agent: { current: 3, previous: 2 } },
            hours: Array.from({ length: 24 }, (_, h) => (h >= 7 && h <= 17 ? 10 - Math.abs(12 - h) : 0)),
            sites: SITES.map(s => ({ site: s[0], lat: s[1], lng: s[2], people: 2, today: 1, month: 30 })),
            latest: records.slice(0, 8)
        };
        case 'staff.records.list': { const rows = records; return body.all ? { success: true, total: rows.length, rows, agg: agg(rows) } : { success: true, total: rows.length, page: body.page || 1, pageSize: body.pageSize || 50, rows: rows.slice(0, body.pageSize || 50), agg: agg(rows) }; }
        case 'staff.records.latest': return { success: true, count: 0, newest: Date.now() };
        case 'staff.participants.list': return { success: true, participants, daysSoFar: dayNow, agentLimit: 10 };
        case 'staff.contacts.list': return { success: true, contacts: [] };
        case 'admin.staff.list': return { success: true, staff: [me, Object.assign({}, me, { id: 'S2', name: 'รออนุมัติ ทดสอบ', email: 'p@example.com', role: 'pending', status: 'pending', permissions: [] })] };
        case 'admin.logs.list': return { success: true, total: 1, logs: [{ ts: Date.now(), actor: 'ผู้ทดสอบ', role: 'dev', action: 'staff.login', target: 'tester@example.com', detail: '', ua: '' }] };
        case 'staff.analytics.report': return analyticsReport(body.app || 'all', body.days || 7);
        case 'staff.analytics.live': return { success: true, realtime: analyticsReport('all', 1).realtime, generatedAt: Date.now() };
        case 'dev.overview': return {
            success: true, generatedAt: Date.now(),
            totals: { orgs: 4, users: 42, unassignedUsers: 3, mrr: 4970, arr: 59640, paidMonth: 3980, unpaidAmount: 990, unpaidCount: 1, byStatus: { trial: 1, active: 2, past_due: 1, suspended: 0, cancelled: 0 } },
            plans: [{ id: 'basic', name: 'Basic', orgs: 2 }, { id: 'pro', name: 'Pro', orgs: 2 }],
            trialsEnding: [{ id: 'o3', name: 'บริษัท ทดลอง จำกัด', planName: 'Pro', access: { state: 'trial', daysLeft: 3 } }],
            attention: [{ id: 'o4', name: 'บริษัท ค้างชำระ จำกัด', planName: 'Basic', access: { state: 'past_due', daysLeft: 0 } }],
            revenue: Array.from({ length: 6 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1); return { month: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, amount: 2000 + i * 400 }; })
        };
        default: return null; // ไม่ได้จำลอง → แอปแสดงสถานะ error ของตัวเอง (แจ้งใน unmocked ไม่นับเป็นปัญหา)
    }
}

// ---------- runner ----------
const results = [];
async function run(label, ctxOpts) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext(Object.assign({ locale: 'th-TH', timezoneId: 'Asia/Bangkok', serviceWorkers: 'block', permissions: [] }, ctxOpts));
    const unmocked = new Set();
    let cur = 'init';
    const issues = [];
    await ctx.route(/script\.google(usercontent)?\.com/, async route => {
        let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
        let r = mock(body.action, body);
        if (body.action === 'log.error') issues.push({ shot: cur, type: 'app-error-report', text: JSON.stringify(body).replace(/"secret":"[^"]*",?/, '').slice(0, 600) });
        if (!r) { unmocked.add(body.action); r = { success: false, message: 'mock: ไม่ได้จำลองคำสั่ง ' + body.action }; }
        await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(r) });
    });
    const page = await ctx.newPage();
    page.on('console', m => { if (['error', 'warning'].includes(m.type()) && !IGNORE.some(re => re.test(m.text()))) issues.push({ shot: cur, type: m.type(), text: m.text().slice(0, 300) }); });
    page.on('pageerror', e => issues.push({ shot: cur, type: 'pageerror', text: String(e.stack || e).slice(0, 500) }));
    page.on('requestfailed', r => { if (!/script\.google/.test(r.url())) issues.push({ shot: cur, type: 'requestfailed', text: r.url() + ' ' + (r.failure() || {}).errorText }); });
    page.on('response', r => { if (r.status() >= 400) issues.push({ shot: cur, type: 'http' + r.status(), text: r.url() }); });

    const shots = [];
    async function shot(name) {
        cur = name;
        await page.waitForTimeout(700);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const file = `${label}-${String(shots.length + 1).padStart(2, '0')}-${name}.png`;
        // ถ่ายเต็มหน้า = เปลี่ยนขนาด viewport ชั่วคราว ทำให้แอนิเมชันของ dialog เริ่มใหม่ → มี dialog เปิดอยู่ให้ถ่ายเฉพาะจอ
        const dialog = await page.locator('dialog[open]').count();
        await page.screenshot({ path: path.join(OUT, file), fullPage: !dialog });
        shots.push({ file, overflow });
        if (overflow > 1) issues.push({ shot: name, type: 'layout', text: `เลื่อนแนวนอนได้ ${overflow}px (เนื้อหากว้างเกินจอ)` });
    }
    const clickTab = async t => { await page.locator(`[data-tab="${t}"]:visible`).first().click(); };

    // ===== ผู้ใช้สิทธิ์ (index.html) =====
    cur = 'p-load';
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await shot('p-rules-modal');
    await page.check('#rulesAck'); await page.click('#rulesAccept');
    await shot('p-login');
    await page.fill('#loginId', 'AB12C0');
    await page.click('#loginBtn');
    await page.waitForSelector('#appContainer:not([hidden])', { timeout: 15000 });
    await page.waitForTimeout(800);
    if (await page.locator('#onboardModal[open]').count()) { await shot('p-onboarding'); await page.keyboard.press('Escape'); }
    await page.evaluate(() => localStorage.setItem('HRPM_COOKIE_OK', 'declined:' + Date.now()));
    await page.reload({ waitUntil: 'networkidle' });
    await shot('p-form');
    for (const t of ['history', 'inbox', 'account']) { await clickTab(t); await shot('p-' + t); }

    // ===== เจ้าหน้าที่ (staff.html) =====
    cur = 's-load';
    await page.goto(BASE + '/staff.html', { waitUntil: 'networkidle' });
    await shot('s-login');
    await page.evaluate(() => { localStorage.setItem('HRPM_STAFF_TOKEN', 'tok'); localStorage.setItem('HRPM_COOKIE_OK', 'declined:' + Date.now()); });
    await page.goto(BASE + '/staff.html?r=1#overview', { waitUntil: 'networkidle' });
    await page.waitForSelector('#appContainer:not([hidden])', { timeout: 15000 }).catch(() => {});
    await shot('s-overview');
    for (const t of ['records', 'participants', 'analytics', 'admin', 'dev', 'inbox', 'account']) {
        cur = 's-' + t;
        await page.evaluate(t => { location.hash = t; }, t);
        await page.waitForLoadState('networkidle').catch(() => {});
        await shot('s-' + t);
    }
    await browser.close();
    results.push({ label, shots, issues, unmocked: [...unmocked] });
}

(async () => {
    const srv = await serve();
    await run('mobile', Object.assign({}, devices['iPhone 13'], { defaultBrowserType: undefined }));
    await run('desktop', { viewport: { width: 1440, height: 900 } });
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
    for (const r of results) {
        console.log(`\n=== ${r.label}: ${r.shots.length} shots, ${r.issues.length} issues; unmocked: ${r.unmocked.join(', ') || '-'}`);
        r.issues.forEach(i => console.log(`  [${i.shot}] ${i.type}: ${i.text}`));
    }
    srv.close();
    console.log(`\nภาพและ report.json: ${OUT}`);
    process.exit(results.some(r => r.issues.length) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
