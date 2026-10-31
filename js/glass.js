// js/glass.js — สัมผัสแบบแอป (ใช้ร่วม: หน้าผู้ใช้สิทธิ์ · Staff)
//   1) เมนูล่าง (มือถือ): แคปซูลกระจกลอยแบบ Instagram · ไฮไลต์เลื่อนตามเมนู · เลื่อนลงแล้วแถบย่อ · หัวแอปแบบกระจกมีชื่อหน้าตรงกลาง
//   2) แผ่นข้อมูลด้านล่าง (dialog.sheet บนมือถือ): ลากที่แถบจับ/หัวแผ่นลงเพื่อปิด ตามนิ้วแบบลื่น ปล่อยแล้วเด้งกลับ
//      แผ่นที่มีฟอร์ม (กันข้อมูลหาย) และแผ่นที่ล็อกไว้ ลากได้แค่ยืดแล้วเด้งกลับ ไม่ปิด

const Glass = (() => {
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const mobile = () => !window.matchMedia || matchMedia('(max-width: 767px)').matches;
    const landscape = () => !!window.matchMedia && matchMedia('(max-width: 767px) and (orientation: landscape) and (max-height: 500px)').matches; // แนวนอน: แถบซ่อนเมื่อเลื่อนลง
    const reduce = () => document.documentElement.dataset.motion === 'reduce' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (ios) document.documentElement.dataset.platform = 'ios';

    // ---------- 1) เมนูล่าง: แคปซูลเลื่อน ----------
    function initNav() {
        const nav = document.querySelector('.bottomnav');
        if (!nav) return;
        const root = document.documentElement;
        const pill = document.createElement('i');
        pill.className = 'nav-pill';
        pill.setAttribute('aria-hidden', 'true');
        nav.prepend(pill);
        nav.classList.add('has-pill');
        const items = () => [...nav.querySelectorAll('.nav-item:not([hidden])')];
        const current = () => nav.querySelector('.nav-item[aria-current="page"]:not([hidden])');
        // ตำแหน่งคิดจาก offsetLeft/offsetTop (ผังจริง) ไม่ใช้ getBoundingClientRect — แถบถูกย่อ/ขยายด้วย transform อยู่
        // จึงไม่เพี้ยนระหว่างแอนิเมชัน (สาเหตุที่ไฮไลต์ "หลุด" เวลากดตอนแถบกำลังย่อ/ขยาย)
        const geom = el => {
            const ph = pill.offsetHeight || 32;
            const w = mobile() ? Math.min(76, el.offsetWidth - 4) : Math.min(64, el.offsetWidth - 8); // ไฮไลต์กว้างคงที่แบบ IG ไม่ยืดตามช่องเมนู
            const x = el.offsetLeft + (el.offsetWidth - w) / 2;
            let y;
            if (mobile()) y = el.offsetTop + (el.offsetHeight - ph) / 2;
            else { const ic = el.querySelector('.ic') || el; y = el.offsetTop + ic.offsetTop + ic.offsetHeight / 2 - ph / 2; }
            return { w, x, y };
        };
        const moveTo = (x, y, w, animate) => {
            pill.style.transition = animate && !reduce() ? '' : 'none';
            pill.style.width = w + 'px';
            pill.style.transform = `translate(${x}px, ${y}px) scale(var(--pill-sx, 1), var(--pill-sy, 1))`; // ขยายรอบจุดกลางของวงเอง (ไม่ใช้ CSS scale: ที่ยืดออกจากมุมซ้ายของแถบ)
            if (!animate || reduce()) { void pill.offsetWidth; pill.style.transition = ''; }
        };
        let placed = false, scrubbing = false;
        const place = () => {
            if (scrubbing) return;
            const cur = current();
            if (!cur || !nav.offsetWidth) { pill.style.opacity = '0'; return; }
            const g = geom(cur);
            moveTo(g.x, g.y, g.w, placed);
            pill.style.opacity = '1';
            placed = true;
        };
        let raf = 0;
        const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };

        // หัวแอปแบบกระจก: ชื่อหน้าปัจจุบันตรงกลาง
        const bar = document.querySelector('.topbar');
        let t = null;
        if (bar) { t = document.createElement('span'); t.className = 'topbar-title'; t.setAttribute('aria-hidden', 'true'); const b = bar.querySelector('.brand'); b ? b.after(t) : bar.prepend(t); }
        const title = () => {
            if (!t) return;
            const cur = current(), lab = cur && [...cur.querySelectorAll(':scope > span')].find(x => !x.classList.contains('nav-badge'));
            t.textContent = lab ? lab.textContent.trim() : '';
        };
        new MutationObserver(() => { schedule(); title(); }).observe(nav, { subtree: true, attributes: true, attributeFilter: ['aria-current', 'hidden'] });
        document.addEventListener('prefchange', schedule);
        window.addEventListener('resize', schedule);
        if (window.ResizeObserver) new ResizeObserver(schedule).observe(nav);
        title();
        schedule();

        // ลากนิ้วบนแถบ (แบบ Instagram): ไฮไลต์ตามนิ้ว ปล่อยแล้วเปิดเมนูที่อยู่ใต้นิ้ว · แตะธรรมดาทำงานแบบเดิม
        // นิ้ว = Touch Events (iOS Safari: pointer events ของนิ้วถูก "จับ" ไว้กับปุ่มแรกที่แตะ แล้วโดนยกเลิกกลางทาง)
        // เมาส์/ปากกา = Pointer Events · ขยับไฮไลต์ใน requestAnimationFrame ครั้งละเฟรม ไม่บังคับคำนวณผังซ้ำ (ไม่กระตุก)
        let drag = null, dragRaf = 0;
        const itemAt = x => {
            const list = items(), r = nav.getBoundingClientRect(), k = r.width / nav.offsetWidth || 1; // k = สัดส่วนตอนแถบถูกย่อ
            const lx = (x - r.left) / k;
            return list.reduce((best, el) => Math.abs(el.offsetLeft + el.offsetWidth / 2 - lx) < Math.abs(best.offsetLeft + best.offsetWidth / 2 - lx) ? el : best, list[0]);
        };
        const startDrag = (x, y) => {
            if (!mobile()) return;
            drag = { x0: x, y0: y, x, on: false };
            nav.classList.add('is-pressing');
            root.classList.remove('nav-min');
        };
        const paint = () => {
            dragRaf = 0;
            if (!drag || !drag.on) return;
            const r = nav.getBoundingClientRect(), k = r.width / nav.offsetWidth || 1;
            const w = pill.offsetWidth, cur = current();
            const m = Math.ceil(w * 0.07) + 4; // เผื่อขนาดตอนวงพองขณะลาก ไม่ให้ล้นขอบแถบทั้งซ้ายและขวา
            const lx = Math.min(nav.clientWidth - w - m, Math.max(m, (drag.x - r.left) / k - w / 2));
            pill.style.transform = `translate(${lx}px, ${cur ? geom(cur).y : 0}px) scale(var(--pill-sx, 1), var(--pill-sy, 1))`;
            const over = itemAt(drag.x);
            if (over !== drag.over) { items().forEach(el => el.classList.toggle('is-hover', el === over)); drag.over = over; }
        };
        const moveDrag = (x, y) => {
            if (!drag) return false;
            drag.x = x;
            if (!drag.on) {
                const dx = Math.abs(x - drag.x0), dy = Math.abs(y - drag.y0);
                if (dx < 8 || dy > dx) return false;
                drag.on = scrubbing = true;
                nav.classList.add('is-scrubbing');
            }
            if (!dragRaf) dragRaf = requestAnimationFrame(paint);
            return true;
        };
        const endDrag = (x, commit) => {
            if (!drag) return;
            const d = drag; drag = null; scrubbing = false;
            cancelAnimationFrame(dragRaf); dragRaf = 0;
            nav.classList.remove('is-pressing', 'is-scrubbing');
            items().forEach(el => el.classList.remove('is-hover'));
            if (d.on && commit) {
                const over = itemAt(x == null ? d.x : x);
                if (over && over.getAttribute('aria-current') !== 'page') { if (typeof haptic === 'function') haptic(); over.click(); }
                nav._justScrubbed = true; setTimeout(() => { nav._justScrubbed = false; }, 50);
                place(); return;
            }
            place();
        };
        if ('ontouchstart' in window) {
            nav.addEventListener('touchstart', e => { if (e.touches.length === 1) startDrag(e.touches[0].clientX, e.touches[0].clientY); else endDrag(null, false); }, { passive: true });
            nav.addEventListener('touchmove', e => { if (moveDrag(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault(); }, { passive: false });
            nav.addEventListener('touchend', e => { const t = e.changedTouches[0]; const was = drag && drag.on; endDrag(t ? t.clientX : null, true); if (was && e.cancelable) e.preventDefault(); /* ลากแล้วไม่ต้องมี click ซ้ำ */ });
            nav.addEventListener('touchcancel', () => endDrag(null, false));
        }
        nav.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch' && e.button === 0) startDrag(e.clientX, e.clientY); });
        window.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') moveDrag(e.clientX, e.clientY); });
        window.addEventListener('pointerup', e => { if (e.pointerType !== 'touch' && drag) endDrag(e.clientX, true); });
        // ลากเมาส์เสร็จแล้วเบราว์เซอร์จะส่ง click ให้ปุ่มเดิม: กันไม่ให้เปิดเมนูผิด
        nav.addEventListener('click', e => { if (nav._justScrubbed) { e.stopPropagation(); e.preventDefault(); } }, true);

        // เลื่อนลงต่อเนื่อง = แถบย่อ · เลื่อนขึ้น / ใกล้บนสุด / สุดหน้า / แตะแถบ = ขยายกลับ
        // มีระยะกันสั่น: ต้องเลื่อนทางเดียวกันสะสมพอ (ลง 60px / ขึ้น 24px) จึงเปลี่ยน — ไม่กะพริบไปมา
        let lastY = window.scrollY, acc = 0, ticking = false;
        const onScroll = () => {
            ticking = false;
            const y = window.scrollY, dy = y - lastY; lastY = y;
            if (!mobile() || drag || !dy) return;
            acc = (dy > 0) === (acc > 0) ? acc + dy : dy;
            const doc = document.documentElement, nearEnd = y + innerHeight > doc.scrollHeight - 60, short = doc.scrollHeight < innerHeight + 200;
            const isMin = root.classList.contains('nav-min');
            if (!isMin && acc > 60 && y > 120 && !nearEnd && !short) root.classList.add('nav-min');
            else if (isMin && (acc < (landscape() ? -10 : -24) || y < 60 || nearEnd)) root.classList.remove('nav-min');
        };
        window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
        // เปลี่ยนหน้า = เริ่มที่แถบเต็ม
        new MutationObserver(() => root.classList.remove('nav-min')).observe(nav, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
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
