// js/staff/participants.js — รายชื่อผู้ใช้สิทธิ์, สถิติ, ปฏิทินการส่งรายเดือน, เพิ่ม/แก้ไข

// คอลัมน์ที่เรียงได้: [คีย์, หัวตาราง, ทิศเริ่มต้น (1 = น้อย→มาก), ค่าที่ใช้เรียง]
const PART_COLS = [
    ['name', 'ผู้ใช้สิทธิ์', 1, p => p.name],
    ['site', 'จุดขาย', 1, p => p.site || '\uffff'],
    ['today', 'วันนี้', 1, p => !p.active ? 2 : p.reportedToday ? 1 : 0],
    ['month', 'เดือนนี้', 1, p => p.monthCount],
    ['agent', 'ขายโดยตัวแทน', -1, p => p.monthAgent],
    ['last', 'ล่าสุด', -1, p => p.lastReport || 0],
    ['status', 'สถานะ', 1, p => p.active ? 0 : 1]
];
const PART_SORT_LABEL = {
    name: ['ชื่อ ก → ฮ', 'ชื่อ ฮ → ก'], site: ['จุดขาย ก → ฮ', 'จุดขาย ฮ → ก'],
    today: ['ยังไม่ส่งวันนี้ก่อน', 'ส่งแล้ววันนี้ก่อน'], month: ['ส่งน้อยสุดเดือนนี้ก่อน', 'ส่งมากสุดเดือนนี้ก่อน'],
    agent: ['ใช้ตัวแทนน้อยสุดก่อน', 'ใช้ตัวแทนมากสุดก่อน'], last: ['ส่งนานที่สุดก่อน', 'ส่งล่าสุดก่อน'],
    status: ['ใช้งานก่อน', 'ปิดใช้งานก่อน']
};
const PART_QUICK = [
    ['active', 'ใช้งานอยู่'], ['missing', 'ยังไม่ส่งวันนี้'], ['agent', 'ตัวแทนใกล้ครบ'],
    ['nogps', 'ไม่มีพิกัด'], ['inactive', 'ปิดใช้งาน'], ['all', 'ทั้งหมด']
];

