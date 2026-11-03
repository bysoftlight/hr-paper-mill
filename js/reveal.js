// js/reveal.js — ภาพเคลื่อนไหวตอนเลื่อน: การ์ด/รายการค่อยๆ ลอยขึ้นมาเมื่อเลื่อนมาถึง (ทุกหน้า)
//   • เปลี่ยนแท็บ/เปิดหน้า: ส่วนที่อยู่บนจอค่อยๆ แสดงแบบไล่ลำดับ (stagger)
//   • ส่วนที่อยู่ใต้จอ: แสดงเมื่อเลื่อนมาถึงครั้งแรก
//   • ข้อมูลอัปเดตสด (วาดใหม่ทุก 20 วิ) ที่อยู่บนจออยู่แล้ว: ไม่เล่นซ้ำ (ไม่กะพริบ)
//   • ปิดเอง: ตั้งค่า › ลดภาพเคลื่อนไหว / ระบบตั้งลดการเคลื่อนไหว / เบราว์เซอร์ไม่รองรับ IntersectionObserver
(() => {
    if (!('IntersectionObserver' in window) || !('MutationObserver' in window)) return;
    const SEL = [
        '.view .card', '.view .kpi', '.view .banner', '.view .stat', '.view .feed-item', '.view .person', '.view .threat',
        '.view .inbox-item', '.view .sv-card', '.view .news-card', '.view .prob', '.view .hist-item', '.view .cal-card',
        '.faq-item', '.faq-help', '.prose > section', '.contact-card', '.brand-foot', '.doc-head'
    ].join(',');
    const reduce = () => document.documentElement.dataset.motion === 'reduce' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    let lastShow = performance.now(); // เปิดหน้า/เปลี่ยนแท็บล่าสุด
    const WINDOW = 1400;              // ข้อมูลที่โหลดเสร็จภายในช่วงนี้หลังเปิดหน้า = เล่นภาพเคลื่อนไหว
    let batch = 0, batchAt = 0;

    const done = el => { el.classList.remove('rv', 'rv-in'); el.style.removeProperty('--rv-d'); };
    const show = (el, delay) => {
        el.style.setProperty('--rv-d', Math.min(delay, 420) + 'ms');
        requestAnimationFrame(() => el.classList.add('rv-in'));
        setTimeout(() => done(el), 900 + Math.min(delay, 420)); // คืนค่า transition เดิมของปุ่ม/การ์ด
    };
    const io = new IntersectionObserver(entries => {
        entries.forEach(en => {
            if (!en.isIntersecting) return;
            io.unobserve(en.target);
            const now = performance.now();
            if (now - batchAt > 120) { batch = 0; batchAt = now; }
            show(en.target, (batch++) * 55);
        });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });

    const inView = el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; };
    function scan(root) {
        if (reduce()) return;
        const fresh = performance.now() - lastShow < WINDOW;
        (root || document).querySelectorAll(SEL).forEach(el => {
            if (el.dataset.rv) return;
            el.dataset.rv = '1';
            if (el.closest('[hidden]') || el.closest('dialog')) { el.dataset.rv = ''; return; } // ยังไม่แสดง: รอแท็บเปิด
            if (!fresh && inView(el)) return;           // อัปเดตสดบนจอ: ไม่เล่นซ้ำ
            el.classList.add('rv');
            io.observe(el);
        });
    }
    let raf = 0;
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; scan(); }); };
    new MutationObserver(muts => {
        for (const m of muts) {
            // แท็บ (.view) เปิดขึ้นมา = เริ่มช่วงเล่นภาพเคลื่อนไหวใหม่
            if (m.type === 'attributes' && m.target.classList && (m.target.classList.contains('view') || m.target.id === 'appContainer') && !m.target.hidden) {
                lastShow = performance.now();
                m.target.querySelectorAll('[data-rv=""]').forEach(x => delete x.dataset.rv);
            }
        }
        if (muts.some(m => m.type === 'attributes' || [...m.addedNodes].some(n => n.nodeType === 1))) schedule(); // ข้อความเปลี่ยน (เช่น นาฬิกา) ไม่ต้องสแกน
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { lastShow = performance.now(); scan(); }); else scan();
    window.addEventListener('beforeprint', () => document.querySelectorAll('.rv').forEach(done));
})();
