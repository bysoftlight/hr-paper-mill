// js/staff/records.js — รายงานการส่ง: ตัวกรองหลายมิติ, ตาราง/แผนที่, รายละเอียด, เพิ่ม/แก้ไข/ลบ

const DEFAULT_FILTER = () => {
    const now = bkkParts();
    return { period: 'month', day: todayIso(), month: now.m, year: now.y, from: '', to: '',
        userIds: [], types: [], sites: [], location: 'all', status: 'active', q: '', sort: 'ts_desc' };
};

// จำนวนรายการต่อหน้า: ตามการตั้งค่า หรืออัตโนมัติ (มือถือ 20 · จอใหญ่ 50)
function recPageSize() {
    const v = Number(Prefs.get('pageSize'));
    return v || (window.matchMedia('(max-width: 767px)').matches ? 20 : 50);
}

VIEWS.records = {
    F: DEFAULT_FILTER(),
    page: 1, data: null, mode: 'table', loaded: false, reqSeq: 0,
    map: null, mapLayer: null, knownUsers: [],

    init() {
        const F = this.F;
        // ปี: ย้อนหลัง 5 ปี
        const y = bkkParts().y;
        $('recYear').innerHTML = Array.from({ length: 6 }, (_, i) => `<option value="${y - i}">พ.ศ. ${y - i + 543}</option>`).join('');
        $('recMonth').innerHTML = MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join('');
        $('recPeriod').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) { F.period = b.dataset.p; this.reload(); } });
        $('recDay').addEventListener('change', e => { F.day = e.target.value || todayIso(); this.reload(); });
        $('recMonth').addEventListener('change', e => { F.month = Number(e.target.value); this.reload(); });
        $('recYear').addEventListener('change', e => { F.year = Number(e.target.value); this.reload(); });
        $('recFrom').addEventListener('change', e => { F.from = e.target.value; this.reload(); });
        $('recTo').addEventListener('change', e => { F.to = e.target.value; this.reload(); });
        $('recSearch').addEventListener('input', debounce(e => { F.q = e.target.value.trim(); this.reload(); }, 350));
        $('recSort').addEventListener('change', e => { F.sort = e.target.value; this.reload(); });
        $('recViewMode').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) this.setMode(b.dataset.v); });
        $('recFilterBtn').addEventListener('click', () => this.openFilters());
        $('filterApply').addEventListener('click', () => this.applyFilters());
        $('filterReset').addEventListener('click', () => { Object.assign(F, { userIds: [], types: [], sites: [], location: 'all', status: 'active' }); this.renderFilterForm(); });
        $('fUserSearch').addEventListener('input', () => this.renderUserChecks());
        $('fUsersClear').addEventListener('click', () => { this.draftUsers = new Set(); this.renderUserChecks(); });
        ['fLocation', 'fStatus'].forEach(id => $(id).addEventListener('click', e => {
            const b = e.target.closest('[data-v]');
            if (b) $(id).querySelectorAll('[data-v]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
        }));
        $('recNewShow').addEventListener('click', () => { $('recNewBanner').hidden = true; this.load(); });
        $('recAdd').addEventListener('click', () => this.openForm());
        $('recExport').addEventListener('click', () => VIEWS.exporter.open());
        $('recordForm').addEventListener('submit', e => { e.preventDefault(); this.submitForm(); });
        $('rfUseSite').addEventListener('click', () => this.useSiteCoords());
        $('rfClearLoc').addEventListener('click', () => { $('rfLat').value = ''; $('rfLng').value = ''; });
        $('rfPhoto').addEventListener('change', e => this.pickPhoto(e.target.files[0]));
    },

    reset() {
        Object.assign(this, { F: DEFAULT_FILTER(), page: 1, data: null, loaded: false, knownUsers: [], stale: false });
        this.reqSeq++;
    },

    show() {
        if (!this.loaded) { this.loaded = true; this.syncControls(); this.load(); }
        else if (this.stale) { this.stale = false; this.load(); }
    },

    onLive(count) {
        if (ST.view === 'records') {
            $('recNewCount').textContent = count;
            $('recNewBanner').hidden = false;
        } else this.stale = true;
    },

    // เปิดหน้ารายงานพร้อมตัวกรอง (ใช้จากภาพรวม/ผู้ใช้สิทธิ์)
    openWith(patch) {
        this.F = Object.assign(DEFAULT_FILTER(), patch);
        this.page = 1;
        this.loaded = true;
        this.syncControls();
        switchTab('records');
        this.load();
    },

    range() {
        const F = this.F;
        if (F.period === 'day') return { from: F.day, to: F.day };
        if (F.period === 'month') {
            const last = new Date(F.year, F.month + 1, 0).getDate();
            return { from: `${F.year}-${pad2(F.month + 1)}-01`, to: `${F.year}-${pad2(F.month + 1)}-${pad2(last)}` };
        }
        if (F.period === 'year') return { from: `${F.year}-01-01`, to: `${F.year}-12-31` };
        return { from: F.from || '', to: F.to || '' };
    },

    rangeLabel() {
        const F = this.F, r = this.range();
        if (F.period === 'day') return thDateLong(F.day);
        if (F.period === 'month') return `${MONTHS[F.month]} ${F.year + 543}`;
        if (F.period === 'year') return `ปี พ.ศ. ${F.year + 543}`;
        if (r.from && r.to) return `${thDate(r.from)} – ${thDate(r.to)}`;
        if (r.from) return `ตั้งแต่ ${thDate(r.from)}`;
        if (r.to) return `ถึง ${thDate(r.to)}`;
        return 'ทุกช่วงเวลา';
    },

    filters() {
        const F = this.F, r = this.range();
        return { from: r.from, to: r.to, userIds: F.userIds, types: F.types, sites: F.sites, location: F.location, status: F.status, q: F.q };
    },

    syncControls() {
        const F = this.F;
        $('recPeriod').querySelectorAll('[data-p]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.p === F.period)));
        $('recPeriodInputs').querySelectorAll('[data-for]').forEach(el => { el.hidden = !el.dataset.for.split(' ').includes(F.period); });
        $('recDay').value = F.day; $('recMonth').value = F.month; $('recYear').value = F.year;
        $('recFrom').value = F.from; $('recTo').value = F.to; $('recSearch').value = F.q; $('recSort').value = F.sort;
        $('recsRange').textContent = this.rangeLabel();
        this.renderChips();
    },

    reload() { this.page = 1; this.syncControls(); this.load(); },

    activeFilterCount() {
        const F = this.F;
        return (F.userIds.length ? 1 : 0) + (F.types.length ? 1 : 0) + (F.sites.length ? 1 : 0) + (F.location !== 'all' ? 1 : 0) + (F.status !== 'active' ? 1 : 0);
    },

    renderChips() {
        const F = this.F, chips = [];
        const nameOf = id => { const p = (ST.participants || this.knownUsers).find(u => u.id === id); return p ? p.name : id; };
        F.userIds.forEach(id => chips.push(['user', id, nameOf(id)]));
        F.types.forEach(t => chips.push(['type', t, t === AGENT_TYPE ? 'โดยตัวแทน' : 'ขายเอง']));
        F.sites.forEach(s => chips.push(['site', s, s]));
        if (F.location !== 'all') chips.push(['location', '', { normal: 'ตรงจุดขาย', anomaly: 'ตำแหน่งผิดปกติ', nogps: 'ไม่มี GPS' }[F.location]]);
        if (F.status !== 'active') chips.push(['status', '', F.status === 'deleted' ? 'รายการที่ลบแล้ว' : 'รวมรายการที่ลบ']);
        $('recChips').innerHTML = chips.map(([k, v, label]) => `<button type="button" class="fchip" data-k="${k}" data-v="${esc(v)}" aria-label="เอาตัวกรอง ${esc(label)} ออก">${esc(label)} ${icon('x')}</button>`).join('');
        $('recChips').querySelectorAll('.fchip').forEach(b => b.addEventListener('click', () => {
            const { k, v } = b.dataset;
            if (k === 'user') F.userIds = F.userIds.filter(x => x !== v);
            if (k === 'type') F.types = F.types.filter(x => x !== v);
            if (k === 'site') F.sites = F.sites.filter(x => x !== v);
            if (k === 'location') F.location = 'all';
            if (k === 'status') F.status = 'active';
            this.reload();
        }));
        const n = this.activeFilterCount();
        $('recFilterCount').hidden = !n;
        $('recFilterCount').textContent = n;
    },

    async load() {
        const seq = ++this.reqSeq;
        $('recNewBanner').hidden = true;
        if (this.mode === 'map') return this.loadMap(seq);
        $('recTable').innerHTML = skeletonRows(6);
        $('recTable').setAttribute('aria-busy', 'true');
        if (!this.data) $('recSummary').innerHTML = Array.from({ length: 4 }, () => '<span class="stat"><span class="skel skel-text" style="width:80px"></span></span>').join('');
        const r = await api('staff.records.list', { filters: this.filters(), page: this.page, pageSize: recPageSize(), sort: this.F.sort });
        if (seq !== this.reqSeq) return;
        $('recTable').setAttribute('aria-busy', 'false');
        if (!r.success) { $('recTable').innerHTML = emptyState(r.message || 'โหลดข้อมูลไม่สำเร็จ', 'wifi-off'); $('recPager').innerHTML = ''; return; }
        this.data = r;
        ST.lastSync = Date.now();
        this.rememberUsers(r.agg.byUser);
        this.renderSummary(r.agg);
        this.renderTable(r.rows);
        this.renderPager(r);
    },

    rememberUsers(byUser) {
        byUser.forEach(u => { if (!this.knownUsers.find(k => k.id === u.id)) this.knownUsers.push({ id: u.id, name: u.name, site: u.site }); });
    },

    renderSummary(a) {
        $('recSummary').innerHTML = `
          <span class="stat"><b>${fmtNum(a.total)}</b>รายการ</span>
          <span class="stat"><b>${fmtNum(a.users)}</b>คน</span>
          <span class="stat"><b>${fmtNum(a.self)}</b>ขายเอง</span>
          <span class="stat ${a.agent ? 'is-warn' : ''}"><b>${fmtNum(a.agent)}</b>โดยตัวแทน</span>
          <span class="stat ${a.anomalies ? 'is-bad' : ''}"><b>${fmtNum(a.anomalies)}</b>ตำแหน่งผิดปกติ</span>
          <span class="stat ${a.nogps ? 'is-warn' : ''}"><b>${fmtNum(a.nogps)}</b>ไม่มี GPS</span>`;
    },

    locCell(r) {
        if (!r.hasGps) return '<span class="badge is-warn">ไม่มี GPS</span>';
        if (r.anomaly) return `<span class="badge is-bad">${icon('alert')}ห่าง ${fmtDistance(r.distance)}</span>`;
        if (r.distance !== null) return `<span class="badge is-ok">${icon('check')}${fmtDistance(r.distance)}</span>`;
        return '<span class="badge">ไม่มีพิกัดจุดขาย</span>';
    },

    renderTable(rows) {
        if (!rows.length) { $('recTable').innerHTML = emptyState('ไม่พบรายการตามเงื่อนไขที่เลือก'); return; }
        const editable = can('records.edit'), thumbs = Prefs.get('thumbs');
        $('recTable').innerHTML = `<table class="dtable">
          <thead><tr><th>วันที่ · เวลา</th><th>ผู้ใช้สิทธิ์</th><th>จุดขาย</th><th>ประเภท</th><th>ตำแหน่ง</th><th>รูป</th>${editable ? '<th><span class="sr-only">จัดการ</span></th>' : ''}</tr></thead>
          <tbody>${rows.map((r, i) => `
            <tr data-i="${i}" class="${r.status === 'deleted' ? 'is-deleted' : ''}" tabindex="0" aria-label="รายการของ ${esc(r.userName)} ${thDate(r.date)} ${esc(r.time)} น.">
              <td class="cell-when" data-label="วันที่"><b>${thDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}</b><span class="cell-sub mono">${esc(r.time)} น.${r.source === 'staff' ? ' · เจ้าหน้าที่' : ''}</span></td>
              <td class="td-main"><div class="cell-person">${avatarHtml(r.userName, r.userPic)}<span><b>${esc(r.userName)}</b><small class="mono">${esc(r.userId)}</small></span></div></td>
              <td data-label="จุดขาย">${esc(r.site || '-')}</td>
              <td data-label="ประเภท">${typeChip(r.type)}${r.status === 'deleted' ? ' <span class="badge is-bad">ลบแล้ว</span>' : ''}${r.note ? ` <span class="badge" title="${esc(r.note)}">หมายเหตุ</span>` : ''}</td>
              <td data-label="ตำแหน่ง">${this.locCell(r)}</td>
              <td class="td-thumb">${!(r.image || r.fileId) ? '' : thumbs ? `<img class="thumb" alt="" loading="lazy" decoding="async" data-thumb="${i}">` : `<span class="thumb-empty" title="ปิดรูปย่อไว้ในการตั้งค่า · แตะรายการเพื่อดูรูป">${icon('image')}</span>`}</td>
              ${editable ? `<td class="td-actions"><div class="row-btns"><button type="button" class="icon-btn" data-edit="${i}" aria-label="แก้ไข">${icon('edit')}</button></div></td>` : ''}
            </tr>`).join('')}</tbody></table>`;
        const tbl = $('recTable');
        tbl.querySelectorAll('img[data-thumb]').forEach(img => loadImg(img, rows[img.dataset.thumb], ok => {
            if (!ok) img.outerHTML = `<span class="thumb-empty" title="โหลดรูปไม่ได้">${icon('image')}</span>`;
        }, true));
        tbl.querySelectorAll('tbody tr').forEach(tr => {
            const open = () => this.openDetail(rows[tr.dataset.i]);
            tr.addEventListener('click', e => { if (!e.target.closest('[data-edit]')) open(); });
            tr.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
        });
        tbl.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => this.openForm(rows[b.dataset.edit])));
    },

    renderPager(r) {
        const pages = Math.max(1, Math.ceil(r.total / r.pageSize));
        const start = r.total ? (r.page - 1) * r.pageSize + 1 : 0, end = Math.min(r.total, r.page * r.pageSize);
        $('recPager').innerHTML = r.total <= r.pageSize ? `<span>${fmtNum(r.total)} รายการ</span>` : `
          <span>แสดง ${fmtNum(start)}–${fmtNum(end)} จาก ${fmtNum(r.total)} รายการ</span>
          <span class="pager-btns">
            <button type="button" class="btn-chip" data-pg="${r.page - 1}" ${r.page <= 1 ? 'disabled' : ''}>${icon('chevron-left', 'ic-16')} ก่อนหน้า</button>
            <span class="mono">${r.page}/${pages}</span>
            <button type="button" class="btn-chip" data-pg="${r.page + 1}" ${r.page >= pages ? 'disabled' : ''}>ถัดไป ${icon('chevron-right', 'ic-16')}</button>
          </span>`;
        $('recPager').querySelectorAll('[data-pg]').forEach(b => b.addEventListener('click', () => {
            this.page = Number(b.dataset.pg); this.load(); $('recordsView').scrollIntoView({ behavior: 'smooth' });
        }));
    },

    // ---------- ตัวกรอง ----------
    async openFilters() {
        const users = can('participants.view') ? await loadParticipants() : this.knownUsers;
        this.filterUsers = users.slice().sort((a, b) => a.name.localeCompare(b.name, 'th'));
        this.draftUsers = new Set(this.F.userIds);
        this.renderFilterForm();
        $('fRadiusHint').textContent = `ผิดปกติ = ห่างจากพิกัดจุดขายที่ลงทะเบียนเกิน ${fmtNum(ST.config && ST.config.anomalyRadius || 300)} เมตร`;
        showModal('filterModal');
    },

    renderFilterForm() {
        const F = this.F;
        if (!this.draftUsers) this.draftUsers = new Set(F.userIds);
        this.renderUserChecks();
        const types = (ST.config && ST.config.salesTypes) || [SELF_TYPE, AGENT_TYPE];
        $('fTypes').innerHTML = types.map(t => `<label><input type="checkbox" value="${esc(t)}" ${F.types.includes(t) ? 'checked' : ''}>${t === AGENT_TYPE ? 'ขายโดยตัวแทน' : 'ขายด้วยตัวเอง'}</label>`).join('');
        const sites = Array.from(new Set((this.filterUsers || []).map(u => u.site || '(ไม่ระบุ)'))).sort((a, b) => a.localeCompare(b, 'th'));
        $('fSites').innerHTML = sites.length ? sites.map(s => `<label><input type="checkbox" value="${esc(s)}" ${F.sites.includes(s) ? 'checked' : ''}>${esc(s)}</label>`).join('') : '<span class="muted-text">ยังไม่มีข้อมูลจุดขาย</span>';
        $('fLocation').querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === F.location)));
        $('fStatus').querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === F.status)));
    },

    renderUserChecks() {
        const q = $('fUserSearch').value.trim().toLowerCase();
        const list = (this.filterUsers || []).filter(u => !q || (u.id + ' ' + u.name + ' ' + (u.site || '')).toLowerCase().includes(q));
        $('fUsers').innerHTML = list.length ? list.map(u => `<label><input type="checkbox" value="${esc(u.id)}" ${this.draftUsers.has(u.id) ? 'checked' : ''}><span>${esc(u.name)}</span><small>${esc(u.id)}</small></label>`).join('')
            : '<p class="muted-text" style="padding:8px">ไม่พบผู้ใช้สิทธิ์</p>';
        $('fUsers').querySelectorAll('input').forEach(cb => cb.addEventListener('change', () => {
            if (cb.checked) this.draftUsers.add(cb.value); else this.draftUsers.delete(cb.value);
            $('fUserCount').textContent = this.draftUsers.size ? `(เลือก ${this.draftUsers.size})` : '';
        }));
        $('fUserCount').textContent = this.draftUsers.size ? `(เลือก ${this.draftUsers.size})` : '';
    },

    applyFilters() {
        const F = this.F;
        F.userIds = Array.from(this.draftUsers || []);
        F.types = Array.from($('fTypes').querySelectorAll('input:checked')).map(i => i.value);
        F.sites = Array.from($('fSites').querySelectorAll('input:checked')).map(i => i.value);
        F.location = ($('fLocation').querySelector('[aria-checked="true"]') || {}).dataset.v || 'all';
        F.status = can('records.edit') ? (($('fStatus').querySelector('[aria-checked="true"]') || {}).dataset.v || 'active') : 'active';
        this.draftUsers = null;
        $('filterModal').close();
        this.reload();
    },

    // ---------- แผนที่ ----------
    setMode(mode) {
        this.mode = mode;
        $('recViewMode').querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.v === mode)));
        $('recTableWrap').hidden = mode !== 'table';
        $('recMapWrap').hidden = mode !== 'map';
        this.load();
    },

    async loadMap(seq) {
        $('recMapHint').textContent = 'กำลังโหลดแผนที่…';
        try {
            loadStyle('js/vendor/leaflet/leaflet.css?v=1.9.4');
            await loadScript('js/vendor/leaflet/leaflet.js?v=1.9.4');
        } catch (e) {
            $('recMap').innerHTML = `<div class="map-fallback">${esc(e.message)}</div>`;
            return;
        }
        const [r, users] = await Promise.all([
            api('staff.records.list', { filters: this.filters(), all: true, sort: this.F.sort }),
            can('participants.view') ? loadParticipants() : Promise.resolve([])
        ]);
        if (seq !== this.reqSeq) return;
        if (!r.success) { $('recMapHint').textContent = r.message; return; }
        this.data = r;
        this.renderSummary(r.agg);
        if (!this.map) {
            this.map = L.map('recMap', { scrollWheelZoom: true }).setView([13.75, 100.52], 11);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(this.map);
        }
        if (this.mapLayer) this.mapLayer.remove();
        this.mapLayer = L.layerGroup().addTo(this.map);
        const css = getComputedStyle(document.documentElement);
        const color = n => css.getPropertyValue(n).trim();
        const radius = (ST.config && ST.config.anomalyRadius) || 300;
        const shownUsers = new Set(r.rows.map(x => x.userId));
        users.filter(u => u.siteLat !== null && u.siteLng !== null && shownUsers.has(u.id)).forEach(u => {
            L.circle([u.siteLat, u.siteLng], { radius, color: color('--dash'), weight: 1, fillOpacity: 0.06, dashArray: '4 4' })
                .bindTooltip(`จุดขาย: ${esc(u.site || '-')} (${esc(u.name)})`).addTo(this.mapLayer);
        });
        const pts = [];
        const limit = 3000;
        r.rows.filter(x => x.hasGps).slice(0, limit).forEach(x => {
            const m = L.circleMarker([x.lat, x.lng], {
                radius: 7, weight: x.anomaly ? 3 : 1.5, color: x.anomaly ? color('--bad') : '#fff',
                fillColor: x.type === AGENT_TYPE ? color('--warn') : color('--accent'), fillOpacity: 0.9
            });
            m.bindPopup(`<b>${esc(x.userName)}</b>${thDate(x.date)} ${esc(x.time)} น.<br>${x.type === AGENT_TYPE ? 'ขายโดยตัวแทน' : 'ขายด้วยตัวเอง'}${x.distance !== null ? `<br>ห่างจุดขาย ${fmtDistance(x.distance)}` : ''}<br><a href="#" data-open-rec="${x.row}">ดูรายละเอียด</a>`);
            m.on('popupopen', e => {
                const a = e.popup.getElement().querySelector('[data-open-rec]');
                if (a) a.onclick = ev => { ev.preventDefault(); this.openDetail(x); };
            });
            m.addTo(this.mapLayer);
            pts.push([x.lat, x.lng]);
        });
        if (pts.length) this.map.fitBounds(pts, { padding: [30, 30], maxZoom: 16 });
        setTimeout(() => this.map.invalidateSize(), 50);
        const nogps = r.rows.length - pts.length;
        $('recMapHint').textContent = `แสดง ${fmtNum(pts.length)} จุด${r.rows.filter(x => x.hasGps).length > limit ? ` (จำกัด ${fmtNum(limit)} จุดแรก)` : ''}${nogps ? ` · ไม่มี GPS ${fmtNum(nogps)} รายการ` : ''} · สีน้ำเงิน = ขายเอง, สีเหลือง = โดยตัวแทน, ขอบแดง = ตำแหน่งผิดปกติ, วงประ = รัศมีจุดขาย ${radius} ม.`;
    },

    // ---------- รายละเอียด ----------
    openDetail(rec) {
        this.current = rec;
        $('recAvatar').outerHTML = avatarHtml(rec.userName, rec.userPic).replace('<div class="avatar', '<div id="recAvatar" class="avatar');
        $('recTitle').textContent = rec.userName;
        $('recMeta').textContent = `${thDateLong(rec.date)} · ${rec.time} น. · ${rec.type === AGENT_TYPE ? 'ขายโดยตัวแทน' : 'ขายด้วยตัวเอง'}`;
        const img = $('recImg'), stage = img.parentElement;
        img.removeAttribute('src'); img.hidden = false; $('recImgEmpty').hidden = true;
        if (rec.image || rec.fileId) {
            stage.classList.add('is-loading');
            loadImg(img, rec, ok => { stage.classList.remove('is-loading'); if (!ok) { img.hidden = true; $('recImgEmpty').hidden = false; } });
            img.alt = `ภาพหลักฐานของ ${rec.userName} ${thDate(rec.date)}`;
        } else { img.hidden = true; $('recImgEmpty').hidden = false; }
        const rows = [
            ['รหัส', `<span class="mono">${esc(rec.userId)}</span>`],
            ['จุดขาย', esc(rec.site || '-')],
            ['ตำแหน่ง', rec.hasGps ? `<a href="${esc(rec.mapUrl)}" target="_blank" rel="noopener" class="mono">${rec.lat.toFixed(5)}, ${rec.lng.toFixed(5)}</a>` : 'ไม่มีข้อมูล GPS'],
            ['ห่างจากจุดขาย', rec.distance !== null ? `${fmtDistance(rec.distance)} ${rec.anomaly ? '<span class="badge is-bad">ผิดปกติ</span>' : '<span class="badge is-ok">ปกติ</span>'}` : '-'],
            ['หมายเหตุ', esc(rec.note || '-')],
            ['ที่มา', rec.source === 'staff' ? 'บันทึกโดยเจ้าหน้าที่' : 'ส่งจากแอปผู้ใช้สิทธิ์'],
            ['สถานะ', rec.status === 'deleted' ? '<span class="badge is-bad">ลบแล้ว</span>' : '<span class="badge is-ok">ใช้งาน</span>']
        ];
        if (rec.updatedBy) rows.push(['แก้ไขล่าสุด', `${esc(rec.updatedBy)} · ${rec.updatedAt ? thDateTime(rec.updatedAt) : ''}`]);
        $('recKv').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

        const acts = [];
        if (rec.fileId) acts.push(`<button type="button" class="btn btn-outline" id="recDownload">${icon('download')} ดาวน์โหลดรูป</button>`);
        if (can('records.edit')) {
            if (rec.status === 'deleted') acts.push(`<button type="button" class="btn btn-outline" id="recRestore">${icon('restore')} กู้คืน</button>`);
            else acts.push(`<button type="button" class="btn btn-danger" id="recDelete">${icon('trash')} ลบ</button>`);
            acts.push(`<button type="button" class="btn btn-primary" id="recEdit">${icon('edit')} แก้ไข</button>`);
        }
        if (!acts.length) acts.push('<button type="button" class="btn btn-outline" data-close>ปิด</button>');
        $('recActions').innerHTML = acts.join('');
        const on = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', fn); };
        on('recDownload', () => this.download(rec));
        on('recEdit', () => { $('recordModal').close(); this.openForm(rec); });
        on('recDelete', () => this.remove(rec));
        on('recRestore', () => this.restore(rec));
        showModal('recordModal');
    },

    async download(rec) {
        const url = await imageData(rec.fileId);
        if (!url) return showMessage({ title: 'ดาวน์โหลดไม่สำเร็จ', text: 'ไม่พบไฟล์รูปของรายการนี้', tone: 'bad' });
        const blob = await (await fetch(url)).blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${rec.userId}_${rec.date}_${rec.time.replace(':', '')}.jpg`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },

    askReason({ title, text, okText }) {
        return new Promise(resolve => {
            const dlg = $('reasonModal');
            $('reasonTitle').textContent = title; $('reasonText').textContent = text; $('reasonOk').textContent = okText;
            $('reasonInput').value = ''; $('reasonInput').removeAttribute('aria-invalid');
            const done = v => { $('reasonForm').onsubmit = null; $('reasonCancel').onclick = null; dlg.onclose = null; if (dlg.open) dlg.close(); resolve(v); };
            $('reasonForm').onsubmit = e => {
                e.preventDefault();
                const v = $('reasonInput').value.trim();
                if (!v) { $('reasonInput').setAttribute('aria-invalid', 'true'); $('reasonInput').focus(); return; }
                done(v);
            };
            $('reasonCancel').onclick = () => done(null);
            dlg.onclose = () => done(null);
            dlg.showModal();
            $('reasonInput').focus();
        });
    },

    async remove(rec) {
        const reason = await this.askReason({ title: 'ลบรายการนี้?', text: `${rec.userName} · ${thDate(rec.date)} ${rec.time} น. — รายการจะถูกซ่อนจากรายงาน (กู้คืนได้) และบันทึกเหตุผลไว้ใน Log`, okText: 'ลบรายการ' });
        if (!reason) return;
        showLoading(true, 'กำลังลบรายการ…');
        const r = await api('staff.records.delete', { row: rec.row, ts: rec.ts, reason });
        showLoading(false);
        if (!r.success) return showMessage({ title: 'ลบไม่สำเร็จ', text: r.message, tone: 'bad' });
        $('recordModal').close();
        toast('ลบรายการแล้ว');
        this.afterChange();
    },

    async restore(rec) {
        showLoading(true, 'กำลังกู้คืน…');
        const r = await api('staff.records.restore', { row: rec.row, ts: rec.ts });
        showLoading(false);
        if (!r.success) return showMessage({ title: 'กู้คืนไม่สำเร็จ', text: r.message, tone: 'bad' });
        $('recordModal').close();
        toast('กู้คืนรายการแล้ว');
        this.afterChange();
    },

    afterChange() {
        ST.lastSeen = Date.now();
        this.load();
        VIEWS.overview.stale = true;
        ST.participants = null;
    },

    // ---------- เพิ่ม / แก้ไข ----------
    async openForm(rec) {
        this.editing = rec || null;
        this.photo = null;
        const users = (await loadParticipants()).filter(u => u.active || (rec && u.id === rec.userId));
        const list = users.length ? users : this.knownUsers;
        $('rfUser').innerHTML = '<option value="">เลือกผู้ใช้สิทธิ์</option>' + list.slice().sort((a, b) => a.name.localeCompare(b.name, 'th'))
            .map(u => `<option value="${esc(u.id)}">${esc(u.name)} (${esc(u.id)})${u.site ? ' · ' + esc(u.site) : ''}</option>`).join('');
        const types = (ST.config && ST.config.salesTypes) || [SELF_TYPE, AGENT_TYPE];
        $('rfTypes').innerHTML = types.map((t, i) => `<label class="choice"><input type="radio" name="rfType" value="${esc(t)}">${icon(i ? 'users' : 'user')}<span><b>${i ? 'ขายโดยตัวแทน' : 'ขายด้วยตัวเอง'}</b><small>${i ? 'มีผู้อื่นขายแทน' : 'ผู้ใช้สิทธิ์อยู่ที่ร้าน'}</small></span></label>`).join('');
        $('rfTitle').textContent = rec ? 'แก้ไขรายการ' : 'เพิ่มรายการ';
        $('rfUser').value = rec ? rec.userId : (this.F.userIds.length === 1 ? this.F.userIds[0] : '');
        $('rfDate').value = rec ? rec.date : todayIso();
        $('rfDate').max = todayIso();
        $('rfTime').value = rec ? rec.time : nowHM();
        (document.querySelector(`input[name="rfType"][value="${rec ? rec.type : SELF_TYPE}"]`) || {}).checked = true;
        $('rfLat').value = rec && rec.lat !== null ? rec.lat : '';
        $('rfLng').value = rec && rec.lng !== null ? rec.lng : '';
        $('rfNote').value = rec ? rec.note.replace(/^'/, '') : '';
        $('rfPhoto').value = '';
        $('rfPhotoPreview').hidden = !(rec && (rec.image || rec.fileId));
        if (rec && (rec.image || rec.fileId)) loadImg($('rfPhotoPreview'), rec);
        $('rfPhotoLabel').textContent = rec && (rec.image || rec.fileId) ? 'เปลี่ยนรูป' : 'เลือกรูป';
        $('rfPhotoInfo').textContent = 'ไม่บังคับ — ระบบจะย่อขนาดให้อัตโนมัติ';
        showModal('recordFormModal');
    },

    async useSiteCoords() {
        const users = await loadParticipants();
        const u = users.find(x => x.id === $('rfUser').value);
        if (!u) return toast('เลือกผู้ใช้สิทธิ์ก่อน');
        if (u.siteLat === null || u.siteLng === null) return toast('ผู้ใช้สิทธิ์นี้ยังไม่มีพิกัดจุดขาย');
        $('rfLat').value = u.siteLat; $('rfLng').value = u.siteLng;
    },

    async pickPhoto(file) {
        if (!file) return;
        $('rfPhotoInfo').textContent = 'กำลังย่อขนาด…';
        try {
            this.photo = await compressImage(file);
            $('rfPhotoPreview').src = 'data:image/jpeg;base64,' + this.photo.base64;
            $('rfPhotoPreview').hidden = false;
            $('rfPhotoInfo').textContent = `${formatBytes(file.size)} → ${formatBytes(this.photo.bytes)}`;
        } catch (e) {
            this.photo = null;
            $('rfPhotoInfo').textContent = 'อ่านรูปไม่ได้ กรุณาเลือกรูปใหม่';
        }
    },

    async submitForm(force) {
        const rec = this.editing;
        const type = (document.querySelector('input[name="rfType"]:checked') || {}).value;
        const payload = {
            userId: $('rfUser').value, date: $('rfDate').value, time: $('rfTime').value, type,
            lat: $('rfLat').value, lng: $('rfLng').value, note: $('rfNote').value.trim()
        };
        if (!payload.userId) { $('rfUser').focus(); return toast('กรุณาเลือกผู้ใช้สิทธิ์'); }
        if (!payload.date || !payload.time) return toast('กรุณาระบุวันที่และเวลา');
        if (rec) { payload.row = rec.row; payload.originalTs = rec.ts; }
        if (this.photo) payload.imageFile = { data: this.photo.base64, mimeType: 'image/jpeg' };
        $('rfSave').disabled = true;
        showLoading(true, 'กำลังบันทึก…');
        const r = await api('staff.records.save', { record: payload, force: !!force });
        showLoading(false);
        $('rfSave').disabled = false;
        if (!r.success && r.code === 'DUPLICATE') {
            const ok = await showMessage({ title: 'มีรายงานของวันนี้แล้ว', text: r.message, tone: 'warn', okText: 'บันทึกเพิ่ม', cancelText: 'ยกเลิก' });
            if (ok) return this.submitForm(true);
            return;
        }
        if (!r.success) return showMessage({ title: 'บันทึกไม่สำเร็จ', text: r.message, tone: 'bad' });
        $('recordFormModal').close();
        toast(rec ? 'แก้ไขรายการแล้ว' : 'เพิ่มรายการแล้ว');
        this.afterChange();
    }
};