VIEWS.participants = {
    state: 'active', loaded: false, sort: { key: 'name', dir: 1 },

    init() {
        try { const s = JSON.parse(localStorage.getItem('HRPM_PART_SORT')); if (s && PART_COLS.some(c => c[0] === s.key)) this.sort = { key: s.key, dir: s.dir === -1 ? -1 : 1 }; } catch (e) { /* ใช้ค่าเริ่มต้น */ }
        $('partSort').innerHTML = PART_COLS.map(([k]) => [1, -1].map(d => `<option value="${k}:${d}">เรียง: ${PART_SORT_LABEL[k][d === 1 ? 0 : 1]}</option>`).join('')).join('');
        $('partSort').value = `${this.sort.key}:${this.sort.dir}`;
        $('partSort').addEventListener('change', e => { const [k, d] = e.target.value.split(':'); this.setSort(k, Number(d)); });
        $('partQuick').addEventListener('click', e => {
            const b = e.target.closest('[data-state]');
            if (!b) return;
            haptic();
            this.state = b.dataset.state;
            $('partState').value = this.state;
            this.render();
        });
        $('partTable').addEventListener('click', e => {
            const b = e.target.closest('[data-sort]');
            if (!b) return;
            const k = b.dataset.sort, col = PART_COLS.find(c => c[0] === k);
            this.setSort(k, this.sort.key === k ? -this.sort.dir : col[2]);
            const nb = $('partTable').querySelector(`[data-sort="${k}"]`);
            if (nb) nb.focus();
        });
        $('partSearch').addEventListener('input', debounce(() => this.render(), 250));
        $('partSite').addEventListener('change', () => this.render());
        $('partState').addEventListener('change', e => { this.state = e.target.value; this.render(); });
        $('partAdd').addEventListener('click', () => this.openForm());
        $('participantForm').addEventListener('submit', e => { e.preventDefault(); this.save(); });
        $('pfUseLast').addEventListener('click', () => {
            const p = this.editing;
            if (!p || p.lastLat === null || p.lastLat === undefined) return toast('ยังไม่มีพิกัดจากรายงานล่าสุด');
            $('pfLat').value = p.lastLat; $('pfLng').value = p.lastLng;
        });
        $('pfId').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); this.updatePicInfo(); this.checkId(); });
        $('pfDelete').addEventListener('click', () => this.remove());
        $('pfName').addEventListener('input', debounce(() => this.previewPic(), 300));
        $('pfPic').addEventListener('input', debounce(() => this.previewPic(), 300));
        $('pfPicFile').addEventListener('change', e => this.pickPic(e.target.files[0]));
        $('pfPicClear').addEventListener('click', () => this.clearPic());
        $('calPrev').addEventListener('click', () => this.shiftMonth(-1));
        $('calNext').addEventListener('click', () => this.shiftMonth(1));
    },

    show() { this.load(!this.loaded || this.stale); },
    reset() { this.loaded = false; this.stale = false; this.editing = null; },

    onLive() { this.stale = true; if (ST.view === 'participants' && !document.querySelector('dialog[open]')) this.load(true); },

    setSort(key, dir) {
        this.sort = { key, dir };
        $('partSort').value = `${key}:${dir}`;
        try { localStorage.setItem('HRPM_PART_SORT', JSON.stringify(this.sort)); } catch (e) { /* ไม่เป็นไร */ }
        this.render();
    },

    // เงื่อนไขของแต่ละตัวกรองสถานะ (ใช้ทั้งกรองตารางและนับจำนวนบนปุ่มกรองด่วน)
    matchState(p, state) {
        const limit = (ST.participantMeta || {}).agentLimit || 10;
        if (state === 'active') return p.active;
        if (state === 'inactive') return !p.active;
        if (state === 'missing') return p.active && !p.reportedToday;
        if (state === 'agent') return p.active && p.monthAgent >= Math.ceil(limit * 0.5);
        if (state === 'nogps') return p.active && (p.siteLat === null || p.siteLat === undefined);
        return true;
    },

    openWith(state) {
        this.state = state;
        $('partState').value = state;
        switchTab('participants');
    },

    async load(force) {
        if (!ST.participants || force) $('partTable').innerHTML = skeletonRows(6);
        await loadParticipants(force);
        this.loaded = true; this.stale = false;
        const sites = Array.from(new Set((ST.participants || []).map(p => p.site).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
        const cur = $('partSite').value;
        $('partSite').innerHTML = '<option value="">ทุกจุดขาย</option>' + sites.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
        $('partSite').value = sites.includes(cur) ? cur : '';
        $('siteList').innerHTML = sites.map(s => `<option value="${esc(s)}">`).join('');
        $('partState').value = this.state;
        this.render();
    },

    // ค้นหา + จุดขาย (ยังไม่รวมตัวกรองสถานะ)
    searched() {
        const q = $('partSearch').value.trim().toLowerCase(), site = $('partSite').value;
        return (ST.participants || []).filter(p => {
            if (site && p.site !== site) return false;
            return !q || (p.id + ' ' + p.name + ' ' + p.phone + ' ' + p.site).toLowerCase().includes(q);
        });
    },

    filtered(base) {
        const col = PART_COLS.find(c => c[0] === this.sort.key) || PART_COLS[0], val = col[3], dir = this.sort.dir;
        const cmp = (x, y) => typeof x === 'string' ? x.localeCompare(y, 'th') : x - y;
        return (base || this.searched()).filter(p => this.matchState(p, this.state))
            .sort((a, b) => cmp(val(a), val(b)) * dir || a.name.localeCompare(b.name, 'th'));
    },

    renderQuick(base) {
        $('partQuick').innerHTML = PART_QUICK.map(([k, label]) => {
            const n = base.filter(p => this.matchState(p, k)).length, on = this.state === k;
            if (!n && !on && k !== 'all' && k !== 'active') return '';
            return `<button type="button" class="qchip${on ? ' is-on' : ''}${k === 'missing' && n ? ' is-bad' : ''}" data-state="${k}" aria-pressed="${on}">${label}<span class="count-pill">${fmtNum(n)}</span></button>`;
        }).join('');
    },

    head(editable) {
        const { key, dir } = this.sort;
        return PART_COLS.map(([k, label]) => {
            const on = k === key, sort = on ? (dir === 1 ? 'ascending' : 'descending') : 'none';
            const hint = PART_SORT_LABEL[k][on ? (dir === 1 ? 1 : 0) : (PART_COLS.find(c => c[0] === k)[2] === 1 ? 0 : 1)];
            return `<th aria-sort="${sort}"><button type="button" class="th-sort${on ? ' is-on' : ''}" data-sort="${k}" title="เรียง: ${hint}">${label}<svg class="ic ic-14 th-arrow${on && dir === -1 ? ' is-desc' : ''}" aria-hidden="true"><use href="#i-${on ? 'arrow-up' : 'sort'}"/></svg></button></th>`;
        }).join('') + (editable ? '<th><span class="sr-only">จัดการ</span></th>' : '');
    },

    render() {
        const all = ST.participants || [], base = this.searched(), list = this.filtered(base);
        this.renderQuick(base);
        const meta = ST.participantMeta || { daysSoFar: bkkParts().d, agentLimit: 10 };
        const active = all.filter(p => p.active);
        $('partSub').textContent = `ใช้งาน ${fmtNum(active.length)} คน · ส่งแล้ววันนี้ ${fmtNum(active.filter(p => p.reportedToday).length)} · แสดง ${fmtNum(list.length)} คน`;
        if (!list.length) { $('partTable').innerHTML = emptyState(all.length ? 'ไม่พบผู้ใช้สิทธิ์ตามเงื่อนไข' : 'ยังไม่มีผู้ใช้สิทธิ์', 'users'); return; }
        const editable = can('participants.edit');
        $('partTable').innerHTML = `<table class="dtable">
          <thead><tr>${this.head(editable)}</tr></thead>
          <tbody>${list.map((p, i) => {
            const ratio = p.monthAgent / meta.agentLimit, cls = ratio >= 0.8 ? 'is-bad' : ratio >= 0.5 ? 'is-warn' : '';
            return `<tr data-i="${i}" tabindex="0" aria-label="${esc(p.name)}">
              <td class="td-main"><div class="cell-person">${avatarHtml(p.name, p.pic)}<span><b>${esc(p.name)}</b><small class="mono">${esc(p.id)}${p.phone ? ' · ' + esc(p.phone) : ''}</small></span></div></td>
              <td data-label="จุดขาย">${esc(p.site || '-')}${p.siteLat === null ? ' <span class="badge" title="ยังไม่มีพิกัดจุดขาย">ไม่มีพิกัด</span>' : ''}</td>
              <td data-label="วันนี้">${!p.active ? '-' : p.reportedToday ? `<span class="badge is-ok">${icon('check')}ส่งแล้ว</span>` : '<span class="badge is-bad">ยังไม่ส่ง</span>'}</td>
              <td data-label="เดือนนี้"><span class="mono">${Math.min(p.monthCount, meta.daysSoFar)}/${meta.daysSoFar}</span> <span class="cell-sub">วัน</span>${p.anomaliesMonth ? ` <span class="badge is-bad" title="ตำแหน่งผิดปกติเดือนนี้">${icon('alert')}${p.anomaliesMonth}</span>` : ''}</td>
              <td data-label="ตัวแทน"><span class="fi-side"><span class="mini-meter ${cls}"><i style="width:${Math.min(100, ratio * 100)}%"></i></span><span class="mono">${p.monthAgent}/${meta.agentLimit}</span></span></td>
              <td data-label="ล่าสุด">${p.lastReport ? relTime(p.lastReport) : '-'}</td>
              <td data-label="สถานะ">${p.active ? '<span class="badge is-ok">ใช้งาน</span>' : '<span class="badge">ปิดใช้งาน</span>'}</td>
              ${editable ? `<td class="td-actions"><div class="row-btns"><button type="button" class="icon-btn" data-edit="${i}" aria-label="แก้ไข ${esc(p.name)}">${icon('edit')}</button></div></td>` : ''}
            </tr>`;
          }).join('')}</tbody></table>`;
        $('partTable').querySelectorAll('tbody tr').forEach(tr => {
            const open = () => this.openDetail(list[tr.dataset.i].id);
            tr.addEventListener('click', e => { if (!e.target.closest('[data-edit]')) open(); });
            tr.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
        });
        $('partTable').querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => this.openForm(list[b.dataset.edit])));
    },

    // ---------- รายละเอียด + ปฏิทิน ----------
    async openDetail(id) {
        const all = await loadParticipants();
        const p = all.find(x => x.id === id);
        if (!p) return toast('ไม่พบข้อมูลผู้ใช้สิทธิ์');
        this.current = p;
        const now = bkkParts();
        this.calMonth = { y: now.y, m: now.m };
        $('pAvatar').outerHTML = avatarHtml(p.name, p.pic, 'avatar-lg').replace('<div class="avatar', '<div id="pAvatar" class="avatar');
        $('pTitle').textContent = p.name;
        $('pMeta').innerHTML = `<span class="mono">${esc(p.id)}</span> · ${esc(p.status || 'ผู้ใช้สิทธิ์')}${p.active ? '' : ' · <span class="badge">ปิดใช้งาน</span>'}`;
        const meta = ST.participantMeta || { daysSoFar: now.d, agentLimit: 10 };
        $('pStats').innerHTML = `
          <div class="kpi ${p.reportedToday ? 'is-ok' : 'is-bad'}"><small>วันนี้</small><b>${p.reportedToday ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}</b></div>
          <div class="kpi"><small>เดือนนี้</small><b>${Math.min(p.monthCount, meta.daysSoFar)}<span class="of">/${meta.daysSoFar} วัน</span></b></div>
          <div class="kpi ${p.monthAgent > meta.agentLimit ? 'is-bad' : p.monthAgent >= meta.agentLimit * 0.5 ? 'is-warn' : ''}"><small>ขายโดยตัวแทน</small><b>${p.monthAgent}<span class="of">/${meta.agentLimit}</span></b></div>
          <div class="kpi"><small>ทั้งปี</small><b>${fmtNum(p.yearCount)}<span class="of"> รายการ</span></b></div>`;
        $('pKv').innerHTML = [
            ['จุดขาย', esc(p.site || '-')],
            ['พิกัดจุดขาย', p.siteLat !== null ? `<a href="https://maps.google.com/maps?q=${p.siteLat},${p.siteLng}" target="_blank" rel="noopener" class="mono">${Number(p.siteLat).toFixed(5)}, ${Number(p.siteLng).toFixed(5)}</a>` : 'ยังไม่ได้ระบุ'],
            ['เบอร์โทร', p.phone ? `<a href="tel:${esc(p.phone.replace(/[^0-9+]/g, ''))}">${esc(p.phone)}</a>` : '-'],
            ['รายงานล่าสุด', p.lastReport ? thDateTime(p.lastReport) : '-'],
            ['หมายเหตุ', esc(p.note || '-')],
            ['แก้ไขล่าสุด', p.updatedBy ? `${esc(p.updatedBy)} · ${p.updatedAt ? thDateTime(p.updatedAt) : ''}` : '-']
        ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
        const acts = [];
        if (can('records.view')) acts.push(`<button type="button" class="btn btn-outline" id="pViewRecords">${icon('list')} ดูรายงาน</button>`);
        if (can('participants.edit')) acts.push(`<button type="button" class="btn btn-primary" id="pEdit">${icon('edit')} แก้ไข</button>`);
        $('pActions').innerHTML = acts.join('') || '<button type="button" class="btn btn-outline" data-close>ปิด</button>';
        if ($('pViewRecords')) $('pViewRecords').onclick = () => { $('participantModal').close(); VIEWS.records.openWith({ period: 'month', userIds: [p.id] }); };
        if ($('pEdit')) $('pEdit').onclick = () => { $('participantModal').close(); this.openForm(p); };
        showModal('participantModal');
        this.renderCalendar();
        this.initContact(p);
    },

    // ---------- บันทึกการติดต่อ (โทรแล้ว / ไม่รับสาย / แจ้งเหตุผล) ----------
    initContact(p) {
        const form = $('pContactForm');
        form.hidden = true;
        $('pContactNote').value = '';
        $('pContactList').innerHTML = '<li class="muted-text">กำลังโหลด…</li>';
        const reasons = ['ป่วย/ไม่สบาย', 'ติดธุระ', 'ร้าน/ตลาดปิด', 'ลืมส่ง', 'ไม่มีสัญญาณ/โทรศัพท์เสีย', 'ส่งไม่ผ่าน'];
        let result = null;
        $('pReasonChips').innerHTML = reasons.map(r => `<button type="button" class="badge reason" data-reason="${esc(r)}">${esc(r)}</button>`).join('');
        $('pReasonChips').querySelectorAll('[data-reason]').forEach(b => b.onclick = () => {
            const t = $('pContactNote');
            t.value = t.value ? t.value + ' · ' + b.dataset.reason : b.dataset.reason;
            t.focus();
        });
        document.querySelectorAll('[data-contact]').forEach(b => b.onclick = () => {
            haptic();
            result = b.dataset.contact;
            document.querySelectorAll('[data-contact]').forEach(x => x.classList.toggle('is-on', x === b));
            form.hidden = false;
            $('pReasonChips').hidden = !['reason', 'called'].includes(result);
            $('pContactNote').placeholder = result === 'reason' ? 'เหตุผลที่ไม่ได้ส่ง (ต้องระบุ)' : 'รายละเอียด (ไม่บังคับ)';
            $('pContactNote').focus();
        });
        $('pContactCancel').onclick = () => { form.hidden = true; document.querySelectorAll('[data-contact]').forEach(x => x.classList.remove('is-on')); };
        $('pContactSave').onclick = async () => {
            if (result === 'reason' && !$('pContactNote').value.trim()) { $('pContactNote').focus(); return toast('กรุณาระบุเหตุผล'); }
            $('pContactSave').disabled = true;
            const r = await api('staff.contacts.add', { participantId: p.id, result, note: $('pContactNote').value.trim() });
            $('pContactSave').disabled = false;
            if (!r.success) return toast(r.message || 'บันทึกไม่สำเร็จ');
            toast('บันทึกการติดต่อแล้ว');
            $('pContactCancel').onclick();
            $('pContactNote').value = '';
            this.renderContacts(r.contacts);
            if (VIEWS.overview && VIEWS.overview.data) VIEWS.overview.load();
        };
        api('staff.contacts.list', { participantId: p.id }).then(r => {
            if (this.current !== p) return;
            if (!r.success) { $('pContactList').innerHTML = `<li class="muted-text">${esc(r.message || 'โหลดไม่สำเร็จ')}</li>`; return; }
            this.renderContacts(r.contacts);
        });
    },

    renderContacts(list) {
        const cls = { called: 'is-ok', no_answer: 'is-bad', reason: 'is-warn', visit: '', other: '' };
        $('pContactList').innerHTML = list.length ? list.slice(0, 10).map(c => `
          <li><span class="badge ${cls[c.result] || ''}">${esc(c.resultLabel)}</span>
            <span class="cl-text">${c.note ? esc(c.note) : ''}<small>${thDateTime(c.ts)} · ${esc(c.staffName)}</small></span></li>`).join('')
            : '<li class="muted-text">ยังไม่มีบันทึกการติดต่อ</li>';
    },

    shiftMonth(d) {
        const c = this.calMonth;
        const dt = new Date(c.y, c.m + d, 1), now = bkkParts();
        if (dt.getFullYear() * 12 + dt.getMonth() > now.y * 12 + now.m) return;
        this.calMonth = { y: dt.getFullYear(), m: dt.getMonth() };
        this.renderCalendar();
    },

    async renderCalendar() {
        const { y, m } = this.calMonth, p = this.current;
        const days = new Date(y, m + 1, 0).getDate();
        $('calTitle').textContent = `${MONTHS[m]} ${y + 543}`;
        const nowP = bkkParts();
        $('calNext').disabled = y * 12 + m >= nowP.y * 12 + nowP.m;
        const dow = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(d => `<span class="cal-dow">${d}</span>`).join('');
        const lead = new Date(y, m, 1).getDay();
        $('calGrid').innerHTML = dow + '<span></span>'.repeat(lead) + Array.from({ length: days }, (_, i) => `<span class="cal-day skel">${i + 1}</span>`).join('');
        if (!can('records.view')) return;
        const from = `${y}-${pad2(m + 1)}-01`, to = `${y}-${pad2(m + 1)}-${pad2(days)}`;
        const r = await api('staff.records.list', { filters: { from, to, userIds: [p.id] }, all: true });
        if (this.current !== p || this.calMonth.y !== y || this.calMonth.m !== m) return;
        const byDay = {};
        (r.rows || []).forEach(x => { (byDay[x.date] = byDay[x.date] || []).push(x); });
        const today = todayIso();
        $('calGrid').innerHTML = dow + '<span></span>'.repeat(lead) + Array.from({ length: days }, (_, i) => {
            const iso = `${y}-${pad2(m + 1)}-${pad2(i + 1)}`, recs = byDay[iso] || [];
            const cls = ['cal-day'];
            let label = `${i + 1} ${MONTHS[m]}: `;
            if (iso > today) { cls.push('is-future'); label += 'ยังไม่ถึง'; }
            else if (!recs.length) { cls.push('is-miss'); label += 'ไม่ได้ส่ง'; }
            else {
                const agent = recs.some(x => x.type === AGENT_TYPE);
                cls.push(agent ? 'is-agent' : 'is-self');
                if (recs.some(x => x.anomaly)) cls.push('is-anom');
                label += `${agent ? 'ขายโดยตัวแทน' : 'ขายเอง'} ${recs[0].time} น.${recs.some(x => x.anomaly) ? ' (ตำแหน่งผิดปกติ)' : ''}`;
            }
            if (iso === today) cls.push('is-today');
            return `<span class="${cls.join(' ')}" title="${label}" aria-label="${label}">${i + 1}</span>`;
        }).join('');
    },

    // ---------- ฟอร์ม ----------
    openForm(p) {
        this.editing = p || null;
        $('pfTitle').textContent = p ? 'แก้ไขผู้ใช้สิทธิ์' : 'เพิ่มผู้ใช้สิทธิ์';
        $('pfId').value = p ? p.id : '';
        $('pfDangerZone').hidden = !p;
        this.checkId();
        $('pfName').value = p ? p.name : '';
        $('pfStatus').value = p ? p.status : `ใช้สิทธิ์ปี ${bkkParts().y + 543}`;
        $('pfPhone').value = p ? p.phone : '';
        $('pfSite').value = p ? p.site : '';
        $('pfLat').value = p && p.siteLat !== null ? p.siteLat : '';
        $('pfLng').value = p && p.siteLng !== null ? p.siteLng : '';
        $('pfPic').value = p ? p.picRaw : '';
        this.photo = null;
        $('pfPicFile').value = '';
        $('pfPic').disabled = false;
        this.previewPic();
        $('pfNote').value = p ? p.note : '';
        $('pfActive').checked = p ? p.active : true;
        $('pfUseLast').hidden = !p;
        showModal('participantFormModal');
        (p ? $('pfName') : $('pfId')).focus();
    },

    // รหัส: ห้ามซ้ำกับคนอื่น และเตือนเมื่อเปลี่ยนรหัสของคนเดิม
    checkId() {
        const id = $('pfId').value, p = this.editing, hint = $('pfIdHint');
        const taken = id.length === 6 && (ST.participants || []).some(x => x.id === id && (!p || x.id !== p.id));
        const renamed = p && id !== p.id;
        hint.hidden = !taken && !renamed;
        hint.className = 'hint ' + (taken ? 'is-error' : 'is-warn');
        hint.textContent = taken ? `รหัส ${id} มีผู้ใช้สิทธิ์คนอื่นใช้อยู่แล้ว` : renamed ? `ประวัติรายงานจะย้ายไปรหัสใหม่ และต้องเข้าสู่ระบบด้วยรหัสใหม่` : '';
        $('pfId').setAttribute('aria-invalid', String(!!taken));
        return !taken;
    },

    async remove() {
        const p = this.editing;
        if (!p) return;
        const reason = await VIEWS.records.askReason({
            title: `ลบบัญชี ${p.name}?`,
            text: `รหัส ${p.id} จะเข้าสู่ระบบไม่ได้อีก ประวัติรายงานเดิมยังเก็บไว้ในรายงาน รูปโปรไฟล์ IMG_${p.id} (ถ้ามี) จะย้ายไปถังขยะ และบันทึกเหตุผลไว้ใน Log`,
            okText: 'ลบบัญชี'
        });
        if (!reason) return;
        showLoading(true, 'กำลังลบ…');
        const r = await api('staff.participants.delete', { id: p.id, reason });
        showLoading(false);
        if (!r.success) return showMessage({ title: 'ลบไม่สำเร็จ', text: r.message, tone: 'bad' });
        $('participantFormModal').close();
        toast(`ลบบัญชี ${p.id} แล้ว`);
        this.load(true);
    },

    // ---------- รูปโปรไฟล์: วางลิงก์ หรืออัปโหลดไฟล์ (ส่งไปพร้อมการบันทึก) ----------
    previewPic() {
        const name = $('pfName').value || $('pfId').value || '?';
        const src = this.photo ? 'data:image/jpeg;base64,' + this.photo.base64 : this.picUrl($('pfPic').value.trim());
        $('pfPicPreview').outerHTML = avatarHtml(name, src, 'avatar-lg').replace('<div class="avatar', '<div id="pfPicPreview" class="avatar');
        $('pfPicClear').hidden = !this.photo && !$('pfPic').value.trim();
        this.updatePicInfo();
    },
    // ลิงก์ Drive (/file/d/…, open?id=…) → รูปย่อที่แสดงใน <img> ได้
    picUrl(raw) {
        const m = raw.match(/[?&]id=([\w-]{20,})/) || raw.match(/\/d\/([\w-]{20,})/);
        if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w240';
        return /^https:\/\//.test(raw) ? raw : '';
    },
    updatePicInfo() {
        const id = $('pfId').value || 'รหัส';
        $('pfPicInfo').textContent = this.photo
            ? `จะอัปโหลดเป็น IMG_${id} เมื่อกดบันทึก (${formatBytes(this.photo.bytes)})`
            : `อัปโหลดแล้วบันทึกลง Google Drive ชื่อไฟล์ IMG_${id}`;
    },
    async pickPic(file) {
        if (!file) return;
        if (!/^image\//.test(file.type)) { $('pfPicFile').value = ''; return toast('กรุณาเลือกไฟล์รูปภาพ'); }
        $('pfPicInfo').textContent = 'กำลังย่อขนาด…';
        try {
            this.photo = await compressImage(file, 512, 0.82);
            $('pfPic').value = '';
            $('pfPic').disabled = true;
            $('pfPic').placeholder = file.name;
        } catch (e) {
            this.photo = null;
            toast('อ่านรูปไม่ได้ กรุณาเลือกรูปใหม่');
        }
        this.previewPic();
    },
    clearPic() {
        this.photo = null;
        $('pfPicFile').value = '';
        $('pfPic').disabled = false;
        $('pfPic').placeholder = 'วางลิงก์ Google Drive หรือลิงก์รูป';
        $('pfPic').value = '';
        this.previewPic();
        $('pfPic').focus();
    },

    async save() {
        const p = this.editing;
        const data = {
            id: $('pfId').value.trim().toUpperCase(), name: $('pfName').value.trim(), status: $('pfStatus').value.trim(),
            phone: $('pfPhone').value.trim(), site: $('pfSite').value.trim(), siteLat: $('pfLat').value, siteLng: $('pfLng').value,
            picRaw: $('pfPic').value.trim(), note: $('pfNote').value.trim(), active: $('pfActive').checked
        };
        if (!/^[A-Z0-9]{6}$/.test(data.id)) { $('pfId').focus(); return toast('รหัสต้องเป็นตัวอักษรอังกฤษหรือตัวเลข 6 หลัก'); }
        if (!this.checkId()) { $('pfId').focus(); return toast(`รหัส ${data.id} มีผู้ใช้สิทธิ์คนอื่นใช้อยู่แล้ว`); }
        if (!data.name) { $('pfName').focus(); return toast('กรุณากรอกชื่อ-สกุล'); }
        if (p && data.id !== p.id) {
            const ok = await showMessage({ title: `เปลี่ยนรหัส ${p.id} → ${data.id}?`, text: `ประวัติรายงานทั้งหมดของ ${p.name} จะย้ายไปรหัสใหม่ ผู้ใช้สิทธิ์ต้องเข้าสู่ระบบด้วยรหัส ${data.id} แทน`, tone: 'warn', okText: 'เปลี่ยนรหัส', cancelText: 'ยกเลิก' });
            if (!ok) return;
        }
        if (p && p.active && !data.active) {
            const ok = await showMessage({ title: 'ปิดใช้งานผู้ใช้สิทธิ์?', text: `${data.name} จะเข้าสู่ระบบส่งรายงานไม่ได้ ข้อมูลเดิมยังอยู่ครบ`, tone: 'warn', okText: 'ปิดใช้งาน', cancelText: 'ยกเลิก' });
            if (!ok) return;
        }
        const photo = this.photo ? { data: this.photo.base64, mimeType: 'image/jpeg' } : null;
        showLoading(true, photo ? 'กำลังอัปโหลดรูปและบันทึก…' : 'กำลังบันทึก…');
        const r = await api('staff.participants.save', { participant: data, originalId: p ? p.id : '', photo });
        showLoading(false);
        if (!r.success) return showMessage({ title: 'บันทึกไม่สำเร็จ', text: r.message, tone: 'bad' });
        $('participantFormModal').close();
        toast(!p ? 'เพิ่มผู้ใช้สิทธิ์แล้ว' : data.id !== p.id ? `เปลี่ยนรหัสเป็น ${data.id} แล้ว · ย้ายประวัติ ${r.recordsMoved || 0} รายการ` : 'บันทึกการแก้ไขแล้ว');
        this.load(true);
    }
};
