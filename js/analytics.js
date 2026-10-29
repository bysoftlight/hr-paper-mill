// js/analytics.js — สถิติการใช้งาน ใช้ร่วมกัน: หน้าผู้ใช้สิทธิ์ · หน้า Staff · โปรแกรมใบเสนอราคา
//   Analytics.init({ app: 'user' | 'staff' | 'quote', role })
//   Analytics.page('form')                       — เปิดหน้า/แท็บ (บันทึกเวลาที่อยู่บนหน้าก่อนหน้าให้ด้วย)
//   Analytics.track('submit_success', { l: 'ป้าย', v: 123, d: { ข้อมูลเพิ่มเติม } })
//   Analytics.setUser('REN001' | 'staff@…')     — ผูกเหตุการณ์หลังเข้าสู่ระบบกับรหัสผู้ใช้ ('' = ออกจากระบบ)
//   Analytics.setLocation(lat, lng, acc)         — พิกัดที่แอปได้มาแล้ว (ไม่ขอสิทธิ์ตำแหน่งเพิ่ม) ใช้กับเหตุการณ์ใน 30 นาที
// ผู้เยี่ยมชม = รหัสสุ่มของเบราว์เซอร์นี้ · เซสชัน = ใช้งานต่อเนื่อง (ว่างเกิน 30 นาทีนับใหม่)
// ส่งเป็นชุดทุก ~8 วินาที และตอนปิด/สลับแอป (sendBeacon) · ออฟไลน์เก็บคิวไว้ในเครื่องแล้วค่อยส่ง
// ปิดได้ในหน้าตั้งค่า ("ส่งสถิติการใช้งาน") — ปิดแล้วไม่เก็บ/ไม่ส่งอะไรเลย

