// js/staff/admin.js — ผู้ดูแลระบบ: อนุมัติ/จัดการบัญชีเจ้าหน้าที่ และดู Log

const ACTION_LABELS = {
    'staff.signup': 'สมัครบัญชี (รออนุมัติ)', 'staff.signup_admin': 'สมัคร (ผู้ดูแลตั้งต้น)', 'staff.login': 'เข้าสู่ระบบ', 'staff.logout': 'ออกจากระบบ', 'staff.logout_all': 'ออกจากระบบทุกอุปกรณ์',
    'admin.staff.approve': 'อนุมัติบัญชี', 'admin.staff.reject': 'ปฏิเสธบัญชี', 'admin.staff.suspend': 'ระงับบัญชี', 'admin.staff.update': 'แก้ไขสิทธิ์',
    'admin.staff.revoke': 'บังคับออกจากระบบ', 'admin.staff.delete': 'ลบบัญชีเจ้าหน้าที่',
    'records.create': 'เพิ่มรายงาน', 'records.update': 'แก้ไขรายงาน', 'records.delete': 'ลบรายงาน', 'records.restore': 'กู้คืนรายงาน',
    'participants.create': 'เพิ่มผู้ใช้สิทธิ์', 'participants.update': 'แก้ไขผู้ใช้สิทธิ์', 'participants.rename': 'เปลี่ยนรหัสผู้ใช้สิทธิ์', 'participants.delete': 'ลบบัญชีผู้ใช้สิทธิ์',
    'participant.submit': 'ส่งรายงาน (ผู้ใช้สิทธิ์)', 'participant.login_failed': 'เข้าสู่ระบบไม่สำเร็จ (ผู้ใช้สิทธิ์)',
    'export.xlsx': 'ส่งออก Excel', 'export.pdf': 'ส่งออก PDF', 'export.gsheet': 'ส่งออก Google Sheets', 'export.logs': 'ส่งออก Log',
    'system.daily_summary': 'ส่งสรุปรายวัน', 'system.notify_remind': 'เตือนผู้ใช้สิทธิ์ที่ยังไม่ส่ง', 'system.monthly_report': 'ส่งรายงานประจำเดือน',
    'system.health': 'ตรวจสุขภาพระบบ', 'client.error': 'ข้อผิดพลาดบนเครื่องผู้ใช้', 'participants.contact': 'บันทึกการติดต่อ'
};
const ACTION_TONE = { delete: 'is-bad', reject: 'is-bad', suspend: 'is-bad', revoke: 'is-warn', rename: 'is-warn', login_failed: 'is-warn', approve: 'is-ok', create: 'is-ok', signup: 'is-accent', signup_admin: 'is-accent', restore: 'is-ok' };

