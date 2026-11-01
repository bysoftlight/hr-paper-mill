// js/consent.js — แถบแจ้งการใช้คุกกี้ (ครั้งแรกที่เปิดเว็บ) · ใช้ทุกหน้า: index.html, staff.html, privacy/terms/faq
// เก็บว่ารับทราบแล้วในเครื่อง (HRPM_COOKIE_OK) · แถบอยู่ล่างสุดของจอ เมนูล่าง/ข้อความแจ้งเตือนจะเลื่อนขึ้นตามความสูงของแถบ (--consent-h)
(() => {
    const KEY = 'HRPM_COOKIE_OK';
    const get = () => { try { return localStorage.getItem(KEY); } catch (e) { return '1'; } }; // อ่านไม่ได้ (โหมดส่วนตัวบางแบบ) = ไม่รบกวน
    const set = v => { try { localStorage.setItem(KEY, v); } catch (e) {} };
    if (get()) return;

    function show() {
        if (document.getElementById('consentBar')) return;
        const base = (document.querySelector('meta[name="hrpm-base"]') || {}).content || '';
        const bar = document.createElement('section');
        bar.id = 'consentBar';
        bar.className = 'consent';
        bar.setAttribute('role', 'region');
        bar.setAttribute('aria-label', 'การใช้คุกกี้');
        bar.innerHTML =
            '<p>เว็บไซต์นี้ใช้คุกกี้และพื้นที่จัดเก็บข้อมูลในเครื่อง เพื่อให้บริการ จดจำการเข้าสู่ระบบ และวิเคราะห์การใช้งานเพื่อปรับปรุงคุณภาพของระบบ</p>' +
            '<div class="consent-actions">' +
            '<a href="' + base + 'privacy.html#cookies" class="consent-btn">ดูข้อมูลเพิ่มเติม</a>' +
            '<button type="button" class="consent-btn" data-consent-ok>รับทราบ</button>' +
            '</div>';
        document.body.appendChild(bar);
        const root = document.documentElement;
        const sync = () => root.style.setProperty('--consent-h', bar.offsetHeight + 'px');
        root.classList.add('has-consent');
        sync();
        let ro = null;
        if (window.ResizeObserver) { ro = new ResizeObserver(sync); ro.observe(bar); } else window.addEventListener('resize', sync);
        bar.querySelector('[data-consent-ok]').addEventListener('click', () => {
            set(new Date().toISOString());
            if (ro) ro.disconnect();
            root.classList.remove('has-consent');
            root.style.removeProperty('--consent-h');
            bar.classList.add('is-leaving');
            setTimeout(() => bar.remove(), 220);
            try { if (window.Analytics && Analytics.track) Analytics.track('cookie_ack'); } catch (e) {}
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();
