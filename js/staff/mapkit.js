// js/staff/mapkit.js — แผนที่แบบอ่านง่าย (ใช้ร่วม: ภาพรวม · รายงาน)
//   พื้นแผนที่ OpenStreetMap ปรับโทนให้เรียบด้วย CSS (โหมดมืดกลับสีให้) — ไม่ต้องใช้ API key · ป้ายชื่อภาษาไทย · หมุดหยดน้ำมีรูป/ตัวเลข + ป้ายชื่อ
//   ปุ่มลอยมุมขวา: ซูม +/− และ "กลับจุดเดิม" · การ์ดข้อมูลแบบ bottom sheet เมื่อแตะหมุด
//   MapKit.create(el, { wheel }) → map   ·   MapKit.pin({ lat, lng, tone, html, label, size })   ·   MapKit.fit(map, pts)

const MapKit = (() => {
    const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
    const isDark = () => {
        const t = document.documentElement.dataset.theme;
        return t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    };
    const maps = new Set();

    function setTiles(map) {
        if (!map._mkTiles) map._mkTiles = L.tileLayer(TILES, { maxZoom: 19, attribution: ATTR, className: 'mk-tiles' }).addTo(map);
        map.getContainer().classList.toggle('mk-dark', isDark());
    }
    function syncAll() { maps.forEach(m => { if (m._container && m._container.isConnected) setTiles(m); else maps.delete(m); }); }
    document.addEventListener('prefchange', syncAll);
    if (window.matchMedia) {
        const mq = matchMedia('(prefers-color-scheme: dark)');
        (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(syncAll);
    }

    // ปุ่มลอย: ซูม + − และกลับจุดเดิม (ปุ่มกลมขาว แบบแอปแผนที่)
    let Fab = null;
    const fabClass = () => Fab || (Fab = L.Control.extend({
        options: { position: 'bottomright' },
        onAdd(map) {
            const box = L.DomUtil.create('div', 'mk-fabs');
            box.innerHTML = `
              <div class="mk-zoom"><button type="button" data-z="1" aria-label="ซูมเข้า">+</button><button type="button" data-z="-1" aria-label="ซูมออก">−</button></div>
              <button type="button" class="mk-fab" data-recenter aria-label="กลับไปดูทุกจุด" title="กลับไปดูทุกจุด"><svg class="ic ic-20" aria-hidden="true"><use href="#i-target"/></svg></button>`;
            L.DomEvent.disableClickPropagation(box);
            box.addEventListener('click', e => {
                const b = e.target.closest('button'); if (!b) return;
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
    function onAction(marker, fn) {
        marker.on('popupopen', e => { const b = e.popup.getElement().querySelector('[data-mk-action]'); if (b) b.onclick = ev => { ev.preventDefault(); fn(); }; });
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
    return { create, pin, dot, sheet, onAction, fit, autoLabels, popupOpts, isDark, setTiles };
})();
