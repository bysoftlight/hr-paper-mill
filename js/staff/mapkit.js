// js/staff/mapkit.js — แผนที่แบบอ่านง่าย (ใช้ร่วม: ภาพรวม · รายงาน)
//   พื้นแผนที่ OpenStreetMap ปรับโทนให้เรียบด้วย CSS (โหมดมืดกลับสีให้) — ไม่ต้องใช้ API key · ป้ายชื่อภาษาไทย · หมุดหยดน้ำมีรูป/ตัวเลข + ป้ายชื่อ
//   ปุ่มลอยมุมขวา: ประเภทแผนที่ · ซูม +/− · กลับจุดเดิม · แตะหมุด: มือถือเปิดแผ่นข้อมูลด้านล่าง คอมเปิดการ์ดเหนือหมุด
//   MapKit.create(el, { wheel }) → map   ·   MapKit.pin({ lat, lng, tone, html, label, size })   ·   MapKit.fit(map, pts)

const MapKit = (() => {
    // ประเภทแผนที่ (แบบ Google Maps): ค่าเริ่มต้น · ดาวเทียม · ภูมิประเทศ — ทั้งหมดไม่ต้องใช้ API key
    const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
    const ESRI = 'Tiles &copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>';
    const TYPES = {
        default: { label: 'ค่าเริ่มต้น', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: OSM, max: 19, cls: 'mk-tiles' },
        satellite: { label: 'ดาวเทียม', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: ESRI + ' · Maxar', max: 19, cls: 'mk-tiles-sat',
            labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}' },
        terrain: { label: 'ภูมิประเทศ', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', attr: ESRI, max: 19, cls: 'mk-tiles-topo' }
    };
    const THUMB = { default: 'https://a.tile.openstreetmap.org/13/6383/3780.png', satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/13/3780/6383', terrain: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/13/3780/6383' };
    // รายละเอียดแผนที่ (เปิด/ปิด): ชื่อจุดขาย · วงรอบหมุด (ปริมาณรายงาน / รัศมีจุดขาย)
    const DETAILS = { labels: { label: 'ชื่อจุดขาย', icon: 'type' }, halos: { label: 'วงรอบหมุด', icon: 'target' } };
    const KEY = 'HRPM_MAP';
    const opts = (() => { let o = {}; try { o = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { o = {}; } return Object.assign({ type: 'default', labels: true, halos: true }, o); })();
    if (!TYPES[opts.type]) opts.type = 'default';
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (e) { /* โหมดส่วนตัว */ } };

    const isDark = () => {
        const t = document.documentElement.dataset.theme;
        return t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    };
    const mobile = () => !window.matchMedia || matchMedia('(max-width: 767px)').matches;
    const maps = new Set();

    function setTiles(map) {
        const T = TYPES[opts.type];
        if (map._mkType !== opts.type) {
            if (map._mkTiles) map._mkTiles.remove();
            if (map._mkLabels) { map._mkLabels.remove(); map._mkLabels = null; }
            map._mkTiles = L.tileLayer(T.url, { maxZoom: T.max, attribution: T.attr, className: T.cls }).addTo(map);
            if (T.labels) map._mkLabels = L.tileLayer(T.labels, { maxZoom: T.max, className: 'mk-tiles-ref', pane: 'overlayPane' }).addTo(map);
            map._mkType = opts.type;
        }
        const c = map.getContainer();
        c.classList.toggle('mk-dark', isDark());
        c.classList.toggle('mk-sat', opts.type === 'satellite');
        c.classList.toggle('mk-no-labels', !opts.labels);
        c.classList.toggle('mk-no-halos', !opts.halos);
    }
    function syncAll() { maps.forEach(m => { if (m._container && m._container.isConnected) setTiles(m); else maps.delete(m); }); }
    document.addEventListener('prefchange', syncAll);
    if (window.matchMedia) {
        const mq = matchMedia('(prefers-color-scheme: dark)');
        (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(syncAll);
    }

    // แผ่นเลือกประเภทแผนที่ (สร้างครั้งเดียว ใช้ร่วมทุกแผนที่)
    function layersSheet() {
        let d = document.getElementById('mkLayers');
        if (d) return d;
        d = document.createElement('dialog');
        d.id = 'mkLayers'; d.className = 'sheet mk-layers'; d.setAttribute('aria-labelledby', 'mkLayersTitle');
        d.innerHTML = `
          <div class="sheet-head"><div><h2 id="mkLayersTitle">ประเภทแผนที่</h2></div><button type="button" class="icon-btn" data-close aria-label="ปิด"><svg class="ic ic-22" aria-hidden="true"><use href="#i-x"/></svg></button></div>
          <div class="sheet-body">
            <div class="mk-types" role="radiogroup" aria-label="ประเภทแผนที่">${Object.keys(TYPES).map(k => `
              <button type="button" class="mk-opt" role="radio" data-type="${k}"><span class="mk-thumb"><img src="${THUMB[k]}" alt="" loading="lazy" referrerpolicy="no-referrer" class="${k === 'default' ? 'mk-tiles' : ''}"></span><span>${TYPES[k].label}</span></button>`).join('')}
            </div>
            <h3 class="mk-sub">รายละเอียดแผนที่</h3>
            <div class="mk-types mk-details">${Object.keys(DETAILS).map(k => `
              <button type="button" class="mk-opt" role="switch" data-detail="${k}"><span class="mk-thumb mk-thumb-icon"><svg class="ic ic-28" aria-hidden="true"><use href="#i-${DETAILS[k].icon}"/></svg></span><span>${DETAILS[k].label}</span></button>`).join('')}
            </div>
          </div>`;
        document.body.appendChild(d);
        d.addEventListener('click', e => {
            if (e.target === d || e.target.closest('[data-close]')) return d.close();
            const b = e.target.closest('.mk-opt'); if (!b) return;
            if (b.dataset.type) opts.type = b.dataset.type; else opts[b.dataset.detail] = !opts[b.dataset.detail];
            save(); syncLayers(d); syncAll();
            if (typeof haptic === 'function') haptic();
        });
        return d;
    }
    function syncLayers(d) {
        d.querySelectorAll('[data-type]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.type === opts.type)));
        d.querySelectorAll('[data-detail]').forEach(b => b.setAttribute('aria-checked', String(!!opts[b.dataset.detail])));
    }
    function openLayers() { const d = layersSheet(); syncLayers(d); if (!d.open) d.showModal(); }

    // แผ่นข้อมูลหมุดบนมือถือ (ลากลงเพื่อปิด — js/glass.js)
    function infoSheet() {
        let d = document.getElementById('mkInfo');
        if (d) return d;
        d = document.createElement('dialog');
        d.id = 'mkInfo'; d.className = 'sheet mk-info'; d.setAttribute('aria-label', 'ข้อมูลหมุด');
        d.innerHTML = `<button type="button" class="icon-btn mk-info-x" data-close aria-label="ปิด"><svg class="ic ic-22" aria-hidden="true"><use href="#i-x"/></svg></button><div class="sheet-body mk-info-body"></div>`;
        document.body.appendChild(d);
        d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
        return d;
    }
    function openInfo(html, fn) {
        const d = infoSheet();
        d.querySelector('.mk-info-body').innerHTML = html;
        const b = d.querySelector('[data-mk-action]');
        if (b) b.onclick = ev => { ev.preventDefault(); d.close(); fn && fn(); };
        if (!d.open) d.showModal();
    }

    // ปุ่มลอย: ซูม + − และกลับจุดเดิม (ปุ่มกลมขาว แบบแอปแผนที่)
    let Fab = null;
    const fabClass = () => Fab || (Fab = L.Control.extend({
        options: { position: 'bottomright' },
        onAdd(map) {
            const box = L.DomUtil.create('div', 'mk-fabs');
            box.innerHTML = `
              <button type="button" class="mk-fab mk-fab-layers" data-layers aria-label="ประเภทแผนที่" title="ประเภทแผนที่"><svg class="ic ic-20" aria-hidden="true"><use href="#i-layers"/></svg></button>
              <div class="mk-zoom"><button type="button" data-z="1" aria-label="ซูมเข้า">+</button><button type="button" data-z="-1" aria-label="ซูมออก">−</button></div>
              <button type="button" class="mk-fab" data-recenter aria-label="กลับไปดูทุกจุด" title="กลับไปดูทุกจุด"><svg class="ic ic-20" aria-hidden="true"><use href="#i-target"/></svg></button>`;
            L.DomEvent.disableClickPropagation(box);
            box.addEventListener('click', e => {
                const b = e.target.closest('button'); if (!b) return;
                if ('layers' in b.dataset) return openLayers();
                if (b.dataset.z) map.setZoom(map.getZoom() + Number(b.dataset.z));
                else if (map._mkHome) map.flyToBounds(map._mkHome, { padding: [40, 40], maxZoom: map._mkMax || 15, duration: .5 });
            });
            return box;
        }
    }));

    function create(el, opt = {}) {
        const map = L.map(el, { zoomControl: false, attributionControl: true, scrollWheelZoom: !!opt.wheel, tap: true, zoomSnap: .5 });
        map.attributionControl.setPrefix(false);
        setTiles(map);
        new (fabClass())().addTo(map);
        if (!opt.wheel) el.addEventListener('dblclick', () => map.scrollWheelZoom.enable(), { once: true });
        map.on('popupopen', () => el.classList.add('mk-has-sheet'));
        map.on('popupclose', () => el.classList.remove('mk-has-sheet'));
        maps.add(map);
        return map;
    }

    // หมุดหยดน้ำ: tone = ok | warn | bad | accent · html = เนื้อในหัวหมุด (รูป/ตัวเลข/อักษร) · label = ป้ายชื่อข้างหมุด
    function pin({ lat, lng, tone = 'accent', html = '', label = '', size = 40, ring = '' }) {
        const h = Math.round(size * 1.25);
        const icon = L.divIcon({
            className: 'mk-pin-wrap',
            iconSize: [size, h], iconAnchor: [size / 2, h], popupAnchor: [0, -h + 4], tooltipAnchor: [size / 2 + 2, -h / 2 - 4],
            html: `<div class="mk-pin tone-${tone}${ring ? ' ring-' + ring : ''}" style="--pin:${size}px"><div class="mk-head">${html}</div><i class="mk-dot"></i></div>`
        });
        const m = L.marker([lat, lng], { icon, riseOnHover: true, keyboard: true, title: label ? String(label).replace(/<[^>]+>/g, '') : '' });
        if (label) m.bindTooltip(label, { permanent: true, direction: 'right', className: 'mk-label', interactive: false });
        return m;
    }

    // จุดเล็ก (ใช้เมื่อหมุดเยอะ)
    function dot({ lat, lng, tone = 'accent', ring = '' }) {
        return L.marker([lat, lng], { icon: L.divIcon({ className: 'mk-pin-wrap', iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -8], tooltipAnchor: [8, 0],
            html: `<i class="mk-small tone-${tone}${ring ? ' ring-' + ring : ''}"></i>` }), riseOnHover: true });
    }

    // การ์ดข้อมูลเมื่อแตะหมุด (ชื่อ · รายละเอียด · ปุ่ม)
    function sheet({ title, sub = '', meta = '', action = '', img = '' }) {
        return `<div class="mk-sheet">${img ? `<div class="mk-sheet-img">${img}</div>` : ''}<div class="mk-sheet-body"><b class="mk-sheet-title">${title}</b>${sub ? `<span class="mk-sheet-sub">${sub}</span>` : ''}${meta ? `<span class="mk-sheet-meta">${meta}</span>` : ''}</div>${action ? `<button type="button" class="btn btn-primary mk-sheet-btn" data-mk-action>${action}</button>` : ''}</div>`;
    }
    // แตะหมุด: มือถือ = แผ่นข้อมูลด้านล่าง (ลากลงปิดได้) · คอม = การ์ดลอยเหนือหมุด
    function onAction(marker, fn) {
        marker.on('popupopen', e => { const b = e.popup.getElement().querySelector('[data-mk-action]'); if (b) b.onclick = ev => { ev.preventDefault(); fn(); }; });
        if (marker._openPopup) marker.off('click', marker._openPopup, marker);
        marker.on('click', () => {
            const p = marker.getPopup();
            if (mobile() && p) { if (marker.isTooltipOpen && marker.isTooltipOpen() && !marker.getTooltip().options.permanent) marker.closeTooltip(); openInfo(p.getContent(), fn); }
            else marker.openPopup();
        });
    }

    function fit(map, pts, maxZoom = 15) {
        if (!pts.length) return;
        const b = L.latLngBounds(pts);
        map._mkHome = b; map._mkMax = maxZoom;
        map.fitBounds(b, { padding: [40, 40], maxZoom });
        setTimeout(() => map.invalidateSize(), 60);
    }

    // ป้ายชื่อแสดงเมื่อซูมใกล้พอ หรือหมุดไม่เยอะ (กันป้ายซ้อนกันจนอ่านไม่ออก)
    function autoLabels(map, layer, minZoom = 12, maxPins = 8) {
        const upd = () => {
            const show = map.getZoom() >= minZoom || layer.getLayers().filter(l => l.getTooltip && l.getTooltip()).length <= maxPins;
            map.getContainer().classList.toggle('mk-hide-labels', !show);
        };
        map.off('zoomend', map._mkLbl || (() => {}));
        map._mkLbl = upd;
        map.on('zoomend', upd);
        upd();
    }

    const popupOpts = { className: 'mk-popup', closeButton: true, autoPanPaddingTopLeft: [16, 16], autoPanPaddingBottomRight: [16, 16], maxWidth: 320, minWidth: 220 };
    return { create, pin, dot, sheet, onAction, fit, autoLabels, popupOpts, isDark, setTiles, openLayers, options: () => Object.assign({}, opts) };
})();