const Analytics = (() => {
    const VID_KEY = 'HRPM_VID', Q_KEY = 'HRPM_AQ', UAH_KEY = 'HRPM_UAH', LOC_FRESH = 30 * 60000, SESSION_IDLE = 30 * 60000, MAX_QUEUE = 300;
    let app = '', role = '', user = '', loc = null, page = '', pageStart = 0, visibleSince = 0, timer = 0, ready = false;

    const ls = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* โหมดส่วนตัว: ใช้ในหน่วยความจำ */ } }
    };
    const rid = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).slice(0, 16);
    const enabled = () => !(typeof Prefs !== 'undefined' && Prefs.get('analytics') === false);

    // ---------- ผู้เยี่ยมชม / เซสชัน ----------
    let firstVisit = false;
    function visitor() {
        let v = ls.get(VID_KEY);
        if (!v) { v = rid(); ls.set(VID_KEY, v); firstVisit = true; }
        return v;
    }
    function session() {
        const key = 'HRPM_SID_' + app, now = Date.now();
        let s = null;
        try { s = JSON.parse(ls.get(key) || 'null'); } catch (e) { s = null; }
        let fresh = false;
        if (!s || now - s.last > SESSION_IDLE) { s = { id: rid(), last: now }; fresh = true; }
        s.last = now;
        ls.set(key, JSON.stringify(s));
        if (fresh) push('session_start', {});
        return s.id;
    }

    // ---------- อุปกรณ์ (แยกจาก user agent อย่างหยาบ ไม่เก็บ user agent เต็ม) ----------
    function env() {
        const ua = navigator.userAgent || '', touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
        const device = /iPad|Tablet/.test(ua) || touchMac || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'tablet' : /Mobi|iPhone|iPod|Android/.test(ua) ? 'mobile' : 'desktop';
        const os = /iPhone|iPad|iPod/.test(ua) || touchMac ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'อื่นๆ';
        const browser = / Line\//.test(ua) ? 'LINE' : /FBAN|FBAV|Instagram/.test(ua) ? 'Facebook/IG' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Edg\//.test(ua) ? 'Edge'
            : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'อื่นๆ';
        const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
        let ref = '';
        try {
            const q = new URLSearchParams(location.search).get('utm_source');
            if (q) ref = q.slice(0, 40);
            else if (document.referrer) { const h = new URL(document.referrer).hostname; if (h && h !== location.hostname) ref = h.replace(/^www\./, ''); }
        } catch (e) { /* ไม่ทราบที่มา */ }
        // รุ่น/เวอร์ชัน: iOS บอกได้แค่ iPhone/iPad · Android บน Chrome ได้รุ่นจริงจาก userAgentData (โหลดครั้งแรกแล้วจำไว้)
        const m = ua.match(/(?:iPhone|CPU) OS (\d+)[_.](\d+)/) || ua.match(/Android (\d+(?:\.\d+)?)/) || ua.match(/Windows NT (\d+\.\d+)/) || ua.match(/Mac OS X (\d+)[_.](\d+)/);
        const osVer = m ? m.slice(1).filter(Boolean).join('.') : '';
        const bm = ua.match(/(?:Edg|SamsungBrowser|Line|Firefox|FxiOS|CriOS|Chrome|Version)\/(\d+(?:\.\d+)?)/);
        const andModel = (ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/) || [])[1];
        const model = /iPad/.test(ua) || touchMac ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : andModel && andModel !== 'K' ? andModel : /Macintosh/.test(ua) ? 'Mac' : '';
        let hint = {};
        try { hint = JSON.parse(ls.get(UAH_KEY) || '{}') || {}; } catch (e) { hint = {}; }
        let lang = '', tz = '';
        try { lang = navigator.language || ''; tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* ไม่ทราบ */ }
        return { device, os, browser, standalone, screen: Math.round(window.screen ? screen.width : innerWidth), ref,
            model: hint.model || model, osVer: hint.osVer || osVer, brVer: bm ? bm[1] : '', lang, tz };
    }
    // Chrome/Edge: ขอรุ่นเครื่อง + เวอร์ชันระบบจริง (เบราว์เซอร์ไม่ถามผู้ใช้) แล้วจำไว้ใช้ครั้งต่อไป
    function loadHints() {
        try {
            const uad = navigator.userAgentData;
            if (!uad || !uad.getHighEntropyValues) return;
            uad.getHighEntropyValues(['model', 'platformVersion']).then(h => {
                const v = { model: String(h.model || '').slice(0, 40), osVer: String(h.platformVersion || '').split('.').slice(0, 2).join('.') };
                if (ENV && ENV.os === 'Windows' && v.osVer) v.osVer = Number(v.osVer.split('.')[0]) >= 13 ? '11' : '10';
                if (!v.model) delete v.model;
                ls.set(UAH_KEY, JSON.stringify(v));
                if (ENV) { if (v.model) ENV.model = v.model; if (v.osVer) ENV.osVer = v.osVer; }
            }).catch(() => { /* ไม่รองรับ */ });
        } catch (e) { /* ไม่รองรับ */ }
    }
    let ENV = null;

    // ---------- คิว ----------
    function queue() { try { return JSON.parse(ls.get(Q_KEY) || '[]'); } catch (e) { return []; } }
    function saveQueue(q) { ls.set(Q_KEY, JSON.stringify(q.slice(-MAX_QUEUE))); }
    function push(e, o) {
        const q = queue();
        const now = Date.now(), g = loc && now - loc.at < LOC_FRESH ? [loc.lat, loc.lng, loc.acc] : undefined;
        let d;
        if (o.d && typeof o.d === 'object') { try { d = JSON.stringify(o.d).slice(0, 300); } catch (err) { d = undefined; } }
        q.push({ app, t: now, e, p: o.p !== undefined ? String(o.p).slice(0, 60) : page, l: o.l !== undefined ? String(o.l).slice(0, 80) : undefined, v: o.v, n: o.n, u: user || undefined, g, d });
        saveQueue(q);
    }
    function schedule(ms) { clearTimeout(timer); timer = setTimeout(() => flush(false), ms); }

    function track(e, o = {}) {
        if (!ready || !enabled()) return;
        session();
        push(e, o);
        schedule(queue().length >= 20 ? 0 : 8000);
    }
    // เปลี่ยนหน้า/แท็บ: บันทึกเวลาที่อยู่บนหน้าเดิม (เฉพาะตอนแอปอยู่บนจอ) แล้วนับ page_view ของหน้าใหม่
    function pageView(name) {
        if (!ready || !enabled()) return;
        if (name === page) return;
        leave();
        page = String(name || '').slice(0, 60);
        pageStart = visibleSince = Date.now();
        track('page_view', { p: page });
    }
    let shownMs = 0;
    function leave() {
        if (!page) return;
        const ms = shownMs + (document.visibilityState === 'visible' && visibleSince ? Date.now() - visibleSince : 0);
        shownMs = 0;
        if (ms >= 500) { session(); push('page_leave', { p: page, v: Math.min(ms, 3600000) }); }
    }

    function flush(beacon) {
        if (!enabled() || typeof CONFIG === 'undefined' || !CONFIG.API_URL) return Promise.resolve();
        // เบราว์เซอร์อัตโนมัติ (ชุดทดสอบ): ตอนปิดหน้าไม่ส่ง — คำขอหลังปิดหน้าดักไม่ได้ ข้อมูลทดสอบจะหลุดเข้าชีตจริง (เก็บไว้ในคิวแทน)
        if (beacon && navigator.webdriver) return Promise.resolve();
        if (navigator.onLine === false) return Promise.resolve();
        const q = queue();
        if (!q.length) return Promise.resolve();
        // ส่งทีละแอป (ctx ต่างกัน) ไม่เกิน 60 เหตุการณ์ต่อครั้ง
        const appOf = q[0].app || app, batch = q.filter(x => (x.app || app) === appOf).slice(0, 60);
        const rest = q.filter(x => batch.indexOf(x) === -1);
        let sid = '';
        try { sid = (JSON.parse(ls.get('HRPM_SID_' + appOf) || 'null') || {}).id || ''; } catch (e) { /* ไม่มีเซสชัน */ }
        const body = JSON.stringify({
            action: 'analytics.track', secret: CONFIG.API_SECRET,
            ctx: Object.assign({ app: appOf, role, vid: visitor(), sid: sid || rid(), did: typeof Guard !== 'undefined' ? Guard.device() : '' }, ENV || env()),
            events: batch.map(x => ({ t: x.t, e: x.e, p: x.p, l: x.l, v: x.v, n: x.n, u: x.u, g: x.g, d: x.d }))
        });
        saveQueue(rest);
        let sent = false;
        if (beacon && navigator.sendBeacon) {
            try { sent = navigator.sendBeacon(CONFIG.API_URL, new Blob([body], { type: 'text/plain;charset=utf-8' })); } catch (e) { sent = false; }
        }
        let done = Promise.resolve();
        if (!sent) {
            done = fetch(CONFIG.API_URL, { method: 'POST', body, keepalive: body.length < 60000, headers: { 'Content-Type': 'text/plain;charset=utf-8' } })
                .then(r => r.json()).then(r => { if (!r || r.success === false) throw new Error('rejected'); })
                .catch(() => { saveQueue(batch.concat(queue())); }); // ส่งไม่ได้: เก็บกลับเข้าคิว
        }
        if (rest.length) schedule(1500);
        return done;
    }

    function init(o) {
        app = o.app; role = o.role || '';
        ENV = env();
        ready = true;
        loadHints();
        if (!enabled()) { saveQueue([]); return; }
        visitor();
        session();
        if (firstVisit) push('first_visit', { n: 1 });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                if (visibleSince) shownMs += Date.now() - visibleSince;
                visibleSince = 0;
                leave(); flush(true);
            } else {
                visibleSince = Date.now();
                if (page) { session(); }
            }
        });
        window.addEventListener('pagehide', () => { leave(); flush(true); });
        window.addEventListener('online', () => schedule(1000));
        window.addEventListener('error', ev => track('js_error', { l: String(ev.message || '').slice(0, 80) }));
        document.addEventListener('prefchange', ev => {
            const k = ev.detail && ev.detail.key;
            if (k === 'analytics' && ev.detail.value === false) { saveQueue([]); return; }
            if (k) track('setting_change', { l: k + '=' + ev.detail.value });
        });
        schedule(4000);
    }

    return {
        init, track, page: pageView, flush,
        setRole: r => { role = r || ''; },
        setUser: u => { user = String(u || '').slice(0, 60); },
        setLocation: (lat, lng, acc) => { if (isFinite(lat) && isFinite(lng)) loc = { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, acc: Math.round(acc) || 0, at: Date.now() }; }
    };
})();
