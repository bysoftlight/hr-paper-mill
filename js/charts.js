// js/charts.js — กราฟ SVG น้ำหนักเบา (ไม่พึ่งไลบรารีภายนอก) ใช้ร่วมกันทั้งหน้าผู้ใช้สิทธิ์และหน้า Staff
//   Charts.bars(el, opts)  — แท่ง (ซ้อนได้) แท่งที่ชี้/แตะเป็นสีเข้ม พร้อมป้ายข้อมูล + เส้นประ
//   Charts.area(el, opts)  — เส้นโค้งนุ่ม + พื้นไล่สี หลายชุด (เช่น เดือนนี้ vs เดือนก่อน)
//   Charts.gauge(el, opts) — ครึ่งวงกลมแบบแบ่งช่วง
// วาดใหม่อัตโนมัติเมื่อขนาดกล่องเปลี่ยน หรือเปลี่ยนธีม/สี

const Charts = (() => {
    const NS = 'http://www.w3.org/2000/svg';
    const registry = new Map();
    const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const reduced = () => (typeof Prefs !== 'undefined' && Prefs.get('motion')) || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = n => Number(n).toLocaleString('th-TH');

    const ro = window.ResizeObserver ? new ResizeObserver(entries => entries.forEach(e => {
        const r = registry.get(e.target);
        if (r && Math.abs(e.contentRect.width - r.width) > 2) draw(e.target, r.kind, r.opts, false);
    })) : null;
    const redrawAll = () => registry.forEach((r, el) => { if (el.isConnected) draw(el, r.kind, r.opts, false); else registry.delete(el); });
    document.addEventListener('prefchange', e => { if (!e.detail.key || e.detail.key === 'theme') setTimeout(redrawAll, 30); });
    if (window.matchMedia) { const mq = matchMedia('(prefers-color-scheme: dark)'); (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(() => setTimeout(redrawAll, 30)); }

    function draw(el, kind, opts, animate) {
        const width = Math.max(120, el.clientWidth || 300);
        registry.set(el, { kind, opts, width });
        if (ro) ro.observe(el);
        el.classList.add('chart');
        el.innerHTML = '';
        ({ bars: drawBars, area: drawArea, gauge: drawGauge })[kind](el, opts, width, animate && !reduced());
    }

    function svg(w, h) {
        const s = document.createElementNS(NS, 'svg');
        s.setAttribute('viewBox', `0 0 ${w} ${h}`);
        s.setAttribute('width', w); s.setAttribute('height', h);
        s.setAttribute('role', 'img');
        return s;
    }
    function node(tag, attrs, parent) {
        const n = document.createElementNS(NS, tag);
        Object.keys(attrs).forEach(k => n.setAttribute(k, attrs[k]));
        if (parent) parent.appendChild(n);
        return n;
    }
    function niceMax(v) {
        if (v <= 4) return 4;
        const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
        return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
    }
    function tooltipEl(el) {
        const t = document.createElement('div');
        t.className = 'chart-tip';
        t.hidden = true;
        el.appendChild(t);
        return t;
    }
    function placeTip(el, tip, x, y, html) {
        tip.innerHTML = html;
        tip.hidden = false;
        const w = tip.offsetWidth, W = el.clientWidth;
        tip.style.left = Math.max(0, Math.min(W - w, x - w / 2)) + 'px';
        tip.style.top = Math.max(0, y - tip.offsetHeight - 10) + 'px';
    }
    // ชี้/แตะ/ลากบนกราฟ → index ที่ใกล้ที่สุด
    function track(el, area, count, xOf, onPick, onLeave) {
        const pick = e => {
            const r = area.getBoundingClientRect();
            const x = (e.clientX - r.left) * (area.viewBox ? area.viewBox.baseVal.width / r.width : 1);
            let best = 0, bd = Infinity;
            for (let i = 0; i < count; i++) { const d = Math.abs(xOf(i) - x); if (d < bd) { bd = d; best = i; } }
            onPick(best);
        };
        area.addEventListener('pointermove', pick);
        area.addEventListener('pointerdown', pick);
        area.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') onLeave(); });
        el.tabIndex = 0;
        let kb = -1;
        el.addEventListener('keydown', e => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            kb = Math.max(0, Math.min(count - 1, (kb < 0 ? count - 1 : kb) + (e.key === 'ArrowRight' ? 1 : -1)));
            onPick(kb);
        });
        el.addEventListener('blur', onLeave);
    }

    // ---------- แท่ง ----------
    // opts: { labels, series: [{ label, values, color }], height, active (index ที่ไฮไลต์ตอนเริ่ม), tooltip(i) => html,
    //         xLabels: [index...] ที่จะแสดงป้ายแกน X, ariaLabel }
    function drawBars(el, o, W, animate) {
        const H = o.height || 180, padL = 30, padB = 22, padT = 12;
        const n = o.labels.length, series = o.series;
        const totals = o.labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
        const max = niceMax(Math.max(1, ...totals));
        const plotW = W - padL, plotH = H - padB - padT;
        const slot = plotW / n, bw = Math.max(3, Math.min(34, slot * 0.62)), rx = Math.min(8, bw / 2.4);
        const s = svg(W, H);
        s.setAttribute('aria-label', o.ariaLabel || 'กราฟแท่ง');
        const grid = node('g', { class: 'chart-grid' }, s);
        for (let k = 0; k <= 3; k++) {
            const v = max * k / 3, y = padT + plotH - plotH * k / 3;
            node('line', { x1: padL, x2: W, y1: y, y2: y }, grid);
            const t = node('text', { x: padL - 6, y: y + 4, 'text-anchor': 'end' }, grid);
            t.textContent = v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : Math.round(v);
        }
        const xs = i => padL + slot * i + slot / 2;
        const bars = node('g', { class: 'chart-bars' + (animate ? ' is-enter' : '') }, s);
        const groups = [];
        o.labels.forEach((_, i) => {
            const g = node('g', { class: 'chart-bar' }, bars);
            let y = padT + plotH;
            series.forEach((ser, si) => {
                const v = ser.values[i] || 0;
                if (!v) return;
                const h = plotH * v / max;
                y -= h;
                const top = si === series.length - 1 || series.slice(si + 1).every(x => !(x.values[i] || 0));
                // แท่งบนสุดมนด้านบน ส่วนล่างเป็นเหลี่ยม
                const x0 = xs(i) - bw / 2, r = top ? Math.min(rx, h) : 0;
                node('path', { d: `M${x0},${y + h}V${y + r}a${r},${r} 0 0 1 ${r},${-r}H${x0 + bw - r}a${r},${r} 0 0 1 ${r},${r}V${y + h}Z`, fill: ser.color || css('--accent'), class: 'seg' }, g);
            });
            if (!totals[i]) node('rect', { x: xs(i) - bw / 2, y: padT + plotH - 3, width: bw, height: 3, rx: 1.5, class: 'empty' }, g);
            g.style.setProperty('--d', (i * Math.min(18, 500 / n)) + 'ms');
            groups.push(g);
        });
        const axis = node('g', { class: 'chart-axis' }, s);
        (o.xLabels || o.labels.map((_, i) => i)).forEach(i => {
            const t = node('text', { x: xs(i), y: H - 6, 'text-anchor': i === 0 && n > 12 ? 'start' : i === n - 1 && n > 12 ? 'end' : 'middle' }, axis);
            t.textContent = o.labels[i];
        });
        const guide = node('line', { class: 'chart-guide', x1: 0, x2: 0, y1: padT, y2: padT + plotH }, s);
        const dot = node('circle', { class: 'chart-dot', r: 4.5, cx: -10, cy: -10 }, s);
        guide.style.display = 'none';
        el.appendChild(s);
        const tip = tooltipEl(el);
        const show = i => {
            groups.forEach((g, k) => g.classList.toggle('is-active', k === i));
            el.classList.add('has-active');
            const top = padT + plotH - plotH * totals[i] / max;
            guide.style.display = '';
            guide.setAttribute('x1', xs(i)); guide.setAttribute('x2', xs(i)); guide.setAttribute('y1', padT); guide.setAttribute('y2', top);
            dot.setAttribute('cx', xs(i)); dot.setAttribute('cy', top);
            const scale = el.clientWidth / W;
            placeTip(el, tip, xs(i) * scale, Math.max(28, padT + 6) * scale, o.tooltip ? o.tooltip(i) : `<small>${esc(o.labels[i])}</small><b>${fmt(totals[i])}</b>`);
        };
        const hide = () => {
            if (o.active != null) return show(o.active);
            groups.forEach(g => g.classList.remove('is-active'));
            el.classList.remove('has-active');
            guide.style.display = 'none'; dot.setAttribute('cx', -10); tip.hidden = true;
        };
        track(el, s, n, xs, show, hide);
        if (o.active != null) show(o.active);
    }

    // ---------- เส้นโค้ง + พื้นไล่สี ----------
    // opts: { labels, series: [{ label, values, color, dashed, fill }], height, tooltip(i), xLabels, ariaLabel }
    function drawArea(el, o, W, animate) {
        const H = o.height || 200, padL = 34, padB = 22, padT = 14;
        const n = o.labels.length;
        const all = o.series.flatMap(s => s.values.filter(v => v != null));
        const max = niceMax(Math.max(1, ...all));
        const plotW = W - padL - 8, plotH = H - padB - padT;
        const xs = i => padL + (n === 1 ? plotW / 2 : plotW * i / (n - 1));
        const ys = v => padT + plotH - plotH * v / max;
        const s = svg(W, H);
        s.setAttribute('aria-label', o.ariaLabel || 'กราฟเส้น');
        const defs = node('defs', {}, s);
        const grid = node('g', { class: 'chart-grid' }, s);
        for (let k = 0; k <= 3; k++) {
            const v = max * k / 3, y = ys(v);
            node('line', { x1: padL, x2: W - 8, y1: y, y2: y }, grid);
            const t = node('text', { x: padL - 6, y: y + 4, 'text-anchor': 'end' }, grid);
            t.textContent = v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : Math.round(v);
        }
        // เส้นโค้งแบบ Catmull-Rom → Bezier (ไม่เกินค่าจริงมากเพราะ tension ต่ำ)
        const curve = pts => pts.map((p, i) => {
            if (!i) return `M${p[0]},${p[1]}`;
            const p0 = pts[i - 2] || pts[i - 1], p1 = pts[i - 1], p2 = p, p3 = pts[i + 1] || p;
            const t = 0.18;
            return `C${p1[0] + (p2[0] - p0[0]) * t},${p1[1] + (p2[1] - p0[1]) * t} ${p2[0] - (p3[0] - p1[0]) * t},${p2[1] - (p3[1] - p1[1]) * t} ${p2[0]},${p2[1]}`;
        }).join('');
        const lines = [];
        o.series.forEach((ser, si) => {
            const pts = ser.values.map((v, i) => (v == null ? null : [xs(i), ys(v)])).filter(Boolean);
            if (!pts.length) return;
            const color = ser.color || css('--accent');
            if (ser.fill !== false) {
                const id = 'cg' + Math.random().toString(36).slice(2, 8);
                const lg = node('linearGradient', { id, x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
                node('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': ser.dashed ? 0.08 : 0.28 }, lg);
                node('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }, lg);
                node('path', { d: curve(pts) + `L${pts[pts.length - 1][0]},${padT + plotH}L${pts[0][0]},${padT + plotH}Z`, fill: `url(#${id})`, class: 'chart-fill' + (animate ? ' is-enter' : '') }, s);
            }
            const line = node('path', { d: curve(pts), fill: 'none', stroke: color, 'stroke-width': ser.dashed ? 2 : 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'chart-line' }, s);
            if (ser.dashed) line.setAttribute('stroke-dasharray', '5 5');
            else if (animate) { const len = line.getTotalLength ? line.getTotalLength() : 1000; line.style.strokeDasharray = len; line.style.strokeDashoffset = len; line.classList.add('is-draw'); requestAnimationFrame(() => requestAnimationFrame(() => { line.style.strokeDashoffset = 0; })); setTimeout(() => { line.style.strokeDasharray = ''; }, 1300); }
            lines.push({ ser, color });
        });
        const axis = node('g', { class: 'chart-axis' }, s);
        (o.xLabels || [0, Math.floor((n - 1) / 2), n - 1]).forEach((i, k, arr) => {
            const t = node('text', { x: xs(i), y: H - 6, 'text-anchor': k === 0 ? 'start' : k === arr.length - 1 ? 'end' : 'middle' }, axis);
            t.textContent = o.labels[i];
        });
        const guide = node('line', { class: 'chart-guide', x1: 0, x2: 0, y1: padT, y2: padT + plotH }, s);
        guide.style.display = 'none';
        const dots = lines.map(l => node('circle', { class: 'chart-dot', r: 5, cx: -10, cy: -10, style: `stroke:${l.color}` }, s));
        el.appendChild(s);
        const tip = tooltipEl(el);
        const show = i => {
            guide.style.display = '';
            guide.setAttribute('x1', xs(i)); guide.setAttribute('x2', xs(i));
            let topY = padT + plotH;
            lines.forEach((l, k) => {
                const v = l.ser.values[i];
                if (v == null) { dots[k].setAttribute('cx', -10); return; }
                dots[k].setAttribute('cx', xs(i)); dots[k].setAttribute('cy', ys(v));
                topY = Math.min(topY, ys(v));
            });
            const scale = el.clientWidth / W;
            placeTip(el, tip, xs(i) * scale, topY * scale, o.tooltip ? o.tooltip(i) : `<small>${esc(o.labels[i])}</small>` + lines.map(l => `<b>${l.ser.values[i] == null ? '-' : fmt(l.ser.values[i])}</b>`).join(' '));
        };
        const hide = () => { guide.style.display = 'none'; dots.forEach(d => d.setAttribute('cx', -10)); tip.hidden = true; };
        track(el, s, n, xs, show, hide);
        if (o.active != null) show(o.active);
    }

    // ---------- ครึ่งวงกลม ----------
    // opts: { value (0-100), label, sub, color }
    function drawGauge(el, o, W, animate) {
        const size = Math.min(W, 280), H = size * 0.62, cx = size / 2, cy = size * 0.55, r = size * 0.42, sw = size * 0.12;
        const s = svg(size, H);
        s.setAttribute('aria-label', `${o.label || ''} ${o.value}%`);
        s.style.display = 'block'; s.style.margin = '0 auto';
        const arc = (a0, a1) => {
            const p = a => [cx + r * Math.cos(Math.PI * (1 - a)), cy - r * Math.sin(Math.PI * (1 - a))];
            const [x0, y0] = p(a0), [x1, y1] = p(a1);
            return `M${x0},${y0}A${r},${r} 0 0 1 ${x1},${y1}`;
        };
        // แบ่ง 4 ช่วง มีช่องว่างเล็กน้อยระหว่างช่วง (แบบภาพตัวอย่าง)
        const gap = 0.012, v = Math.max(0, Math.min(100, o.value)) / 100;
        for (let k = 0; k < 4; k++) {
            const a0 = k / 4 + (k ? gap : 0), a1 = (k + 1) / 4 - (k < 3 ? gap : 0);
            node('path', { d: arc(a0, a1), class: 'gauge-track', 'stroke-width': sw, fill: 'none' }, s);
            if (v > a0) {
                const p = node('path', { d: arc(a0, Math.min(a1, v)), stroke: o.color || css('--accent'), 'stroke-width': sw, fill: 'none', class: 'gauge-fill' + (animate ? ' is-enter' : '') }, s);
                p.style.setProperty('--d', (k * 120) + 'ms');
            }
        }
        el.appendChild(s);
        const label = document.createElement('div');
        label.className = 'gauge-label';
        label.innerHTML = `<b>${esc(o.value)}<small>%</small></b><span>${esc(o.label || '')}</span>`;
        el.appendChild(label);
    }

    return {
        // เคลื่อนไหวเฉพาะครั้งแรกที่วาดในกล่องนั้น (อัปเดตสดทุก 20 วิ ไม่ให้กราฟกระพริบ)
        bars: (el, o) => draw(el, 'bars', o, !registry.has(el)),
        area: (el, o) => draw(el, 'area', o, !registry.has(el)),
        gauge: (el, o) => draw(el, 'gauge', o, !registry.has(el)),
        color: css
    };
})();
