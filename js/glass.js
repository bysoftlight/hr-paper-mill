// js/glass.js — สัมผัสแบบแอป (ใช้ร่วม: หน้าผู้ใช้สิทธิ์ · Staff)
//   1) เมนูล่าง (มือถือ): แคปซูลกระจกลอยแบบ Instagram · ไฮไลต์เลื่อนตามเมนู · เลื่อนลงแล้วแถบย่อ · หัวแอปแบบกระจกมีชื่อหน้าตรงกลาง
//   2) แผ่นข้อมูลด้านล่าง (dialog.sheet บนมือถือ): ลากที่แถบจับ/หัวแผ่นลงเพื่อปิด ตามนิ้วแบบลื่น ปล่อยแล้วเด้งกลับ
//      แผ่นที่มีฟอร์ม (กันข้อมูลหาย) และแผ่นที่ล็อกไว้ ลากได้แค่ยืดแล้วเด้งกลับ ไม่ปิด

const Glass = (() => {
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const mobile = () => !window.matchMedia || matchMedia('(max-width: 767px)').matches;
    const reduce = () => document.documentElement.dataset.motion === 'reduce' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (ios) document.documentElement.dataset.platform = 'ios';

    // ---------- 1) เมนูล่าง: แคปซูลเลื่อน ----------
    function initNav() {
        const nav = document.querySelector('.bottomnav');
        if (!nav) return;
        const pill = document.createElement('i');
        pill.className = 'nav-pill';
        pill.setAttribute('aria-hidden', 'true');
        nav.prepend(pill);
        nav.classList.add('has-pill');
        let first = true;
        const place = () => {
            const cur = nav.querySelector('.nav-item[aria-current="page"]:not([hidden])');
            if (!cur || !nav.offsetWidth) { pill.style.opacity = '0'; return; }
            const ic = cur.querySelector('.ic') || cur;
            const n = nav.getBoundingClientRect(), r = ic.getBoundingClientRect();
            const ph = pill.offsetHeight || 32, labels = document.documentElement.dataset.navlabels === 'on' && mobile();
            const w = mobile() ? cur.offsetWidth - 6 : Math.min(64, cur.offsetWidth - 8);
            const cy = labels ? cur.getBoundingClientRect().top + cur.offsetHeight / 2 : r.top + r.height / 2;
            const x = (mobile() ? cur.getBoundingClientRect().left + 3 : r.left + r.width / 2 - w / 2) - n.left - nav.clientLeft, y = cy - n.top - nav.clientTop - ph / 2;
            if (first || reduce()) pill.style.transition = 'none';
            pill.style.width = w + 'px';
            pill.style.transform = `translate(${x}px, ${y}px)`;
            pill.style.opacity = '1';
            if (first || reduce()) { void pill.offsetWidth; pill.style.transition = ''; }
            first = false;
        };
        new MutationObserver(() => { place(); title(); }).observe(nav, { subtree: true, attributes: true, attributeFilter: ['aria-current', 'hidden'] });
        document.addEventListener('prefchange', () => requestAnimationFrame(place));
        // หัวแอปแบบกระจก: ชื่อหน้าปัจจุบันตรงกลาง
        const bar = document.querySelector('.topbar');
        let t = null;
        if (bar) { t = document.createElement('span'); t.className = 'topbar-title'; t.setAttribute('aria-hidden', 'true'); bar.querySelector('.brand') ? bar.querySelector('.brand').after(t) : bar.prepend(t); }
        const title = () => { if (!t) return; const cur = nav.querySelector('.nav-item[aria-current="page"]'); t.textContent = cur ? (cur.textContent || '').trim() : ''; };
        title();
        // เลื่อนลง = แถบย่อ · เลื่อนขึ้น/ใกล้บนสุด/ใกล้ล่างสุด = ขยายกลับ (แบบ Instagram)
        let lastY = window.scrollY, acc = 0;
        window.addEventListener('scroll', () => {
            const y = window.scrollY, dy = y - lastY; lastY = y;
            if (!mobile()) return;
            acc = Math.sign(dy) === Math.sign(acc) ? acc + dy : dy;
            const nearEnd = y + innerHeight > document.documentElement.scrollHeight - 40;
            const min = y > 80 && acc > 24 && !nearEnd;
            if (min || acc < -12 || y < 40 || nearEnd) document.documentElement.classList.toggle('nav-min', min);
        }, { passive: true });
        nav.addEventListener('click', () => document.documentElement.classList.remove('nav-min'));
        window.addEventListener('resize', place);
        if (window.ResizeObserver) new ResizeObserver(place).observe(nav);
        requestAnimationFrame(place);
    }

    // ---------- 2) แผ่นด้านล่าง: ลากลงเพื่อปิด ----------
    const EASE = 'cubic-bezier(.32,.72,0,1)'; // เส้นโค้งแบบแผ่นของ iOS/Claude
    function canDismiss(dlg) { return !dlg.dataset.locked && !dlg.querySelector('form.sheet-form') && !dlg.hasAttribute('data-nodrag'); }
    function closeSheet(dlg) {
        const ev = new Event('cancel', { cancelable: true });
        dlg.dispatchEvent(ev);
        if (!ev.defaultPrevented && dlg.open) dlg.close();
    }
    function animateOut(dlg, from) {
        const h = dlg.getBoundingClientRect().height + 40;
        dlg.style.transition = reduce() ? 'none' : `transform .26s ${EASE}`;
        dlg.style.transform = `translateY(${h}px)`;
        dlg.style.setProperty('--sheet-drag', '1');
        setTimeout(() => { closeSheet(dlg); dlg.style.transition = dlg.style.transform = ''; dlg.style.removeProperty('--sheet-drag'); dlg.classList.remove('is-dragging'); }, reduce() ? 0 : 240);
    }
    function springBack(dlg) {
        dlg.style.transition = reduce() ? 'none' : `transform .42s ${EASE}`;
        dlg.style.transform = '';
        dlg.style.removeProperty('--sheet-drag');
        setTimeout(() => { dlg.style.transition = ''; dlg.classList.remove('is-dragging'); }, 430);
    }
    function attach(dlg) {
        if (dlg._glass) return;
        dlg._glass = true;
        if (!dlg.querySelector(':scope > .sheet-grip')) {
            const g = document.createElement('div');
            g.className = 'sheet-grip';
            g.setAttribute('aria-hidden', 'true');
            dlg.prepend(g);
        }
        let start = null;
        const body = () => dlg.querySelector('.sheet-body');
        dlg.addEventListener('touchstart', e => {
            if (!mobile() || e.touches.length !== 1) return;
            const t = e.target;
            const onHandle = t.closest('.sheet-grip, .sheet-head');
            const b = body();
            // ลากจากเนื้อหาได้เมื่อเลื่อนอยู่บนสุดแล้ว (เหมือนแอป)
            const fromTop = b && b.contains(t) && b.scrollTop <= 0;
            if (!onHandle && !fromTop) return;
            if (t.closest('input, textarea, select, button, a, [contenteditable], .leaflet-container')) return;
            start = { y: e.touches[0].clientY, t: performance.now(), dy: 0, last: e.touches[0].clientY, lt: performance.now(), v: 0, active: false, fromTop: !onHandle };
        }, { passive: true });
        dlg.addEventListener('touchmove', e => {
            if (!start) return;
            const y = e.touches[0].clientY, now = performance.now();
            let dy = y - start.y;
            if (!start.active) {
                if (Math.abs(dy) < 6) return;
                if (dy < 0) { start = null; return; } // ลากขึ้น = เลื่อนเนื้อหาตามปกติ
                start.active = true;
                dlg.classList.add('is-dragging');
                dlg.style.transition = 'none';
            }
            if (e.cancelable) e.preventDefault();
            start.v = (y - start.last) / Math.max(1, now - start.lt);
            start.last = y; start.lt = now;
            // ปิดไม่ได้: ยืดแบบหนืด (ยิ่งลากยิ่งตึง)
            const shown = canDismiss(dlg) ? dy : 40 * Math.log1p(dy / 40);
            start.dy = dy;
            dlg.style.transform = `translateY(${Math.max(0, shown)}px)`;
            dlg.style.setProperty('--sheet-drag', String(Math.min(1, Math.max(0, shown) / (dlg.offsetHeight || 400))));
        }, { passive: false });
        const end = () => {
            if (!start) return;
            const s = start; start = null;
            if (!s.active) return;
            const h = dlg.offsetHeight || 400;
            if (canDismiss(dlg) && (s.dy > Math.max(90, Math.min(160, h * 0.33)) || (s.v > 0.6 && s.dy > 24))) animateOut(dlg);
            else springBack(dlg);
        };
        dlg.addEventListener('touchend', end);
        dlg.addEventListener('touchcancel', end);
    }
    function initSheets() {
        const scan = root => (root.querySelectorAll ? root.querySelectorAll('dialog.sheet') : []).forEach(attach);
        scan(document);
        new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches('dialog.sheet')) attach(n); scan(n); } })))
            .observe(document.body, { childList: true, subtree: true });
    }

    function init() { initNav(); initSheets(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    return { ios, attach, closeSheet };
})();
