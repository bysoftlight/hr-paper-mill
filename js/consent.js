// js/consent.js — การ์ดขอความยินยอมคุกกี้ (ครั้งแรกที่เปิดเว็บ) · ใช้ทุกหน้า: index.html, staff.html, faq/terms/privacy
//   ยอมรับทั้งหมด = เปิด "ส่งสถิติการใช้งาน" · ปฏิเสธ = ปิดสถิติ (คุกกี้/ข้อมูลในเครื่องที่จำเป็นต่อการเข้าสู่ระบบยังทำงาน)
//   บันทึกคำตอบไว้ในเครื่อง HRPM_COOKIE_OK = "accepted:<เวลา>" | "declined:<เวลา>" (ค่าเก่าที่เป็นวันที่ = ยอมรับ) · เปลี่ยนใจได้ที่ ตั้งค่า › ส่งสถิติการใช้งาน
//   ยังไม่ตอบ: สถิติเก็บคิวไว้ในเครื่อง ยังไม่ส่ง (js/analytics.js)
(() => {
    const KEY = 'HRPM_COOKIE_OK';
    const get = () => { try { return localStorage.getItem(KEY); } catch (e) { return '1'; } }; // อ่านไม่ได้ (โหมดส่วนตัวบางแบบ) = ไม่รบกวน
    const set = v => { try { localStorage.setItem(KEY, v); } catch (e) {} };
    if (get()) return;

    function show() {
        if (document.getElementById('consentBar')) return;
        const bar = document.createElement('section');
        bar.id = 'consentBar';
        bar.className = 'consent';
        bar.setAttribute('role', 'dialog');
        bar.setAttribute('aria-labelledby', 'consentTitle');
        bar.setAttribute('aria-describedby', 'consentText');
        bar.innerHTML =
            '<h2 id="consentTitle">เราใช้คุกกี้เพื่อพัฒนาประสบการณ์การใช้งาน</h2>' +
            '<p id="consentText">HR Paper Mill ใช้คุกกี้และพื้นที่จัดเก็บข้อมูลในเครื่องที่จำเป็นต่อการเข้าสู่ระบบและการส่งรายงาน และใช้สถิติการใช้งานเพื่อปรับปรุงระบบ คุณสามารถยอมรับหรือปฏิเสธสถิติการใช้งานได้ โดยศึกษารายละเอียดเพิ่มเติมที่ <a href="privacy.html#cookies">นโยบายความเป็นส่วนตัว</a></p>' +
            '<div class="consent-actions">' +
            '<button type="button" class="consent-btn consent-no" data-consent="declined">ปฏิเสธ</button>' +
            '<button type="button" class="consent-btn consent-yes" data-consent="accepted">ยอมรับทั้งหมด</button>' +
            '</div>';
        document.body.appendChild(bar);
        const root = document.documentElement;
        const sync = () => root.style.setProperty('--consent-h', (bar.offsetHeight + 24) + 'px');
        root.classList.add('has-consent');
        sync();
        let ro = null;
        if (window.ResizeObserver) { ro = new ResizeObserver(sync); ro.observe(bar); } else window.addEventListener('resize', sync);
        bar.addEventListener('click', e => {
            const b = e.target.closest('[data-consent]');
            if (!b) return;
            const choice = b.dataset.consent;
            set(choice + ':' + new Date().toISOString());
            try {
                if (typeof Prefs !== 'undefined' && Prefs.set) Prefs.set('analytics', choice === 'accepted'); // ซิงก์กับสวิตช์ในหน้าตั้งค่า
                if (choice === 'accepted' && window.Analytics) { Analytics.track('cookie_consent', { l: 'accepted' }); Analytics.flush && Analytics.flush(); }
            } catch (err) {}
            if (ro) ro.disconnect();
            root.classList.remove('has-consent');
            root.style.removeProperty('--consent-h');
            bar.classList.add('is-leaving');
            setTimeout(() => bar.remove(), 240);
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();
