// js/staff/participants.js — รายชื่อผู้ใช้สิทธิ์, สถิติ, ปฏิทินการส่งรายเดือน, เพิ่ม/แก้ไข

VIEWS.participants = {
    state: 'active', loaded: false,

    init() {
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
        $('pfId').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); this.updatePicInfo(); });
        $('pfName').addEventListener('input', debounce(() => this.previewPic(), 300));
        $('pfPic').addEventListener('input', debounce(() => this.previewPic(), 300));
        $('pfPicFile').addEventListener('change', e => this.pickPic(e.target.files[0]));
        $('pfPicClear').addEventListener('click', () => this.clearPic());
        $('calPrev').addEventListener('click', () => this.shiftMonth(-1));
        $('calNext').addEventListener('click', () => this.shiftMonth(1));
    },

    show() { this.load(!this.loaded || this.stale); },

    onLive() { this.stale = true; if (ST.view === 'participants' && !document.querySelector('dialog[open]')) this.load(true); },

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

    filtered() {
        const q = $('partSearch').value.trim().toLowerCase(), site = $('partSite').value, limit = (ST.participantMeta || {}).agentLimit || 10;
        return (ST.participants || []).filter(p => {
            if (site && p.site !== site) return false;
            if (q && !(p.id + ' ' + p.name + ' ' + p.phone + ' ' + p.site).toLowerCase().includes(q)) return false;
            if (this.state === 'active') return p.active;
            if (this.state === 'inactive') return !p.active;
            if (this.state === 'missing') return p.active && !p.reportedToday;
            if (this.state === 'agent') return p.active && p.monthAgent >= Math.ceil(limit * 0.5);
            return true;
        }).sort((a, b) => a.name.localeCompare(b.name, 'th'));
    },

    render() {
        const list = this.filtered(), all = ST.participants || [];
        const meta = ST.participantMeta || { daysSoFar: bkkParts().d, agentLimit: 10 };
        const active = all.filter(p => p.active);
        $('partSub').textContent = `ใช้งาน ${fmtNum(active.length)} คน · ส่งแล้ววันนี้ ${fmtNum(active.filter(p => p.reportedToday).length)} · แสดง ${fmtNum(list.length)} คน`;
        if (!list.length) { $('partTable').innerHTML = emptyState(all.length ? 'ไม่พบผู้ใช้สิทธิ์ตามเงื่อนไข' : 'ยังไม่มีผู้ใช้สิทธิ์', 'users'); return; }
        const editable = can('participants.edit');
        $('partTable').innerHTML = `<table class="dtable">
          <thead><tr><th>ผู้ใช้สิทธิ์</th><th>จุดขาย</th><th>วันนี้</th><th>เดือนนี้</th><th>ขายโดยตัวแทน</th><th>ล่าสุด</th><th>สถานะ</th>${editable ? '<th><span class="sr-only">จัดการ</span></th>' : ''}</tr></thead>
          <tbody>${list.map((p, i) => {
            const ratio = p.monthAgent / meta.agentLimit, cls = ratio >= 0.8 ? 'is-bad' : ratio >= 0.5 ? 'is-warn' : '';
            return `<tr data-i="${i}" tabindex="0" aria-label="${esc(p.name)}">
              <td class="td-main"><div class="cell-person">${avatarHtml(p.name, p.pic)}<span><b>${esc(p.name)}</b><small class="mono">${esc(p.id)}${p.phone ? ' · ' + esc(p.phone) : ''}</small></span></div></td>
              <td data-label="จุดขาย">${esc(p.site || '-')}${p.siteLat === null ? ' <span class="badge" title="ยังไม่มีพิกัดจุดขาย">ไม่มีพิกัด</span>' : ''}</td>
              <td data-label="วันนี้">${!p.active ? '-' : p.reportedToday ? `<span class="badge is-ok">${icon('check')}ส่งแล้ว</span>` : '<span class="badge is-bad">ยังไม่ส่ง</span>'}</td>
              <td data-label="เดือนนี้"><span class="mono">${p.monthCount}/${meta.daysSoFar}</span> <span class="cell-sub">วัน</span>${p.anomaliesMonth ? ` <span class="badge is-bad" title="ตำแหน่งผิดปกติเดือนนี้">${icon('alert')}${p.anomaliesMonth}</span>` : ''}</td>
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
          <div class="kpi"><small>เดือนนี้</small><b>${p.monthCount}<span class="of">/${meta.daysSoFar} วัน</span></b></div>
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
        $('pfId').readOnly = !!p;
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
        if (!data.name) { $('pfName').focus(); return toast('กรุณากรอกชื่อ-สกุล'); }
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
        toast(p ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มผู้ใช้สิทธิ์แล้ว');
        this.load(true);
    }
};
