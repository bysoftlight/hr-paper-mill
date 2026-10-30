// sw.js — Service worker: ทำให้เว็บติดตั้งเป็นแอปได้เต็มรูปแบบ
//   1) แคชไฟล์ของแอป → เปิดเร็ว และเปิดได้แม้ไม่มีสัญญาณ
//      หน้าเว็บ (HTML) ดึงจากเน็ตก่อนเสมอ (อัปเดตแล้วเห็นทันที) ไม่มีเน็ตจึงใช้ที่แคชไว้
//      ไฟล์ที่มี ?v= (css/js/รูป) ใช้จากแคชได้เลย เพราะเปลี่ยนเวอร์ชันทุกครั้งที่อัปเดต
//   2) ส่งรายงานที่ค้างในเครื่อง (js/outbox.js) เมื่อเน็ตกลับมา แม้ปิดแอปอยู่ (Background Sync — Android/Chrome)
//   3) การแจ้งเตือน (Web Push): ระบบส่ง push แบบไม่มีเนื้อหา → ดึงข้อความล่าสุดของเครื่องนี้ (notify.inbox) แล้วแสดง
const VERSION = '3.33.2';
importScripts('js/config.js?v=' + VERSION, 'js/outbox.js?v=' + VERSION);

const SHELL = 'hrpm-shell-' + VERSION;
const RUNTIME = 'hrpm-runtime';
const V = '?v=' + VERSION;
const PRECACHE = [
    './', 'index.html', 'staff.html', 'site.webmanifest', 'staff.webmanifest',
    'css/style.css' + V, 'css/staff.css' + V,
    'js/config.js' + V, 'js/utils.js' + V, 'js/glass.js' + V, 'js/analytics.js' + V, 'js/api.js' + V, 'js/settings.js' + V, 'js/charts.js' + V, 'js/notify.js' + V,
    'js/outbox.js' + V, 'js/camera.js' + V, 'js/app.js' + V, 'js/report.js' + V,
    'js/staff/core.js' + V, 'js/staff/mapkit.js' + V, 'js/staff/overview.js' + V, 'js/staff/records.js' + V, 'js/staff/participants.js' + V,
    'js/staff/admin.js' + V, 'js/staff/export.js' + V, 'js/staff/reports.js' + V, 'js/staff/analytics.js' + V,
    'img/logo.png' + V, 'img/apple-touch-icon.png', 'img/favicon.svg', 'img/favicon-50x50.png'
];

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL);
        // ทีละไฟล์: ไฟล์ใดโหลดไม่ได้ไม่ทำให้ทั้งชุดล้ม
        await Promise.all(PRECACHE.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        for (const k of await caches.keys()) if (k.startsWith('hrpm-shell-') && k !== SHELL) await caches.delete(k);
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return; // คำขอไปยัง Apps Script (POST) ไม่ยุ่ง
    const url = new URL(req.url);
    const sameOrigin = url.origin === self.location.origin;
    if (req.mode === 'navigate' && sameOrigin) return event.respondWith(networkFirst(req));
    if (sameOrigin && url.pathname.startsWith(new URL(self.registration.scope).pathname)) return event.respondWith(cacheFirst(req));
    // ฟอนต์ Google: ใช้ของในแคชก่อน แล้วอัปเดตเบื้องหลัง
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
    const cache = await caches.open(SHELL);
    try {
        const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))]);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
    } catch (e) {
        const path = new URL(req.url).pathname;
        return (await cache.match(req, { ignoreSearch: true })) ||
            (await cache.match(/staff\.html$/.test(path) ? 'staff.html' : 'index.html')) ||
            new Response('<meta charset="utf-8"><p style="font-family:sans-serif;padding:24px">ไม่มีสัญญาณอินเทอร์เน็ต กรุณาลองใหม่</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
}
async function cacheFirst(req) {
    const hit = (await caches.match(req)) || (await caches.match(req, { ignoreSearch: !new URL(req.url).search }));
    if (hit) return hit;
    try {
        const res = await fetch(req);
        if (res && res.ok) (await caches.open(new URL(req.url).search ? SHELL : RUNTIME)).put(req, res.clone());
        return res;
    } catch (e) {
        return (await caches.match(req, { ignoreSearch: true })) || Response.error();
    }
}
async function staleWhileRevalidate(req) {
    const cache = await caches.open(RUNTIME);
    const hit = await cache.match(req);
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
}

// --- ส่งรายงานที่ค้างในเครื่อง ---
self.addEventListener('sync', event => {
    if (event.tag === 'hrpm-outbox') event.waitUntil(flushOutbox());
});
async function flushOutbox() {
    const results = await Outbox.flush();
    const sent = results.filter(r => r.sent), rejected = results.filter(r => r.rejected);
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    wins.forEach(w => w.postMessage({ type: 'outbox', sent: sent.length, rejected: rejected.map(r => r.res && r.res.message) }));
    // ปิดแอปอยู่: แจ้งผลบนเครื่อง (ถ้าอนุญาตการแจ้งเตือนไว้)
    if (!wins.length && (sent.length || rejected.length) && self.Notification && Notification.permission === 'granted') {
        await self.registration.showNotification(sent.length ? 'ส่งรายงานที่ค้างไว้แล้ว' : 'ส่งรายงานที่ค้างไว้ไม่สำเร็จ', {
            body: sent.length ? `ส่งสำเร็จ ${sent.length} รายการเมื่อสัญญาณกลับมา` : (rejected[0].res && rejected[0].res.message) || 'กรุณาเปิดแอปเพื่อตรวจสอบ',
            icon: 'img/apple-touch-icon.png', tag: 'outbox', data: { url: './#history' }
        });
    }
    if (results.some(r => r.pending)) throw new Error('ยังส่งไม่ครบ'); // ให้เบราว์เซอร์ลองใหม่ภายหลัง
}
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'flush-outbox') event.waitUntil(flushOutbox().catch(() => {}));
});

self.addEventListener('push', event => {
    event.waitUntil(showLatest());
});

async function showLatest() {
    let msg = null;
    try {
        const sub = await self.registration.pushManager.getSubscription();
        if (sub) {
            const res = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'notify.inbox', secret: CONFIG.API_SECRET, endpoint: sub.endpoint })
            });
            const data = await res.json();
            if (data && data.success && data.message) msg = data.message;
        }
    } catch (e) { /* ออฟไลน์: แสดงข้อความทั่วไป */ }
    // เบราว์เซอร์บังคับให้แสดงการแจ้งเตือนทุกครั้งที่ได้รับ push
    if (!msg) msg = { title: 'HR Paper Mill', body: 'มีการแจ้งเตือนใหม่ แตะเพื่อเปิดดู', url: './', tag: 'hrpm' };
    return self.registration.showNotification(msg.title, {
        body: msg.body,
        icon: 'img/apple-touch-icon.png',
        badge: 'img/favicon-50x50.png',
        tag: msg.tag || 'hrpm',
        renotify: true,
        data: { url: msg.url || './' }
    });
}

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const url = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
    event.waitUntil((async () => {
        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const page = url.split('#')[0];
        const same = wins.find(w => w.url.split('#')[0] === page);
        if (same) { await same.focus(); if (url !== same.url && same.navigate) return same.navigate(url); return; }
        return self.clients.openWindow(url);
    })());
});
