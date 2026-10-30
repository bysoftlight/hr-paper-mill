// js/staff/overview.js — ภาพรวมวันนี้ (KPI, แนวโน้ม 30 วัน, ยังไม่ส่ง, เฝ้าระวัง, รายการล่าสุด)

VIEWS.overview = {
    data: null,
    loading: false,

    init() {
        $('ovRefresh').addEventListener('click', () => this.load(true));
    },

    show() {
        if (!this.data) this.skeleton();
        this.load();
    },

    reset() { this.data = null; this.loading = false; this.stale = false; },

    onLive() {
        if (ST.view === 'overview' && !document.querySelector('dialog[open]')) this.load();
        else this.stale = true;
    },

    skeleton() {
        $('ovKpis').innerHTML = Array.from({ length: 5 }, () =>
            '<div class="kpi" aria-hidden="true"><span class="skel skel-text" style="width:60%"></span><span class="skel" style="height:30px;width:45%;margin:6px 0"></span><span class="skel skel-sm" style="width:70%"></span></div>').join('');
        ['ovTrend', 'ovCompare', 'ovHours', 'ovGauge'].forEach(id => { if (!$(id).childElementCount) $(id).innerHTML = '<span class="skel chart-skel" aria-hidden="true"></span>'; });
        ['ovLatest', 'ovMissing', 'ovAgent', 'ovAnom'].forEach(id => {
            $(id).innerHTML = Array.from({ length: 3 }, () => '<div class="feed-item" aria-hidden="true"><span class="skel" style="width:36px;height:36px;border-radius:50%"></span><span class="fi-text"><span class="skel skel-text" style="width:60%"></span><span class="skel skel-sm" style="width:40%"></span></span></div>').join('');
        });
    },

    async load(manual) {
        if (this.loading) return;
        this.loading = true;
        if (manual) $('ovRefresh').disabled = true;
        const pre = !manual && ST.prefetch && ST.prefetch.overview;
        if (ST.prefetch) ST.prefetch.overview = null;
        const r = await (pre || api('staff.overview'));
        this.loading = false;
        $('ovRefresh').disabled = false;
        if (!r.success) {
            if (!this.data) $('ovKpis').innerHTML = `<div class="card empty" style="grid-column:1/-1">${icon('wifi-off')}${esc(r.message || 'โหลดข้อมูลไม่สำเร็จ')}</div>`;
            return;
        }
        this.data = r;
        this.stale = false;
        ST.lastSync = Date.now();
        this.render();
        if (manual) toast('อัปเดตข้อมูลแล้ว');
    },

    render() {
        const d = this.data, k = d.kpi;
        $('ovDate').textContent = `${thDateLong(d.today)} · อัปเดต ${thTime(d.generatedAt)} น.`;
        const rate = k.participants ? Math.round(k.reportedToday / k.participants * 100) : 0;
        // รายการที่ต้องตรวจ (นับรายการ ไม่นับซ้ำถ้ามีหลายปัญหา)
        const review = d.anomalies.length;
        $('ovKpis').innerHTML = `
          <button type="button" class="kpi is-ok" data-ov-filter="today">
            <small>ส่งแล้ววันนี้</small><b>${cnum(k.reportedToday, 'today')}<span class="of"> / ${fmtNum(k.participants)}</span></b>
            <span>${cnum(rate, 'rate')}% ของผู้ใช้สิทธิ์ที่ใช้งาน</span><div class="kpi-meter"><i style="width:${rate}%"></i></div>
          </button>
          <button type="button" class="kpi ${k.missingToday ? 'is-bad' : 'is-ok'}" data-ov-filter="missing">
            <small>ยังไม่ส่งวันนี้</small><b>${cnum(k.missingToday, 'missing')}</b><span>คน · แตะเพื่อดูรายชื่อ</span>
          </button>
          <button type="button" class="kpi" data-ov-filter="agentToday">
            <small>ขายโดยตัวแทนวันนี้</small><b>${cnum(k.agentToday, 'agent')}</b><span>${k.agentOverLimit ? `<b class="text-bad">${k.agentOverLimit} คน</b> เกิน ${ST.config && ST.config.agentLimit || 10} ครั้ง/เดือน` : 'ไม่มีผู้เกินโควตาเดือนนี้'}</span>
          </button>
          <button type="button" class="kpi ${review ? 'is-warn' : ''}" data-ov-filter="anomaly">
            <small>ต้องตรวจสอบวันนี้</small><b>${cnum(review, 'review')}</b><span>ตำแหน่งผิดปกติ ${k.anomaliesToday} · ไม่มี GPS ${k.nogpsToday}${k.duplicatesToday !== undefined ? ` · รูปซ้ำ ${k.duplicatesToday} · GPS ไม่แม่น ${k.lowAccToday}` : ''}</span>
          </button>
          <button type="button" class="kpi" data-ov-filter="month">
            <small>อัตราการส่งเดือนนี้</small><b>${cnum(k.monthRate, 'monthRate')}<span class="of">%</span></b><span>${cnum(k.monthRecords, 'monthRecords')} รายการ</span>
          </button>`;
        Counting.scan($('ovKpis'), this.counts || (this.counts = {}));
        $('ovKpis').querySelectorAll('[data-ov-filter]').forEach(b => {
            b.insertAdjacentHTML('beforeend', `<span class="kpi-go" aria-hidden="true">ดูรายการ ${icon('chevron-right')}</span>`);
            b.addEventListener('click', () => { haptic(); Analytics.track('kpi_drill', { l: b.dataset.ovFilter }); this.drill(b.dataset.ovFilter); });
        });

        // แนวโน้ม 30 วัน (ซ้อน ขายเอง + ตัวแทน) — ชี้/แตะดูตัวเลข, แตะสองครั้งเปิดรายการของวันนั้น
        const t = d.trend, last = t.length - 1;
        Charts.bars($('ovTrend'), {
            labels: t.map(x => thDate(x.date, { day: 'numeric', month: 'short' })),
            xLabels: [0, Math.floor(last / 2), last],
            series: [{ label: 'ขายเอง', values: t.map(x => x.count - x.agent), color: Charts.color('--accent') }, { label: 'โดยตัวแทน', values: t.map(x => x.agent), color: Charts.color('--warn') }],
            height: 190, ariaLabel: 'กราฟจำนวนรายงานย้อนหลัง 30 วัน',
            tooltip: i => `<small>${thDate(t[i].date, { weekday: 'short', day: 'numeric', month: 'short' })}</small><b>${fmtNum(t[i].count)} รายการ</b><div class="tip-row"><i class="sw" style="background:var(--accent)"></i>ขายเอง ${t[i].count - t[i].agent}</div><div class="tip-row"><i class="sw" style="background:var(--warn)"></i>ตัวแทน ${t[i].agent}</div>`
        });
        $('ovTrend').ondblclick = () => { const a = $('ovTrend').querySelector('.chart-bar.is-active'); if (a) { const i = [...a.parentNode.children].indexOf(a); VIEWS.records.openWith({ period: 'day', day: t[i].date }); } };

        this.renderCompare();
        this.renderGauge();
        this.renderHours();
        this.renderSites();

        // รายการล่าสุด
        $('ovLatest').innerHTML = d.latest.length ? d.latest.map((r, i) => `
          <button type="button" class="feed-item" data-i="${i}">
            ${avatarHtml(r.userName, r.userPic)}
            <span class="fi-text"><b>${esc(r.userName)}</b><small>${esc(r.site || r.userId)} · ${thDate(r.date, { day: 'numeric', month: 'short' })} ${esc(r.time)} น.</small></span>
            <span class="fi-side">${r.anomaly ? `<span class="badge is-bad">${icon('alert')}${fmtDistance(r.distance)}</span>` : ''}${typeChip(r.type)}</span>
          </button>`).join('') : `<div class="empty">${icon('inbox')}ยังไม่มีรายการ</div>`;
        $('ovLatest').querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => VIEWS.records.openDetail(d.latest[b.dataset.i])));

        // ยังไม่ส่ง
        $('ovMissCount').textContent = d.missing.length;
        $('ovMissing').innerHTML = d.missing.length ? d.missing.map(m => `
          <div class="person">
            ${avatarHtml(m.name, m.pic)}
            <span class="fi-text"><b>${esc(m.name)}</b><small><span class="mono">${esc(m.id)}</span>${m.site ? ' · ' + esc(m.site) : ''}</small>${m.contact ? `<small class="contacted">${icon('check', 'ic-16')}${esc(m.contact.resultLabel)}${m.contact.note ? ' · ' + esc(m.contact.note) : ''} (${thTime(m.contact.ts)} น.)</small>` : ''}</span>
            ${m.phone ? `<a class="call-btn" href="tel:${esc(m.phone.replace(/[^0-9+]/g, ''))}" aria-label="โทรหา ${esc(m.name)}">${icon('phone')}</a>` : ''}
            ${can('participants.view') ? `<button type="button" class="icon-btn" data-pid="${esc(m.id)}" aria-label="ดูข้อมูล ${esc(m.name)}" style="margin:0">${icon('chevron-right')}</button>` : ''}
          </div>`).join('') : `<div class="empty">${icon('check-circle')}ทุกคนส่งรายงานวันนี้แล้ว</div>`;
        $('ovMissing').querySelectorAll('[data-pid]').forEach(b => b.addEventListener('click', () => VIEWS.participants.openDetail(b.dataset.pid)));

        // เฝ้าระวังโควตาตัวแทน
        $('ovAgent').innerHTML = d.agentWatch.length ? d.agentWatch.map(a => {
            const ratio = a.used / a.limit, cls = ratio >= 0.8 ? 'is-bad' : 'is-warn';
            return `<button type="button" class="person" data-uid="${esc(a.id)}">
              ${avatarHtml(a.name, a.pic)}
              <span class="fi-text"><b>${esc(a.name)}</b><small><span class="mono">${esc(a.id)}</span>${a.site ? ' · ' + esc(a.site) : ''}</small></span>
              <span class="fi-side"><span class="mini-meter ${cls}"><i style="width:${Math.min(100, ratio * 100)}%"></i></span><b class="mono ${a.used > a.limit ? 'text-bad' : ''}">${a.used}/${a.limit}</b></span>
            </button>`;
        }).join('') : `<div class="empty">${icon('check-circle')}ไม่มีผู้ใช้สิทธิ์ที่ใกล้ครบโควตา</div>`;
        $('ovAgent').querySelectorAll('[data-uid]').forEach(b => b.addEventListener('click', () =>
            VIEWS.records.openWith({ period: 'month', userIds: [b.dataset.uid], types: [AGENT_TYPE] })));

        // ตำแหน่งต้องตรวจสอบ
        $('ovAnom').innerHTML = d.anomalies.length ? d.anomalies.map((r, i) => `
          <button type="button" class="feed-item" data-i="${i}">
            ${avatarHtml(r.userName, r.userPic)}
            <span class="fi-text"><b>${esc(r.userName)}</b><small>${esc(r.site || '-')} · ${esc(r.time)} น.</small></span>
            <span class="fi-side">${!r.hasGps ? '<span class="badge is-warn">ไม่มี GPS</span>' : r.anomaly ? `<span class="badge is-bad">${icon('alert')}ห่าง ${fmtDistance(r.distance)}</span>` : ''}${qualityBadges(r)}</span>
          </button>`).join('') : `<div class="empty">${icon('check-circle')}ไม่มีรายการผิดปกติวันนี้</div>`;
        $('ovAnom').querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => VIEWS.records.openDetail(d.anomalies[b.dataset.i])));
    },

    // เทียบเดือน: เส้นทึบ = เดือนนี้, เส้นประ = เดือนก่อน (แบบสะสมหรือรายวัน)
    renderCompare() {
        const c = this.data.compare;
        const card = $('ovCompare').closest('.card');
        if (!c) { card.hidden = true; return; }
        card.hidden = false;
        const mode = this.cmpMode || 'cum';
        const cum = arr => { let a = 0; return arr.map(v => (a += v)); };
        const n = Math.max(c.current.length, c.previous.length);
        const cur = mode === 'cum' ? cum(c.current) : c.current.slice();
        const prev = mode === 'cum' ? cum(c.previous) : c.previous.slice();
        const pad = (arr, len) => arr.concat(new Array(Math.max(0, len - arr.length)).fill(null));
        const mName = k => thDate(k + '-01', { month: 'long' });
        const pct = (a, b) => (b ? Math.round((a - b) / b * 100) : null);
        const delta = (a, b, unit = '') => { const p = pct(a, b); return p === null ? '' : `<span class="delta ${p >= 0 ? 'is-up' : 'is-down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}%${unit}</span>`; };
        $('cmpStats').innerHTML = `
          <div><small>รายงาน 1–${c.today} ${mName(c.thisMonth)}</small><b>${cnum(c.totals.current, 'cmpTotal')}</b>${delta(c.totals.current, c.totals.previousSamePeriod)}<span>เดือนก่อนช่วงเดียวกัน ${fmtNum(c.totals.previousSamePeriod)}</span></div>
          <div><small>อัตราการส่ง</small><b>${cnum(c.rate.current, 'cmpRate')}%</b><span class="delta ${c.rate.current >= c.rate.previous ? 'is-up' : 'is-down'}">${c.rate.current >= c.rate.previous ? '▲' : '▼'} ${Math.abs(c.rate.current - c.rate.previous)} จุด</span><span>เดือนก่อน ${c.rate.previous}%</span></div>
          <div><small>ขายโดยตัวแทน</small><b>${cnum(c.agent.current, 'cmpAgent')}</b>${delta(c.agent.current, c.agent.previous)}<span>เดือนก่อน ${fmtNum(c.agent.previous)}</span></div>`;
        Counting.scan($('cmpStats'), this.counts || (this.counts = {}));
        const labels = Array.from({ length: n }, (_, i) => String(i + 1));
        Charts.area($('ovCompare'), {
            labels, height: 200, active: c.current.length - 1, ariaLabel: 'กราฟเทียบจำนวนรายงานเดือนนี้กับเดือนก่อน',
            xLabels: [0, 14, n - 1].filter(i => i < n),
            series: [
                { label: mName(c.lastMonth), values: pad(prev, n), color: Charts.color('--muted'), dashed: true },
                { label: mName(c.thisMonth), values: pad(cur, n), color: Charts.color('--accent') }
            ],
            tooltip: i => `<small>วันที่ ${i + 1}${mode === 'cum' ? ' (สะสม)' : ''}</small><div class="tip-row"><i class="sw" style="background:var(--accent)"></i>${mName(c.thisMonth)} <b>${cur[i] == null ? '-' : fmtNum(cur[i])}</b></div><div class="tip-row"><i class="sw" style="background:var(--muted)"></i>${mName(c.lastMonth)} <b>${prev[i] == null ? '-' : fmtNum(prev[i])}</b></div>`
        });
        $('cmpLegend').innerHTML = `<span><i class="lg" style="background:var(--accent)"></i>${mName(c.thisMonth)}</span><span><i class="lg lg-dash"></i>${mName(c.lastMonth)}</span>`;
        $('cmpMode').querySelectorAll('button').forEach(b => {
            b.setAttribute('aria-checked', String(b.dataset.mode === mode));
            b.onclick = () => { this.cmpMode = b.dataset.mode; this.renderCompare(); };
        });
    },

    renderGauge() {
        const k = this.data.kpi, c = this.data.compare;
        Charts.gauge($('ovGauge'), { value: k.monthRate, label: 'ของจำนวนวันที่ควรส่งเดือนนี้' });
        const diff = c ? k.monthRate - c.rate.previous : null;
        $('gaugeDelta').innerHTML = diff === null ? '' : `<span class="delta ${diff >= 0 ? 'is-up' : 'is-down'}">${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff)} จุด จากเดือนก่อน</span>`;
        const days = c ? c.today : 0, expected = k.participants * days;
        $('gaugeSplit').innerHTML = `<div><i class="lg" style="background:var(--accent)"></i><small>ส่งแล้ว</small><b>${fmtNum(k.monthRecords)}</b></div><div><i class="lg" style="background:var(--container)"></i><small>ขาด</small><b>${fmtNum(Math.max(0, expected - k.monthRecords))}</b></div>`;
    },

    renderHours() {
        const h = this.data.hours;
        const card = $('ovHours').closest('.card');
        if (!h) { card.hidden = true; return; }
        card.hidden = false;
        // ช่วงที่มีข้อมูล (อย่างน้อย 6:00–20:00)
        let a = h.findIndex(v => v > 0), b = 23 - [...h].reverse().findIndex(v => v > 0);
        if (a < 0) { a = 6; b = 20; }
        a = Math.min(a, 6); b = Math.max(b, 20);
        const hrs = h.slice(a, b + 1), peak = hrs.indexOf(Math.max(...hrs));
        const total = hrs.reduce((x, y) => x + y, 0);
        Charts.bars($('ovHours'), {
            labels: hrs.map((_, i) => String(a + i).padStart(2, '0')),
            xLabels: hrs.map((_, i) => i).filter(i => (a + i) % 3 === 0),
            series: [{ label: 'รายงาน', values: hrs, color: Charts.color('--accent') }],
            height: 150, active: total ? peak : null, ariaLabel: 'จำนวนรายงานแยกตามชั่วโมงที่ส่ง',
            tooltip: i => `<small>${String(a + i).padStart(2, '0')}:00–${String(a + i).padStart(2, '0')}:59 น.</small><b>${fmtNum(hrs[i])} รายการ</b>${total ? `<small>${Math.round(hrs[i] / total * 100)}% ของเดือนนี้</small>` : ''}`
        });
    },

    async renderSites() {
        const sites = (this.data.sites || []).filter(x => x.site);
        const card = $('ovMap').closest('.card');
        if (!this.data.sites) { card.hidden = true; return; }
        card.hidden = false;
        const status = x => (x.today >= x.people ? 'ok' : x.today ? 'warn' : 'bad');
        $('ovSites').innerHTML = sites.length ? `<div class="rank-head"><span>จุดขาย</span><span>วันนี้</span><span>เดือนนี้</span></div>` + sites.slice(0, 8).map((x, i) => `
          <button type="button" class="rank-row" data-si="${i}">
            <span class="rank-name"><i class="lg tone-${status(x)}" style="background:var(--t)"></i><b>${esc(x.site)}</b><small>${x.people} คน</small></span>
            <span class="mono">${x.today}/${x.people}</span>
            <span class="rank-bar"><i style="width:${Math.round(x.month / Math.max(1, sites[0].month) * 100)}%"></i><b class="mono">${fmtNum(x.month)}</b></span>
          </button>`).join('') : `<div class="empty">${icon('map')}ยังไม่มีข้อมูลจุดขาย</div>`;
        $('ovSites').querySelectorAll('[data-si]').forEach(b => {
            b.addEventListener('click', () => this.openSite(sites[b.dataset.si]));
        });
        const geo = sites.filter(x => x.lat !== null && x.lng !== null);
        const mapEl = $('ovMap');
        if (!geo.length) { mapEl.innerHTML = `<div class="map-fallback">ยังไม่มีพิกัดจุดขาย (กรอกละติจูด/ลองจิจูดจุดขายในหน้าผู้ใช้สิทธิ์)</div>`; return; }
        try {
            loadStyle('js/vendor/leaflet/leaflet.css?v=1.9.4');
            await loadScript('js/vendor/leaflet/leaflet.js?v=1.9.4');
        } catch (e) { mapEl.innerHTML = `<div class="map-fallback">${esc(e.message)}</div>`; return; }
        if (!this.map) this.map = MapKit.create(mapEl);
        if (this.mapLayer) this.mapLayer.remove();
        this.mapLayer = L.layerGroup().addTo(this.map);
        const maxM = Math.max(1, ...geo.map(x => x.month));
        const markers = new Map();
        geo.forEach(x => {
            const st = status(x);
            // วงจางรอบหมุด = ปริมาณรายงานเดือนนี้
            L.circleMarker([x.lat, x.lng], { radius: 14 + 22 * Math.sqrt(x.month / maxM), stroke: false, fillColor: Charts.color('--' + st), fillOpacity: 0.14, interactive: false, className: 'mk-halo' }).addTo(this.mapLayer);
            const m = MapKit.pin({ lat: x.lat, lng: x.lng, tone: st, html: `<b>${x.today}</b><small>/${x.people}</small>`, label: esc(x.site) })
                .bindPopup(MapKit.sheet({
                    title: esc(x.site),
                    sub: `วันนี้ส่งแล้ว <b>${x.today}/${x.people}</b> คน`,
                    meta: `รายงานเดือนนี้ ${fmtNum(x.month)} รายการ`,
                    action: 'ดูรายการ'
                }), MapKit.popupOpts)
                .addTo(this.mapLayer);
            MapKit.onAction(m, () => this.openSite(x));
            markers.set(x.site, m);
        });
        this.focusSite = x => { const m = markers.get(x.site); if (m) { this.map.panTo(m.getLatLng()); m.openPopup(); } };
        MapKit.autoLabels(this.map, this.mapLayer, 11, 6);
        MapKit.fit(this.map, geo.map(x => [x.lat, x.lng]), 15);
    },

    async openSite(x) {
        const ps = can('participants.view') ? await loadParticipants() : [];
        const ids = ps.filter(p => (p.site || 'ไม่ระบุจุดขาย') === x.site).map(p => p.id);
        if (ids.length) VIEWS.records.openWith({ period: 'month', userIds: ids });
        else VIEWS.records.openWith({ period: 'month' });
    },

    drill(kind) {
        const today = todayIso();
        if (kind === 'missing') return can('participants.view') ? VIEWS.participants.openWith('missing') : null;
        if (kind === 'today') return VIEWS.records.openWith({ period: 'day', day: today });
        if (kind === 'agentToday') return VIEWS.records.openWith({ period: 'day', day: today, types: [AGENT_TYPE] });
        if (kind === 'anomaly') return VIEWS.records.openWith({ period: 'day', day: today, location: 'review' });
        if (kind === 'month') return VIEWS.records.openWith({ period: 'month' });
    }
};
