// js/legal.js — หน้าข้อมูล (ข้อกำหนด / นโยบาย / คำถามที่พบบ่อย): ปุ่มย้อนกลับ · สารบัญไฮไลต์ตามที่อ่าน · ค้นหาคำถาม
(() => {
    const $ = s => document.querySelector(s);
    // ย้อนกลับ: มาจากหน้าในเว็บนี้ = กลับไปหน้าเดิม (ไม่เสียสถานะ) · เปิดตรง/จากแอปบนหน้าจอโฮม = ไปหน้าแรก
    const back = $('[data-back]');
    if (back) back.addEventListener('click', e => {
        let same = false;
        try { same = document.referrer && new URL(document.referrer).origin === location.origin; } catch (err) {}
        if (same && history.length > 1) { e.preventDefault(); history.back(); }
    });

    // เมนูบนจอแคบเลื่อนแนวนอนได้: ให้หน้าปัจจุบันอยู่ในจอ · ขอบที่ยังมีเมนูซ่อนอยู่จางลง
    const cur = $('.doc-bar nav a[aria-current="page"]'), nav = cur && cur.parentElement;
    if (nav && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = cur.offsetLeft - nav.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2;
    const fade = () => { if (!nav) return; const max = nav.scrollWidth - nav.clientWidth; nav.style.setProperty('--fade-l', nav.scrollLeft > 2 ? '24px' : '0px'); nav.style.setProperty('--fade-r', max - nav.scrollLeft > 2 ? '24px' : '0px'); };
    if (nav) { nav.addEventListener('scroll', fade, { passive: true }); window.addEventListener('resize', fade); fade(); }

    // สารบัญ: ไฮไลต์หัวข้อที่กำลังอ่าน
    //   คำนวณจากตำแหน่งเลื่อน: หัวข้อสุดท้ายที่ผ่านเส้นอ่าน (ใต้แถบบน) · เลื่อนสุดหน้าแล้ว = หัวข้อท้ายๆ ที่ขึ้นไปไม่ถึงเส้นอ่านได้
    //   แตะในสารบัญ: ไฮไลต์หัวข้อนั้นทันที และคงไว้ระหว่างเลื่อนไปหา (หัวข้อท้ายหน้าที่เลื่อนขึ้นไปไม่สุดก็ยังไฮไลต์ถูก)
    const links = [...document.querySelectorAll('.toc a[href^="#"]')];
    if (links.length) {
        const secs = links.map(a => document.getElementById(a.getAttribute('href').slice(1)));
        let pinned = null, pinUntil = 0;
        const setActive = i => links.forEach((a, k) => { a.classList.toggle('is-active', k === i); if (k === i) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
        const compute = () => {
            if (pinned !== null && Date.now() < pinUntil) return setActive(pinned);
            pinned = null;
            const line = 96 + 8, doc = document.documentElement;
            let idx = 0;
            secs.forEach((sec, i) => { if (sec && sec.getBoundingClientRect().top <= line) idx = i; });
            // เลื่อนสุดหน้า: หัวข้อท้ายที่มองเห็นอยู่บนจอ (ขึ้นไปถึงเส้นอ่านไม่ได้เพราะหน้าหมดแล้ว)
            if (window.scrollY + innerHeight >= doc.scrollHeight - 4) {
                for (let i = secs.length - 1; i > idx; i--) { const r = secs[i] && secs[i].getBoundingClientRect(); if (r && r.top < innerHeight * .6) { idx = i; break; } }
            }
            setActive(idx);
        };
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; compute(); }); }
        }, { passive: true });
        // ผู้ใช้เลื่อนเอง (ล้อเมาส์ / นิ้ว / ปุ่มคีย์บอร์ด / ลากแถบเลื่อน) = เลิกคงไฮไลต์ที่แตะไว้ คำนวณตามตำแหน่งจริง
        const release = e => { if (pinned === null || (e && e.target && e.target.closest && e.target.closest('.toc'))) return; pinned = null; requestAnimationFrame(compute); };
        ['wheel', 'touchmove', 'keydown', 'pointerdown'].forEach(ev => window.addEventListener(ev, release, { passive: true }));
        window.addEventListener('resize', compute);
        links.forEach((a, i) => a.addEventListener('click', () => {
            pinned = i; pinUntil = Date.now() + 6000; setActive(i); // คงไว้จนกว่าผู้ใช้จะเลื่อนเอง (สูงสุด 6 วิ)
            const d = a.closest('details'); if (d && innerWidth < 960) d.open = false;
        }));
        // เปิดหน้าพร้อม #หัวข้อ: ไฮไลต์หัวข้อนั้น
        const hashIdx = links.findIndex(a => a.getAttribute('href') === location.hash);
        if (hashIdx !== -1) { pinned = hashIdx; pinUntil = Date.now() + 6000; }
        compute();
    }
    const toc = $('.toc details');
    if (toc && innerWidth >= 960) toc.open = true;

    // FAQ: ค้นหา + หมวด · เปิดคำถามจากลิงก์ (#faq-xxx)
    const search = $('#faqSearch');
    if (search) {
        const items = [...document.querySelectorAll('.faq-item')];
        const groups = [...document.querySelectorAll('.faq-group')];
        const cats = $('.faq-cats');
        let cat = 'all';
        items.forEach(it => { it.dataset.text = it.textContent.toLowerCase(); });
        const apply = () => {
            const q = search.value.trim().toLowerCase();
            let shown = 0;
            items.forEach(it => {
                const ok = (cat === 'all' || it.closest('.faq-group').dataset.cat === cat) && (!q || q.split(/\s+/).every(w => it.dataset.text.includes(w)));
                it.hidden = !ok; if (ok) shown++;
            });
            groups.forEach(g => { g.hidden = !g.querySelector('.faq-item:not([hidden])'); });
            $('#faqEmpty').hidden = shown > 0;
        };
        search.addEventListener('input', apply);
        if (cats) cats.addEventListener('click', e => {
            const b = e.target.closest('[data-cat]'); if (!b) return;
            cat = b.dataset.cat;
            cats.querySelectorAll('[data-cat]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
            apply();
        });
        // เปิดได้ทีละคำถาม: เปิดคำถามใหม่ = ปิดคำถามที่เปิดอยู่ (เบราว์เซอร์ใหม่ใช้ <details name> เอง · รุ่นเก่าใช้โค้ดนี้)
        items.forEach(it => it.addEventListener('toggle', () => { if (it.open) items.forEach(o => { if (o !== it && o.open) o.open = false; }); }));
        const openHash = () => { const t = location.hash && document.getElementById(location.hash.slice(1)); if (t && t.classList.contains('faq-item')) { t.open = true; t.scrollIntoView({ block: 'center' }); } };
        openHash();
        window.addEventListener('hashchange', openHash);
    }

    // ท้ายหน้า: ลิงก์ที่ขึ้นบรรทัดใหม่ไม่ต้องมีจุดคั่นนำหน้า
    const tidy = () => document.querySelectorAll('.foot-links').forEach(nav => { // ดู tidyFootLinks ใน utils.js
        nav.querySelectorAll('.foot-br').forEach(br => br.remove());
        let prev = null;
        [...nav.children].filter(el => { const t = el.offsetTop, st = prev !== null && t > prev + 4; prev = t; return st; })
            .forEach(el => { const br = document.createElement('span'); br.className = 'foot-br'; br.setAttribute('aria-hidden', 'true'); nav.insertBefore(br, el); });
    });
    tidy(); window.addEventListener('resize', tidy); window.addEventListener('load', tidy);
})();
