// sw.js — Service worker สำหรับการแจ้งเตือน (Web Push) เท่านั้น ไม่แคชไฟล์เว็บ (อัปเดตเว็บแล้วเห็นทันทีเหมือนเดิม)
// ระบบส่ง push แบบไม่มีเนื้อหา → ดึงข้อความล่าสุดของเครื่องนี้จาก Apps Script (notify.inbox) แล้วแสดง
importScripts('js/config.js?v=3.16.0');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

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
