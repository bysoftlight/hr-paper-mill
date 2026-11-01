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

    // สารบัญ: ไฮไลต์หัวข้อที่กำลังอ่าน · มือถือ: แตะหัวข้อแล้วพับสารบัญ
    const links = [...document.querySelectorAll('.toc a[href^="#"]')];
    if (links.length && 'IntersectionObserver' in window) {
        const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
        const seen = new Set();
        const io = new IntersectionObserver(entries => {
            entries.forEach(en => { if (en.isIntersecting) seen.add(en.target.id); else seen.delete(en.target.id); });
            const first = [...map.keys()].find(id => seen.has(id));
            if (first) links.forEach(a => a.classList.toggle('is-active', a === map.get(first)));
        }, { rootMargin: '-80px 0px -55% 0px' });
        map.forEach((a, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
        links.forEach(a => a.addEventListener('click', () => { const d = a.closest('details'); if (d && innerWidth < 960) d.open = false; }));
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
                if (q && ok) it.open = true;
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
