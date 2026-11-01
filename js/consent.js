// js/consent.js — แถบความยินยอมคุกกี้ (ครั้งแรกที่เปิดเว็บ) + หน้าต่าง "ตั้งค่าคุกกี้" · ใช้ทุกหน้า: index.html, staff.html, faq/terms/privacy
//   แถบล่างบางๆ: "เว็บไซต์นี้ใช้คุกกี้ นโยบายคุกกี้" · [เฉพาะที่จำเป็น] · ตั้งค่า · [ยอมรับทั้งหมด]
//   ตั้งค่า: คุกกี้ที่จำเป็น (เปิดตลอด) · คุกกี้วิเคราะห์ = สถิติการใช้งาน (เปิด/ปิดได้) → [ยกเลิก] [บันทึกการตั้งค่า]
//   ผล: HRPM_COOKIE_OK = "accepted:<เวลา>" (มีสถิติ) | "declined:<เวลา>" (เฉพาะที่จำเป็น) และซิงก์กับ ตั้งค่า › ส่งสถิติการใช้งาน
//   ยังไม่ตอบ: สถิติเก็บคิวไว้ในเครื่อง ยังไม่ส่ง (js/analytics.js) · เปิดหน้าต่างตั้งค่าอีกครั้งได้ด้วย Consent.open() หรือปุ่ม [data-cookie-settings]
const Consent = (() => {
    const KEY = 'HRPM_COOKIE_OK';
    const get = () => { try { return localStorage.getItem(KEY); } catch (e) { return '1'; } }; // อ่านไม่ได้ (โหมดส่วนตัวบางแบบ) = ไม่รบกวน
    const set = v => { try { localStorage.setItem(KEY, v); } catch (e) {} };
    // สถานะจริงอยู่ที่สวิตช์ "ส่งสถิติการใช้งาน" (เปลี่ยนจากหน้าตั้งค่าได้ด้วย)
    const statsOn = () => { try { return !(typeof Prefs !== 'undefined' && Prefs.get('analytics') === false); } catch (e) { return true; } };
    const root = document.documentElement;
    let ro = null;

    function decide(stats) {
        set((stats ? 'accepted' : 'declined') + ':' + new Date().toISOString());
        try {
            if (typeof Prefs !== 'undefined' && Prefs.set) Prefs.set('analytics', !!stats); // ซิงก์กับสวิตช์ในหน้าตั้งค่า
            if (stats && window.Analytics) { Analytics.track('cookie_consent', { l: 'accepted' }); Analytics.flush && Analytics.flush(); }
        } catch (err) {}
        hideBar();
        const d = document.getElementById('cookieModal');
        if (d && d.open) d.close();
    }

    function hideBar() {
        const bar = document.getElementById('consentBar');
        if (!bar) return;
        if (ro) { ro.disconnect(); ro = null; }
        root.classList.remove('has-consent');
        root.style.removeProperty('--consent-h');
        bar.classList.add('is-leaving');
        setTimeout(() => bar.remove(), 240);
    }

    function showBar() {
        if (document.getElementById('consentBar')) return;
        const bar = document.createElement('section');
        bar.id = 'consentBar';
        bar.className = 'consent';
        bar.setAttribute('role', 'region');
        bar.setAttribute('aria-label', 'การใช้คุกกี้');
        bar.innerHTML =
            '<p class="consent-text">เว็บไซต์นี้ใช้คุกกี้ <a href="privacy.html#cookies">นโยบายคุกกี้</a></p>' +
            '<div class="consent-actions">' +
            '<button type="button" class="consent-btn consent-no" data-consent="declined">เฉพาะที่จำเป็น</button>' +
            '<button type="button" class="consent-link" data-cookie-settings>ตั้งค่า</button>' +
            '<button type="button" class="consent-btn consent-yes" data-consent="accepted">ยอมรับทั้งหมด</button>' +
            '</div>';
        document.body.appendChild(bar);
        const sync = () => root.style.setProperty('--consent-h', bar.offsetHeight + 'px');
        root.classList.add('has-consent');
        sync();
        if (window.ResizeObserver) { ro = new ResizeObserver(sync); ro.observe(bar); } else window.addEventListener('resize', sync);
        bar.addEventListener('click', e => { const b = e.target.closest('[data-consent]'); if (b) decide(b.dataset.consent === 'accepted'); });
    }

    // ---------- หน้าต่างตั้งค่าคุกกี้ ----------
    function modal() {
        let d = document.getElementById('cookieModal');
        if (d) return d;
        d = document.createElement('dialog');
        d.id = 'cookieModal';
        d.className = 'sheet cookie-sheet';
        d.setAttribute('aria-labelledby', 'cookieTitle');
        d.innerHTML = `
            <div class="sheet-head">
                <div><h2 id="cookieTitle">ตั้งค่าคุกกี้</h2></div>
                <button type="button" class="icon-btn" data-cookie-close aria-label="ปิด"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            </div>
            <div class="sheet-body cookie-body">
                <p class="cookie-lead">เลือกประเภทคุกกี้ที่ท่านยินยอมให้เว็บไซต์ใช้งาน ท่านสามารถเปลี่ยนแปลงการตั้งค่าได้ตลอดเวลา</p>
                <p class="cookie-note">HR Paper Mill ไม่มีคุกกี้โฆษณาหรือการติดตามข้ามเว็บไซต์ ใช้เพียงคุกกี้ที่จำเป็นต่อการให้บริการ และสถิติการใช้งานเพื่อปรับปรุงระบบ อ่าน<a href="privacy.html">นโยบายความเป็นส่วนตัว</a>และ<a href="privacy.html#cookies">นโยบายคุกกี้</a></p>
                <div class="cookie-cat">
                    <div class="cookie-cat-head"><b>คุกกี้ที่จำเป็น</b><span class="cookie-badge">จำเป็น</span>
                        <label class="set-switch"><input type="checkbox" role="switch" checked disabled aria-label="คุกกี้ที่จำเป็น (เปิดตลอด)"><span aria-hidden="true"></span></label></div>
                    <p>จำการเข้าสู่ระบบ ป้องกันการเดารหัสผู้ใช้สิทธิ์ การตั้งค่าการแสดงผล และรายงานที่รอส่งเมื่อไม่มีสัญญาณ — ปิดไม่ได้เพราะจำเป็นต่อการให้บริการ</p>
                </div>
                <div class="cookie-cat">
                    <div class="cookie-cat-head"><b>คุกกี้วิเคราะห์</b><span class="cookie-sub">สถิติการใช้งาน</span>
                        <label class="set-switch"><input type="checkbox" role="switch" id="cookieStats" aria-label="คุกกี้วิเคราะห์ (สถิติการใช้งาน)"><span aria-hidden="true"></span></label></div>
                    <p>หน้าที่เปิด ปุ่มที่ใช้ อุปกรณ์ และตำแหน่งตอนส่งรายงาน (ผูกกับรหัสที่เข้าสู่ระบบ) — ใช้ปรับปรุงระบบและดูแลความปลอดภัย ไม่ส่งให้บุคคลภายนอก</p>
                </div>
            </div>
            <div class="sheet-foot cookie-foot">
                <button type="button" class="consent-btn consent-no" data-cookie-close>ยกเลิก</button>
                <button type="button" class="consent-btn consent-yes" id="cookieSave">บันทึกการตั้งค่า</button>
            </div>`;
        document.body.appendChild(d);
        d.addEventListener('click', e => {
            if (e.target.closest('[data-cookie-close]')) return d.close();
            if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); }
        });
        d.querySelector('#cookieSave').addEventListener('click', () => decide(d.querySelector('#cookieStats').checked));
        return d;
    }
    function open() {
        const d = modal();
        d.querySelector('#cookieStats').checked = get() ? statsOn() : true;
        if (!d.open) d.showModal();
    }

    document.addEventListener('click', e => { if (e.target.closest('[data-cookie-settings]')) { e.preventDefault(); open(); } });
    function start() { if (!get()) showBar(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    return { open, decided: () => !!get() };
})();