VIEWS.admin = {
    tab: 'staff', staff: [], meta: null, logPage: 1, logReq: 0,

    init() {
        $('admTabs').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) this.setTab(b.dataset.t); });
        $('staffForm').addEventListener('submit', e => { e.preventDefault(); this.saveStaff(); });
        $('smRole').addEventListener('change', () => this.syncPermBoxes(true));
        $('smRevoke').addEventListener('click', () => this.revoke());
        $('smDelete').addEventListener('click', () => this.removeStaff());
        const reloadLogs = () => { this.logPage = 1; this.loadLogs(); };
        ['logFrom', 'logTo', 'logCategory'].forEach(id => $(id).addEventListener('change', reloadLogs));
        $('logSearch').addEventListener('input', debounce(reloadLogs, 350));
        $('logExport').addEventListener('click', () => this.exportLogs());
        $('logTo').value = todayIso();
        $('logFrom').value = isoDate(new Date(Date.now() - 30 * 86400000));
    },

    show() {
        this.setTab(this.tab);
    },

    reset() { Object.assign(this, { tab: 'staff', staff: [], meta: null, logPage: 1 }); this.logReq++; },

    setTab(t) {
        this.tab = t;
        $('admTabs').querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === t)));
        $('admStaff').hidden = t !== 'staff';
        $('admLogs').hidden = t !== 'logs';
        $('admSecurity').hidden = t !== 'security';
        if (t === 'staff') this.loadStaff(); else if (t === 'security') this.loadSecurity(); else this.loadLogs();
    },

    onLive() {
        if (ST.view !== 'admin' || document.querySelector('dialog[open]')) return;
        if (this.tab === 'logs' && this.logPage === 1) this.loadLogs(true);
        if (this.tab === 'security') this.loadSecurity(true);
    },

    // ---------- ความปลอดภัย: ป้องกันการเดารหัสผู้ใช้สิทธิ์ ----------
    async loadSecurity(silent) {
        if (!silent && !this.sec) $('secStatus').innerHTML = '<span class="skel skel-text" style="width:50%"></span>';
        const r = await api('admin.security.status');
        if (!r.success) { if (!silent) $('secStatus').innerHTML = `<p class="muted-text">${esc(r.message || 'โหลดไม่สำเร็จ — อัปเดตไฟล์ Code.gs และ Staff.gs ใน Apps Script')}</p>`; return; }
        this.sec = r;
        this.renderSecurity();
    },
    renderSecurity() {
        const r = this.sec, g = r.settings;
        const state = r.hardPause ? 'bad' : r.shieldOn ? 'warn' : 'ok';
        const title = r.hardPause ? 'ถูกโจมตีหนัก — พักการเข้าระบบจากเครื่องใหม่' : r.shieldOn ? 'โหมดป้องกันเปิดอยู่' : 'ปกติ';
        const detail = r.shieldOn ? `ถึง ${thTime(r.shieldUntil)} น. · ผู้ใช้สิทธิ์ที่เคยเข้าระบบจากเครื่องเดิมใช้งานได้ตามปกติ` : 'ไม่พบการไล่เดารหัสในช่วงนี้';
        $('secStatus').className = 'card sec-status is-' + state;
        $('secStatus').innerHTML = `
          <div class="sec-top"><span class="sec-dot" aria-hidden="true"></span><div><b>${title}</b><small>${detail}</small></div>
            <button type="button" class="btn-chip ${r.shieldOn ? '' : 'btn-chip-bad'}" id="secToggle">${r.shieldOn ? 'ปิดโหมดป้องกัน' : 'เปิดโหมดป้องกันเอง'}</button></div>
          <div class="sec-stats"><div><small>10 นาทีล่าสุด</small><b>${cnum(r.fails10min, 'f10')}</b><span>ครั้ง (เปิดโหมดป้องกันที่ ${g.SHIELD_FAILS})</span></div>
            <div><small>1 ชั่วโมงล่าสุด</small><b>${cnum(r.failsLastHour, 'f60')}</b><span>ครั้ง</span></div></div>`;
        Counting.scan($('secStatus'), this.secCounts || (this.secCounts = {}));
        $('secToggle').onclick = async () => {
            const on = !this.sec.shieldOn;
            if (!await showMessage({ title: on ? 'เปิดโหมดป้องกัน?' : 'ปิดโหมดป้องกัน?', text: on ? `ทุกการเข้าระบบจากเครื่องใหม่ต้องผ่านการตรวจความปลอดภัย ${g.SHIELD_MIN} นาที (ผู้ที่เคยเข้าจากเครื่องเดิมไม่กระทบ)` : 'กลับสู่การป้องกันปกติ (ยังล็อกเครื่องที่กรอกรหัสผิดบ่อยเหมือนเดิม)', tone: on ? 'warn' : 'ok', okText: on ? 'เปิด' : 'ปิด', cancelText: 'ยกเลิก' })) return;
            const res = await api('admin.security.shield', { on });
            if (!res.success) return toast(res.message || 'ทำไม่สำเร็จ');
            this.sec = res; this.renderSecurity(); toast(on ? 'เปิดโหมดป้องกันแล้ว' : 'ปิดโหมดป้องกันแล้ว');
        };
        const pm = r.perMinute;
        Charts.bars($('secChart'), {
            labels: pm.map((_, i) => String(pm.length - 1 - i)), height: 110, xLabels: [0, 30, pm.length - 1], ariaLabel: 'จำนวนรหัสที่ไม่มีในระบบต่อนาที',
            series: [{ label: 'ครั้ง', values: pm, color: Charts.color('--bad') }],
            tooltip: i => `<small>${pm.length - 1 - i === 0 ? 'นาทีนี้' : (pm.length - 1 - i) + ' นาทีก่อน'}</small><b>${pm[i]} ครั้ง</b>`
        });
        const label = { shield_on: 'เปิดโหมดป้องกันอัตโนมัติ', shield_on_manual: 'เปิดโหมดป้องกัน (ผู้ดูแล)', shield_off_manual: 'ปิดโหมดป้องกัน (ผู้ดูแล)', device_locked: 'ล็อกเครื่องที่กรอกรหัสผิดบ่อย' };
        $('secEvents').innerHTML = r.events.length ? r.events.slice(0, 12).map(e => `<li><span class="badge ${e.type === 'device_locked' ? 'is-warn' : e.type.startsWith('shield_on') ? 'is-bad' : 'is-ok'}">${esc(label[e.type] || e.type)}</span>
            <span class="sec-ev-text">${e.type === 'device_locked' ? `เครื่อง ${esc(e.device || '')} · ผิด ${e.fails} ครั้ง · ล่าสุดลอง ${esc(e.lastId || '-')}` : e.type === 'shield_on' ? `ผิด ${e.fails} ครั้งใน ${g.SHIELD_WINDOW_MIN} นาที จาก ${e.devices} เครื่อง` : esc(e.by || '')}<small>${thDateTime(e.t)}</small></span></li>`).join('')
            : '<li class="muted-text">ยังไม่มีเหตุการณ์</li>';
        $('secHow').innerHTML = [
            `กรอกรหัสที่ไม่มีในระบบ ${g.CHALLENGE_AT} ครั้งใน ${g.WINDOW_MIN} นาที → เครื่องนั้นต้องผ่าน "ตรวจความปลอดภัย" ก่อนลองครั้งต่อไป (เครื่องคำนวณเองประมาณ 1–2 วินาที)`,
            `ผิด ${g.LOCK_AT} ครั้ง → ล็อกเครื่องนั้น ${g.LOCK_MIN} นาที`,
            `ทั้งระบบผิดเกิน ${g.SHIELD_FAILS} ครั้งใน ${g.SHIELD_WINDOW_MIN} นาที → เปิดโหมดป้องกัน ${g.SHIELD_MIN} นาที: เครื่องใหม่ทุกเครื่องต้องผ่านการตรวจ (ยากขึ้น) ผิด ${g.SHIELD_LOCK_AT} ครั้งล็อกทันที และแจ้งอีเมลผู้ดูแล`,
            `ผิดเกิน ${g.HARD_FAILS} ครั้งใน ${g.SHIELD_WINDOW_MIN} นาที → พักการเข้าระบบจากเครื่องใหม่ชั่วคราว (เดารหัสถูกก็ไม่รู้ผล)`,
            `ผู้ใช้สิทธิ์ที่เคยเข้าระบบจากเครื่องเดิม (ภายใน ${g.TRUST_DAYS} วัน) ใช้งานได้ตามปกติตลอด`,
            `Log บันทึกการกรอกผิดทีละรายการไม่เกิน ${g.LOG_PER_DEVICE} ครั้งต่อเครื่อง ที่เหลือสรุปเป็นเหตุการณ์ด้านบน (Log ไม่ล้น)`
        ].map(x => `<li>${x}</li>`).join('');
        $('secLogs').onclick = () => { this.setTab('logs'); $('logSearch').value = 'security'; this.logPage = 1; this.loadLogs(); };
        $('secBadge').hidden = !r.shieldOn;
    },

    async refreshBadge() {
        const r = await api('admin.staff.list');
        if (r.success) { this.staff = r.staff; this.meta = r; this.updateBadge(); if (ST.view === 'admin' && this.tab === 'staff' && !document.querySelector('dialog[open]')) this.renderStaff(); }
    },

    updateBadge() {
        const n = this.staff.filter(s => s.status === 'pending').length;
        document.querySelectorAll('[data-pending-badge]').forEach(b => { b.hidden = !n; b.textContent = n; });
    },

    // ---------- บัญชีเจ้าหน้าที่ ----------
    async loadStaff() {
        if (!this.staff.length) { $('admPending').innerHTML = '<div class="skel" style="height:120px;border-radius:16px"></div>'; $('admStaffTable').innerHTML = skeletonRows(5, 4); }
        const r = await api('admin.staff.list');
        if (!r.success) { $('admStaffTable').innerHTML = emptyState(r.message || 'โหลดไม่สำเร็จ', 'wifi-off'); return; }
        this.staff = r.staff; this.meta = r;
        this.updateBadge();
        this.renderStaff();
    },

    providerBadge(s) { return s.provider === 'line' ? '<span class="badge is-ok">LINE</span>' : '<span class="badge is-accent">Google</span>'; },
    statusBadge(s) {
        const cls = { active: 'is-ok', pending: 'is-warn', suspended: 'is-bad', rejected: '' }[s.status];
        return `<span class="badge ${cls}">${STATUS_LABELS[s.status] || s.status}</span>`;
    },

    renderStaff() {
        const pending = this.staff.filter(s => s.status === 'pending');
        $('admPending').innerHTML = pending.length ? pending.map(s => `
          <div class="pending-item" data-id="${esc(s.id)}">
            <div class="cell-person">${avatarHtml(s.name, s.picture)}<span><b>${esc(s.name)}</b><small>${esc(s.email || 'ไม่มีอีเมล')} · ${this.providerBadge(s)} · ขอเมื่อ ${relTime(s.createdAt)}</small></span></div>
            <div class="pending-actions">
              <label class="sr-only" for="role-${esc(s.id)}">บทบาท</label>
              <select class="select" id="role-${esc(s.id)}">
                <option value="viewer">ผู้ดูข้อมูล (Viewer)</option>
                <option value="editor">ผู้แก้ไข (Editor)</option>
                <option value="admin">ผู้ดูแลระบบ (Admin)</option>
              </select>
              <button type="button" class="btn btn-danger" data-reject>${icon('user-x')} ปฏิเสธ</button>
              <button type="button" class="btn btn-primary" data-approve>${icon('user-check')} อนุมัติ</button>
            </div>
          </div>`).join('') : `<div class="card empty">${icon('check-circle')}ไม่มีคำขอที่รออนุมัติ</div>`;
        $('admPending').querySelectorAll('.pending-item').forEach(el => {
            const id = el.dataset.id;
            el.querySelector('[data-approve]').addEventListener('click', () => this.quickUpdate(id, { role: el.querySelector('select').value, status: 'active' }, 'อนุมัติแล้ว'));
            el.querySelector('[data-reject]').addEventListener('click', async () => {
                const s = this.staff.find(x => x.id === id);
                const ok = await showMessage({ title: 'ปฏิเสธคำขอ?', text: `${s.name} จะยังเข้าสู่ระบบได้แต่ไม่เห็นข้อมูลใดๆ`, tone: 'bad', okText: 'ปฏิเสธ', cancelText: 'ยกเลิก' });
                if (ok) this.quickUpdate(id, { status: 'rejected' }, 'ปฏิเสธคำขอแล้ว');
            });
        });

        const others = this.staff.filter(s => s.status !== 'pending');
        $('admStaffTable').innerHTML = others.length ? `<table class="dtable">
          <thead><tr><th>เจ้าหน้าที่</th><th>บัญชี</th><th>บทบาท</th><th>สถานะ</th><th>เข้าใช้ล่าสุด</th><th><span class="sr-only">จัดการ</span></th></tr></thead>
          <tbody>${others.map((s, i) => `
            <tr data-i="${i}" tabindex="0" aria-label="${esc(s.name)}">
              <td class="td-main"><div class="cell-person">${avatarHtml(s.name, s.picture)}<span><b>${esc(s.name)}${s.id === ST.me.id ? ' <span class="badge">คุณ</span>' : ''}</b><small>${esc(s.email || '-')}</small></span></div></td>
              <td data-label="บัญชี">${this.providerBadge(s)}</td>
              <td data-label="บทบาท">${esc(ROLE_LABELS[s.role] || s.role)}<div class="cell-sub">${s.role === 'admin' ? 'ทุกสิทธิ์' : s.storedPermissions.length + ' สิทธิ์'}</div></td>
              <td data-label="สถานะ">${this.statusBadge(s)}</td>
              <td data-label="ล่าสุด">${relTime(s.lastLoginAt)}</td>
              <td class="td-actions"><div class="row-btns"><button type="button" class="icon-btn" data-edit="${i}" aria-label="แก้ไขสิทธิ์ ${esc(s.name)}">${icon('edit')}</button></div></td>
            </tr>`).join('')}</tbody></table>` : emptyState('ยังไม่มีเจ้าหน้าที่', 'users');
        $('admStaffTable').querySelectorAll('tbody tr').forEach(tr => {
            const open = () => this.openStaff(others[tr.dataset.i]);
            tr.addEventListener('click', open);
            tr.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
        });
    },

    async quickUpdate(id, patch, msg) {
        showLoading(true, 'กำลังบันทึก…');
        const r = await api('admin.staff.update', Object.assign({ id }, patch));
        showLoading(false);
        if (!r.success) return showMessage({ title: 'บันทึกไม่สำเร็จ', text: r.message, tone: 'bad' });
        toast(msg);
        this.loadStaff();
    },

    openStaff(s) {
        this.editing = s;
        $('smAvatar').outerHTML = avatarHtml(s.name, s.picture, 'avatar-lg').replace('<div class="avatar', '<div id="smAvatar" class="avatar');
        $('smTitle').textContent = s.name;
        $('smMeta').innerHTML = `${this.providerBadge(s)} ${esc(s.email || '')} · สมัคร ${s.createdAt ? thDate(s.createdAt) : '-'}${s.approvedBy ? ' · อนุมัติโดย ' + esc(s.approvedBy) : ''}`;
        $('smRole').value = s.role === 'pending' ? 'viewer' : s.role;
        $('smStatus').value = s.status;
        $('smNote').value = s.note || '';
        const perms = (this.meta && this.meta.perms) || Object.keys(PERM_LABELS);
        $('smPerms').innerHTML = perms.filter(p => p !== 'admin').map(p => `<label><input type="checkbox" value="${p}" ${s.storedPermissions.includes(p) ? 'checked' : ''}>${PERM_LABELS[p]}</label>`).join('');
        this.syncPermBoxes(false);
        const self = s.id === ST.me.id;
        $('smDelete').disabled = self; $('smRole').disabled = self; $('smStatus').disabled = self;
        $('smDelete').title = self ? 'ไม่สามารถลบบัญชีของตัวเองได้' : '';
        showModal('staffModal');
    },

    syncPermBoxes(applyPreset) {
        const role = $('smRole').value;
        const preset = ((this.meta && this.meta.presets) || {})[role] || [];
        $('smPerms').querySelectorAll('input').forEach(cb => {
            if (role === 'admin') { cb.checked = true; cb.disabled = true; }
            else { cb.disabled = false; if (applyPreset) cb.checked = preset.includes(cb.value); }
        });
    },

    async saveStaff() {
        const s = this.editing;
        const role = $('smRole').value, status = $('smStatus').value;
        const permissions = Array.from($('smPerms').querySelectorAll('input:checked')).map(i => i.value);
        if (status === 'active' && role !== 'admin' && !permissions.length) return toast('เลือกอย่างน้อย 1 สิทธิ์ หรือเปลี่ยนสถานะ');
        if (s.status !== status && ['suspended', 'rejected'].includes(status)) {
            const ok = await showMessage({ title: status === 'suspended' ? 'ระงับบัญชีนี้?' : 'ปฏิเสธบัญชีนี้?', text: `${s.name} จะเข้าถึงข้อมูลไม่ได้ทันที`, tone: 'bad', okText: 'ยืนยัน', cancelText: 'ยกเลิก' });
            if (!ok) return;
        }
        showLoading(true, 'กำลังบันทึก…');
        const r = await api('admin.staff.update', { id: s.id, role, status, permissions, note: $('smNote').value.trim() });
        showLoading(false);
        if (!r.success) return showMessage({ title: 'บันทึกไม่สำเร็จ', text: r.message, tone: 'bad' });
        $('staffModal').close();
        toast('บันทึกสิทธิ์แล้ว');
        this.loadStaff();
    },

    async revoke() {
        const s = this.editing;
        const ok = await showMessage({ title: 'บังคับออกจากระบบ?', text: `${s.name} ต้องเข้าสู่ระบบใหม่ในทุกอุปกรณ์ (สิทธิ์ไม่เปลี่ยน)`, tone: 'warn', okText: 'ยืนยัน', cancelText: 'ยกเลิก' });
        if (!ok) return;
        const r = await api('admin.staff.revoke', { id: s.id });
        if (!r.success) return showMessage({ title: 'ทำรายการไม่สำเร็จ', text: r.message, tone: 'bad' });
        toast('บังคับออกจากระบบแล้ว');
        if (s.id === ST.me.id) endSession('คุณบังคับออกจากระบบบัญชีของตัวเอง กรุณาเข้าสู่ระบบใหม่');
    },

    async removeStaff() {
        const s = this.editing;
        const ok = await showMessage({ title: 'ลบบัญชีเจ้าหน้าที่?', text: `ลบ ${s.name} ออกจากระบบ หากเข้าสู่ระบบอีกครั้งจะเป็นบัญชีใหม่ที่รออนุมัติ`, tone: 'bad', okText: 'ลบบัญชี', cancelText: 'ยกเลิก' });
        if (!ok) return;
        showLoading(true, 'กำลังลบ…');
        const r = await api('admin.staff.delete', { id: s.id });
        showLoading(false);
        if (!r.success) return showMessage({ title: 'ลบไม่สำเร็จ', text: r.message, tone: 'bad' });
        $('staffModal').close();
        toast('ลบบัญชีแล้ว');
        this.loadStaff();
    },

    // ---------- Logs ----------
    logFilters() {
        return { from: $('logFrom').value, to: $('logTo').value, category: $('logCategory').value, q: $('logSearch').value.trim() };
    },

    actionBadge(a) {
        const key = Object.keys(ACTION_TONE).find(k => a.endsWith('.' + k) || a.endsWith('_' + k));
        return `<span class="badge ${key ? ACTION_TONE[key] : ''}">${esc(ACTION_LABELS[a] || a)}</span>`;
    },

    formatDetails(raw) {
        if (!raw) return '';
        try {
            const o = JSON.parse(raw);
            return Object.keys(o).map(k => {
                const v = o[k];
                return `${esc(k)}: ${Array.isArray(v) && v.length === 2 ? `${esc(v[0])} → ${esc(v[1])}` : esc(typeof v === 'object' ? JSON.stringify(v) : v)}`;
            }).join(' · ');
        } catch (e) { return esc(raw); }
    },

    async loadLogs(silent) {
        const seq = ++this.logReq;
        if (!silent) $('logTable').innerHTML = skeletonRows(5, 8);
        const r = await api('admin.logs.list', { filters: this.logFilters(), page: this.logPage, pageSize: 50 });
        if (seq !== this.logReq) return;
        if (!r.success) { $('logTable').innerHTML = emptyState(r.message || 'โหลดไม่สำเร็จ', 'wifi-off'); return; }
        const cats = { staff: 'เข้าสู่ระบบ', admin: 'ผู้ดูแลระบบ', records: 'แก้ไขรายงาน', participants: 'ผู้ใช้สิทธิ์', participant: 'ฝั่งผู้ใช้สิทธิ์', export: 'ส่งออก', system: 'ระบบ' };
        $('logSummary').innerHTML = `<span class="stat"><b>${fmtNum(r.total)}</b>รายการ</span>` + Object.keys(r.counts).map(c => `<span class="stat"><b>${fmtNum(r.counts[c])}</b>${esc(cats[c] || c)}</span>`).join('');
        $('logTable').innerHTML = r.rows.length ? `<table class="dtable">
          <thead><tr><th>เวลา</th><th>ผู้กระทำ</th><th>การกระทำ</th><th>เป้าหมาย</th><th>รายละเอียด</th></tr></thead>
          <tbody>${r.rows.map(l => `<tr>
            <td class="cell-when" data-label="เวลา"><b>${thDate(l.ts, { day: 'numeric', month: 'short', year: '2-digit' })}</b><span class="cell-sub mono">${thTime(l.ts, true)}</span></td>
            <td class="td-main"><div class="cell-person"><span><b>${esc(l.actorName || '-')}</b><small>${esc(ROLE_LABELS[l.actorRole] || (l.actorRole === 'participant' ? 'ผู้ใช้สิทธิ์' : l.actorRole) || '')}</small></span></div></td>
            <td data-label="การกระทำ">${this.actionBadge(l.action)}</td>
            <td data-label="เป้าหมาย">${esc(l.target)}</td>
            <td data-label="รายละเอียด"><span class="log-details">${this.formatDetails(l.details)}</span></td>
          </tr>`).join('')}</tbody></table>` : emptyState('ไม่พบ Log ตามเงื่อนไข', 'activity');
        const pages = Math.max(1, Math.ceil(r.total / r.pageSize));
        $('logPager').innerHTML = r.total <= r.pageSize ? '' : `<span>หน้า ${r.page}/${pages}</span><span class="pager-btns">
            <button type="button" class="btn-chip" data-pg="${r.page - 1}" ${r.page <= 1 ? 'disabled' : ''}>${icon('chevron-left', 'ic-16')} ใหม่กว่า</button>
            <button type="button" class="btn-chip" data-pg="${r.page + 1}" ${r.page >= pages ? 'disabled' : ''}>เก่ากว่า ${icon('chevron-right', 'ic-16')}</button></span>`;
        $('logPager').querySelectorAll('[data-pg]').forEach(b => b.addEventListener('click', () => { this.logPage = Number(b.dataset.pg); this.loadLogs(); }));
    },

    async exportLogs() {
        showLoading(true, 'กำลังเตรียมไฟล์ Log…');
        try {
            const [r] = await Promise.all([api('admin.logs.list', { filters: this.logFilters(), all: true }), VIEWS.exporter.loadXlsx()]);
            if (!r.success) throw new Error(r.message);
            const rows = [['เวลา', 'ผู้กระทำ', 'บทบาท', 'การกระทำ', 'รหัสการกระทำ', 'เป้าหมาย', 'รายละเอียด', 'อุปกรณ์']].concat(
                r.rows.map(l => [new Date(l.ts), l.actorName, l.actorRole, ACTION_LABELS[l.action] || l.action, l.action, l.target, l.details, l.userAgent]));
            const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
            ws['!cols'] = [{ wch: 20 }, { wch: 24 }, { wch: 12 }, { wch: 26 }, { wch: 24 }, { wch: 28 }, { wch: 60 }, { wch: 40 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Logs');
            XLSX.writeFile(wb, `HR-PaperMill_Logs_${this.logFilters().from || 'all'}_${this.logFilters().to || ''}.xlsx`);
            api('staff.log.client', { logAction: 'export.logs', target: 'Logs', details: { rows: r.rows.length, filters: this.logFilters() } });
        } catch (e) {
            showMessage({ title: 'ส่งออกไม่สำเร็จ', text: String(e.message || e), tone: 'bad' });
        } finally {
            showLoading(false);
        }
    }
};
