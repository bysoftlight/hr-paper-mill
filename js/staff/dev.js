// js/staff/dev.js — Dev Console (เฉพาะบทบาท dev): ภาพรวมธุรกิจ · องค์กรลูกค้า · แพลน · ใบแจ้งหนี้/การชำระเงิน · บัญชีรับเงิน · ผู้ใช้ทั้งระบบ
// ข้อมูลจาก dev.* (apps-script/Billing.gs) · หน้าแพ็กเกจสำหรับลูกค้า = เว็บไซต์ softlight (PRODUCT_URL ใน core.js) (สร้างลิงก์ข้อเสนอได้จากแท็บแพลน)

const ORG_ST = { trial: ['ทดลองใช้', 'is-accent'], active: ['ใช้งาน', 'is-ok'], past_due: ['ค้างชำระ', 'is-warn'], suspended: ['ระงับ', 'is-bad'], cancelled: ['ยกเลิก', ''] };
const ACC_ST = { trial: 'ทดลองใช้', active: 'ใช้งานได้', past_due: 'ค้างชำระ (ช่วงผ่อนผัน)', trial_expired: 'หมดช่วงทดลอง', expired: 'หมดอายุ', suspended: 'ระงับ', cancelled: 'ยกเลิก' };
const INV_ST = { pending: ['รอชำระ', 'is-warn'], paid: ['ชำระแล้ว', 'is-ok'], void: ['ยกเลิก', ''] };
const CYCLE_TH = { monthly: 'รายเดือน', yearly: 'รายปี' };
const ACC_TYPE_TH = { bank: 'บัญชีธนาคาร', promptpay: 'พร้อมเพย์', other: 'อื่นๆ' };
const baht = n => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const dShort = t => (t ? thDate(t, { day: 'numeric', month: 'short', year: '2-digit' }) : '-');

VIEWS.dev = {
    sec: 'overview', cache: {}, filt: { orgQ: '', orgSt: 'all', invSt: 'all', uKind: 'staff', uOrg: 'all', uQ: '' }, picked: new Set(), req: 0,

    init() {
        $('devTabs').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) { haptic(); this.setSec(b.dataset.s); } });
        $('devRefresh').addEventListener('click', () => { this.cache = {}; this.setSec(this.sec, true); });
        $('devForm').addEventListener('submit', e => { e.preventDefault(); if (this.onSubmit) this.onSubmit(); });
        $('devBody').addEventListener('click', e => this.onClick(e));
        $('devBody').addEventListener('input', e => this.onInput(e));
        $('devBody').addEventListener('change', e => this.onChange(e));
    },
    show() { this.setSec(this.sec); },
    reset() { this.cache = {}; this.picked.clear(); this.sec = 'overview'; },

    setSec(s, fresh) {
        this.sec = s;
        $('devTabs').querySelectorAll('[data-s]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.s === s)));
        centerSelectedTab($('devTabs'));
        const fn = { overview: 'loadOverview', orgs: 'loadOrgs', plans: 'loadPlans', invoices: 'loadInvoices', accounts: 'loadAccounts', users: 'loadUsers' }[s];
        this[fn](fresh);
    },
    skeleton(n = 4) {
        $('devBody').innerHTML = `<div class="kpis">${Array.from({ length: n }, () => '<div class="kpi" aria-hidden="true"><span class="skel skel-text" style="width:60%"></span><span class="skel" style="height:28px;width:45%;margin:6px 0"></span></div>').join('')}</div>`;
    },
    async get(action, key, args) {
        if (this.cache[key]) return this.cache[key];
        const r = await api(action, args || {});
        if (r.success) this.cache[key] = r;
        return r;
    },
    fail(r) { $('devBody').innerHTML = `<div class="card empty">${icon('alert')}${esc(r.message || 'โหลดข้อมูลไม่สำเร็จ')}</div>`; },
    dirty(...keys) { keys.forEach(k => delete this.cache[k]); delete this.cache.overview; },

    // ---------- ภาพรวม ----------
    async loadOverview() {
        const id = ++this.req;
        if (!this.cache.overview) this.skeleton(6);
        const r = await this.get('dev.overview', 'overview');
        if (id !== this.req || this.sec !== 'overview') return;
        if (!r.success) return this.fail(r);
        const t = r.totals, bs = t.byStatus;
        $('devSub').textContent = `อัปเดต ${thTime(r.generatedAt)} น. · ${fmtNum(t.orgs)} องค์กร · ผู้ใช้สิทธิ์ ${fmtNum(t.users)} คน`;
        const kpi = (label, val, sub, tone = '') => `<div class="kpi ${tone}"><small>${label}</small><b>${val}</b><span class="kpi-foot"><span>${sub}</span></span></div>`;
        const orgRow = (o, extra) => `<li><button type="button" class="dev-li" data-org="${esc(o.id)}"><span><b>${esc(o.name)}</b><small>${esc(o.planName)} · ${esc(extra)}</small></span>${icon('chevron-right')}</button></li>`;
        $('devBody').innerHTML = `
          <div class="kpis dev-kpis">
            ${kpi('รายได้ประจำต่อเดือน (MRR)', baht(t.mrr), `ต่อปี ${baht(t.arr)}`)}
            ${kpi('รับชำระเดือนนี้', baht(t.paidMonth), 'จากใบแจ้งหนี้ที่ชำระแล้ว')}
            ${kpi('ค้างชำระ', baht(t.unpaidAmount), `${fmtNum(t.unpaidCount)} ใบรอชำระ`, t.unpaidCount ? 'is-warn' : '')}
            ${kpi('องค์กรที่ใช้งาน', fmtNum(bs.active + bs.past_due), `ทดลองใช้ ${fmtNum(bs.trial)} · ระงับ/ยกเลิก ${fmtNum(bs.suspended + bs.cancelled)}`)}
            ${kpi('ผู้ใช้สิทธิ์ทั้งหมด', fmtNum(t.users), t.unassignedUsers ? `ยังไม่ผูกองค์กร ${fmtNum(t.unassignedUsers)} คน` : 'ผูกองค์กรครบแล้ว')}
            ${kpi('แพลนที่เปิดขาย', fmtNum(r.plans.length), r.plans.map(p => `${esc(p.name)} ${p.orgs}`).join(' · ') || '-')}
          </div>
          <div class="dev-grid">
            <section class="card dev-wide" aria-labelledby="devRevT"><div class="card-head"><h3 class="card-title" id="devRevT">รายได้ที่รับชำระ 6 เดือนล่าสุด</h3></div><div id="devRev" class="an-chart"></div></section>
            <section class="card" aria-labelledby="devTrialT"><div class="card-head"><h3 class="card-title" id="devTrialT">ทดลองใช้ใกล้หมด</h3><span class="muted-text">7 วัน</span></div>
              ${r.trialsEnding.length ? `<ul class="dev-list">${r.trialsEnding.map(o => orgRow(o, o.access.daysLeft <= 0 ? 'หมดวันนี้' : `เหลือ ${o.access.daysLeft} วัน`)).join('')}</ul>` : emptyState('ไม่มีองค์กรที่ใกล้หมดช่วงทดลอง', 'calendar')}</section>
            <section class="card" aria-labelledby="devAttT"><div class="card-head"><h3 class="card-title" id="devAttT">ต้องติดตาม</h3><span class="muted-text">ค้างชำระ / หมดอายุ</span></div>
              ${r.attention.length ? `<ul class="dev-list">${r.attention.map(o => orgRow(o, ACC_ST[o.access.state] || o.access.state)).join('')}</ul>` : emptyState('ทุกองค์กรชำระเงินตามกำหนด', 'check-circle')}</section>
          </div>`;
        const mths = r.revenue.map(x => MONTHS_SHORT[Number(x.month.slice(5, 7)) - 1]);
        Charts.bars($('devRev'), {
            labels: mths, height: 180, ariaLabel: 'รายได้รายเดือน', xLabels: mths.map((_, i) => i),
            series: [{ label: 'รายได้', values: r.revenue.map(x => x.amount), color: Charts.color('--accent') }],
            tooltip: i => `<small>${MONTHS[Number(r.revenue[i].month.slice(5, 7)) - 1]} ${Number(r.revenue[i].month.slice(0, 4)) + 543}</small><b>${baht(r.revenue[i].amount)}</b>`
        });
    },

    // ---------- องค์กร ----------
    async loadOrgs() {
        const id = ++this.req;
        if (!this.cache.orgs) this.skeleton(3);
        const r = await this.get('dev.orgs.list', 'orgs');
        if (id !== this.req || this.sec !== 'orgs') return;
        if (!r.success) return this.fail(r);
        $('devSub').textContent = `${fmtNum(r.orgs.length)} องค์กร${r.unassigned.users ? ` · ผู้ใช้สิทธิ์ที่ยังไม่ผูกองค์กร ${fmtNum(r.unassigned.users)} คน` : ''}`;
        const f = this.filt;
        $('devBody').innerHTML = `
          <section class="toolbar"><div class="toolbar-row">
            <div class="search-field grow"><svg class="ic ic-16" aria-hidden="true"><use href="#i-search"/></svg><input type="search" class="input input-sm" data-f="orgQ" value="${esc(f.orgQ)}" placeholder="ค้นหาชื่อ ผู้ติดต่อ อีเมล" aria-label="ค้นหาองค์กร"></div>
            <select class="select" data-f="orgSt" aria-label="สถานะ"><option value="all">ทุกสถานะ</option>${Object.keys(ORG_ST).map(k => `<option value="${k}" ${f.orgSt === k ? 'selected' : ''}>${ORG_ST[k][0]}</option>`).join('')}</select>
            <button type="button" class="btn btn-primary btn-sm" data-act="org-new">${icon('plus')}เพิ่มองค์กร</button>
          </div></section>
          <div class="table-card" id="devOrgTable"></div>`;
        this.renderOrgs();
    },
    orgBadge(o) {
        const [label, cls] = ORG_ST[o.status] || [o.status, ''];
        const a = o.access;
        const lock = a && !a.ok ? ` <span class="badge is-bad">${esc(ACC_ST[a.state] || a.state)}</span>` : a && a.state === 'past_due' && o.status !== 'past_due' ? ' <span class="badge is-warn">เลยกำหนด</span>' : '';
        return `<span class="badge ${cls}">${label}</span>${lock}`;
    },
    orgEnd(o) {
        const a = o.access, end = o.status === 'trial' ? o.trialEnd : o.periodEnd;
        if (!end) return '-';
        const d = a && a.daysLeft !== null && a.daysLeft !== undefined ? (a.ok ? (a.daysLeft <= 0 ? 'วันนี้' : `อีก ${a.daysLeft} วัน`) : 'หมดแล้ว') : '';
        return `${dShort(end)}<div class="cell-sub ${a && (a.warn || !a.ok) ? 'text-bad' : ''}">${d}</div>`;
    },
    renderOrgs() {
        const r = this.cache.orgs; if (!r || !$('devOrgTable')) return;
        const q = this.filt.orgQ.trim().toLowerCase(), st = this.filt.orgSt;
        const list = r.orgs.filter(o => (st === 'all' || o.status === st) && (!q || [o.name, o.contact, o.email, o.phone, o.id].join(' ').toLowerCase().includes(q)));
        const lim = (n, max) => `${fmtNum(n)}${max ? `<span class="of">/${fmtNum(max)}</span>` : ''}`;
        $('devOrgTable').innerHTML = list.length ? `<table class="dtable">
          <thead><tr><th>องค์กร</th><th>แพลน</th><th>สถานะ</th><th>ผู้ใช้สิทธิ์</th><th>เจ้าหน้าที่</th><th>สิ้นสุด</th><th><span class="sr-only">จัดการ</span></th></tr></thead>
          <tbody>${list.map(o => `
            <tr data-org="${esc(o.id)}" tabindex="0" aria-label="${esc(o.name)}">
              <td class="td-main"><div class="cell-person"><span class="avatar avatar-org" aria-hidden="true">${esc(o.name.replace(/^(บริษัท|บจก\.?|หจก\.?)\s*/, '').slice(0, 1))}</span><span><b>${esc(o.name)}</b><small>${esc(o.contact || o.email || o.id)}</small></span></div></td>
              <td data-label="แพลน">${esc(o.planName)}<div class="cell-sub">${CYCLE_TH[o.cycle]}${o.mrr ? ' · ' + baht(o.mrr) + '/ด.' : ''}</div></td>
              <td data-label="สถานะ">${this.orgBadge(o)}</td>
              <td data-label="ผู้ใช้สิทธิ์" class="mono">${lim(o.users, o.limits.users)}</td>
              <td data-label="เจ้าหน้าที่" class="mono">${lim(o.staffCount, o.limits.staff)}</td>
              <td data-label="สิ้นสุด">${this.orgEnd(o)}</td>
              <td class="td-actions"><div class="row-btns"><button type="button" class="icon-btn" data-act="org-edit" data-id="${esc(o.id)}" aria-label="แก้ไข ${esc(o.name)}">${icon('edit')}</button></div></td>
            </tr>`).join('')}</tbody></table>` : emptyState(r.orgs.length ? 'ไม่พบองค์กรที่ตรงกับตัวกรอง' : 'ยังไม่มีองค์กร — กด "เพิ่มองค์กร" เพื่อเริ่มทดลองใช้ฟรีให้ลูกค้า', 'users');
    },

    // ---------- ฟอร์มทั่วไปใน devModal ----------
    // fields: [{ k, label, type: text|email|tel|number|select|textarea|check|date, options: [[v, label]], req, hint, span, ph, min, max }]
    form({ title, sub = '', fields, values = {}, save = 'บันทึก', extra = '', danger = null, onSubmit }) {
        $('devMTitle').textContent = title;
        $('devMSub').textContent = sub;
        const val = k => (values[k] === null || values[k] === undefined ? '' : values[k]);
        const fld = f => {
            const id = 'devF_' + f.k, attrs = `id="${id}" data-k="${f.k}" ${f.req ? 'required' : ''} ${f.max ? `max="${f.max}"` : ''} ${f.min !== undefined ? `min="${f.min}"` : ''}`;
            let ctl;
            if (f.type === 'select') ctl = `<select class="select" ${attrs}>${f.options.map(([v, l]) => `<option value="${esc(v)}" ${String(val(f.k)) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
            else if (f.type === 'textarea') ctl = `<textarea class="input textarea" rows="${f.rows || 3}" ${attrs} maxlength="${f.maxlength || 2000}" placeholder="${esc(f.ph || '')}">${esc(val(f.k))}</textarea>`;
            else if (f.type === 'check') return `<label class="check ${f.span ? 'span-2' : ''}"><input type="checkbox" ${attrs} ${val(f.k) ? 'checked' : ''}><span>${esc(f.label)}${f.hint ? `<small class="hint">${esc(f.hint)}</small>` : ''}</span></label>`;
            else ctl = `<input class="input" type="${f.type || 'text'}" ${attrs} value="${esc(val(f.k))}" placeholder="${esc(f.ph || '')}" ${f.type === 'number' ? 'inputmode="decimal"' : ''} maxlength="${f.maxlength || 200}">`;
            return `<label class="field ${f.span ? 'span-2' : ''}"><span class="label">${esc(f.label)}${f.req ? ' <b class="text-bad" aria-hidden="true">*</b>' : ''}</span>${ctl}${f.hint ? `<small class="hint">${esc(f.hint)}</small>` : ''}</label>`;
        };
        $('devMBody').innerHTML = `${extra}<div class="form-grid-2">${fields.map(fld).join('')}</div><p class="form-err text-bad" id="devFErr" hidden></p>`;
        $('devMFoot').innerHTML = `${danger ? `<button type="button" class="btn btn-ghost btn-bad-text" id="devFDel">${esc(danger.label)}</button>` : ''}<button type="submit" class="btn btn-primary" id="devFSave">${esc(save)}</button>`;
        if (danger) $('devFDel').addEventListener('click', danger.fn);
        this.onSubmit = async () => {
            const data = {};
            let missing = null;
            fields.forEach(f => {
                const el = $('devF_' + f.k);
                data[f.k] = f.type === 'check' ? el.checked : el.value.trim();
                if (f.req && !data[f.k] && !missing) missing = f;
            });
            if (missing) { this.formErr(`กรุณากรอก${missing.label}`); $('devF_' + missing.k).focus(); return; }
            $('devFSave').disabled = true;
            try { await onSubmit(data); } finally { if ($('devFSave')) $('devFSave').disabled = false; }
        };
        showModal('devModal');
    },
    formErr(m) { const e = $('devFErr'); if (e) { e.textContent = m; e.hidden = !m; } },
    async run(action, args, okMsg, dirty) {
        const r = await api(action, args);
        if (!r.success) { if ($('devModal').open) this.formErr(r.message); else showMessage({ title: 'ทำรายการไม่สำเร็จ', text: r.message, tone: 'bad' }); return null; }
        if ($('devModal').open) $('devModal').close();
        toast(okMsg);
        this.dirty(...(dirty || []));
        this.setSec(this.sec);
        return r;
    },

    async orgForm(o) {
        const pr = await this.get('dev.orgs.list', 'orgs');
        if (!pr.success) return showMessage({ title: 'โหลดข้อมูลไม่สำเร็จ', text: pr.message, tone: 'bad' });
        const plans = pr.plans.filter(p => p.active || (o && p.id === o.plan));
        const isNew = !o;
        const fields = [
            { k: 'name', label: 'ชื่อบริษัท/องค์กร', req: true, span: true, ph: 'เช่น บริษัท เอบีซี จำกัด' },
            { k: 'contact', label: 'ผู้ติดต่อ' }, { k: 'phone', label: 'โทร', type: 'tel' },
            { k: 'email', label: 'อีเมล', type: 'email' }, { k: 'taxId', label: 'เลขผู้เสียภาษี' },
            { k: 'address', label: 'ที่อยู่ (สำหรับใบแจ้งหนี้)', type: 'textarea', rows: 2, span: true },
            { k: 'plan', label: 'แพลน', type: 'select', req: true, options: plans.map(p => [p.id, `${p.name} — ${p.priceMonthly ? baht(p.priceMonthly) + '/เดือน' : 'ติดต่อฝ่ายขาย'}`]) },
            { k: 'cycle', label: 'รอบบิล', type: 'select', options: [['monthly', 'รายเดือน'], ['yearly', 'รายปี']] },
            { k: 'maxUsers', label: 'ผู้ใช้สิทธิ์สูงสุด (กำหนดเอง)', type: 'number', min: 0, hint: 'เว้นว่าง = ตามแพลน' },
            { k: 'maxStaff', label: 'เจ้าหน้าที่สูงสุด (กำหนดเอง)', type: 'number', min: 0, hint: 'เว้นว่าง = ตามแพลน' }
        ];
        if (isNew) fields.push({ k: 'trialDays', label: 'ทดลองใช้ฟรี (วัน)', type: 'number', min: 0, max: 365, hint: 'ค่าเริ่มต้นตามแพลน (30 วัน) · 0 = ไม่ทดลอง' }, { k: 'startActive', label: 'เริ่มใช้งานจริงทันที (ไม่ทดลอง)', type: 'check' });
        fields.push({ k: 'note', label: 'หมายเหตุ', type: 'textarea', rows: 2, span: true });
        const v = o ? Object.assign({}, o, { maxUsers: o.maxUsers || '', maxStaff: o.maxStaff || '' }) : { plan: (plans.find(p => p.highlight) || plans[0] || {}).id, cycle: 'monthly', trialDays: 30 };
        this.form({
            title: isNew ? 'เพิ่มองค์กร' : 'แก้ไของค์กร', sub: isNew ? 'องค์กรใหม่เริ่มทดลองใช้ฟรีทันที' : o.id, fields, values: v, save: isNew ? 'สร้างและเริ่มทดลองใช้' : 'บันทึก',
            danger: isNew ? null : { label: 'ลบองค์กร', fn: () => this.orgDelete(o) },
            onSubmit: d => this.run('dev.orgs.save', { org: Object.assign({ id: o ? o.id : '' }, d) }, isNew ? 'สร้างองค์กรแล้ว' : 'บันทึกแล้ว', ['orgs', 'users'])
        });
    },
    async orgDelete(o) {
        const ok = await showMessage({ title: `ลบ ${o.name}?`, text: 'ลบได้เฉพาะองค์กรที่ไม่มีผู้ใช้และไม่มีใบแจ้งหนี้ — ถ้าเลิกใช้บริการ แนะนำให้เปลี่ยนสถานะเป็น "ยกเลิก"', tone: 'bad', okText: 'ลบ', cancelText: 'ยกเลิก' });
        if (ok) { $('devModal').close(); this.run('dev.orgs.delete', { id: o.id }, 'ลบองค์กรแล้ว', ['orgs']); }
    },

    async orgDetail(id) {
        const r = await this.get('dev.orgs.list', 'orgs');
        const o = r.success && r.orgs.find(x => x.id === id);
        if (!o) return toast('ไม่พบองค์กร');
        const a = o.access || {};
        const kv = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
        $('devMTitle').textContent = o.name;
        $('devMSub').textContent = `${o.id} · สร้างเมื่อ ${dShort(o.createdAt)}`;
        const act = (a2, label, cls = 'btn-tonal') => `<button type="button" class="btn btn-sm ${cls}" data-oact="${a2}">${label}</button>`;
        $('devMBody').innerHTML = `
          <div class="dev-org-status ${a.ok === false ? 'is-bad' : a.warn ? 'is-warn' : ''}">${this.orgBadge(o)}<span>${esc(a.message || ACC_ST[a.state] || '')}</span></div>
          <dl class="kv dev-kv">
            ${kv('แพลน', `${esc(o.planName)} · ${CYCLE_TH[o.cycle]}`)}
            ${kv(o.status === 'trial' ? 'ทดลองใช้' : 'รอบบิล', o.status === 'trial' ? `${dShort(o.trialStart)} – ${dShort(o.trialEnd)}` : `${dShort(o.periodStart)} – ${dShort(o.periodEnd)}`)}
            ${kv('ผู้ใช้สิทธิ์', `${fmtNum(o.users)}${o.limits.users ? ' / ' + fmtNum(o.limits.users) : ' (ไม่จำกัด)'}`)}
            ${kv('เจ้าหน้าที่', `${fmtNum(o.staffCount)}${o.limits.staff ? ' / ' + fmtNum(o.limits.staff) : ' (ไม่จำกัด)'}`)}
            ${kv('ผู้ติดต่อ', esc([o.contact, o.phone, o.email].filter(Boolean).join(' · ') || '-'))}
            ${o.taxId ? kv('เลขผู้เสียภาษี', esc(o.taxId)) : ''}
            ${o.note ? kv('หมายเหตุ', `<span class="pre">${esc(o.note)}</span>`) : ''}
          </dl>
          <div class="dev-actions">
            <h4>ทดลองใช้ฟรี</h4>
            <div class="row-wrap">${act('trial:7', '+7 วัน')}${act('trial:14', '+14 วัน')}${act('trial:30', '+30 วัน')}${act('trial-restart', 'เริ่มทดลองใหม่ 30 วัน')}</div>
            <h4>การสมัครสมาชิก</h4>
            <div class="row-wrap">${act('invoice', 'ออกใบแจ้งหนี้', 'btn-primary')}${o.status !== 'active' ? act('activate', 'เปิดใช้งาน') : ''}${o.status !== 'past_due' ? act('past_due', 'ตั้งเป็นค้างชำระ') : ''}${o.status !== 'suspended' ? act('suspended', 'ระงับ', 'btn-ghost btn-bad-text') : ''}${o.status !== 'cancelled' ? act('cancelled', 'ยกเลิกบริการ', 'btn-ghost btn-bad-text') : ''}</div>
            <h4>ผู้ใช้</h4>
            <div class="row-wrap">${act('users:staff', 'เจ้าหน้าที่ขององค์กร')}${act('users:participants', 'ผู้ใช้สิทธิ์ขององค์กร')}</div>
          </div>`;
        $('devMFoot').innerHTML = `<button type="button" class="btn btn-tonal" data-oact="edit">${icon('edit')}แก้ไขข้อมูล</button>`;
        this.onSubmit = null;
        $('devMBody').parentElement.querySelectorAll('[data-oact]').forEach(b => b.addEventListener('click', () => this.orgAction(o, b.dataset.oact)));
        showModal('devModal');
    },
    async orgAction(o, act) {
        if (act === 'edit') return this.orgForm(o);
        if (act.startsWith('trial')) {
            const days = act === 'trial-restart' ? 30 : Number(act.split(':')[1]);
            return this.run('dev.orgs.trial', { id: o.id, days, mode: act === 'trial-restart' ? 'start' : 'extend' }, `ทดลองใช้ถึง ${act === 'trial-restart' ? '30 วันจากวันนี้' : '+' + days + ' วัน'}`, ['orgs']);
        }
        if (act === 'invoice') { $('devModal').close(); return this.invoiceForm(o.id); }
        if (act.startsWith('users:')) { $('devModal').close(); Object.assign(this.filt, { uKind: act.split(':')[1], uOrg: o.id, uQ: '' }); return this.setSec('users'); }
        const status = act === 'activate' ? 'active' : act;
        let reason = '';
        if (status === 'suspended' || status === 'cancelled') {
            $('devModal').close();
            reason = await VIEWS.records.askReason({ title: status === 'suspended' ? `ระงับ ${o.name}?` : `ยกเลิกบริการ ${o.name}?`, text: 'ผู้ใช้สิทธิ์และเจ้าหน้าที่ขององค์กรนี้จะใช้งานไม่ได้ทันที (Dev ยังจัดการได้) · เปิดใช้งานใหม่ได้ภายหลัง', okText: status === 'suspended' ? 'ระงับ' : 'ยกเลิกบริการ' });
            if (!reason) return;
        }
        this.run('dev.orgs.status', { id: o.id, status, reason }, `เปลี่ยนสถานะเป็น "${ORG_ST[status][0]}" แล้ว`, ['orgs']);
    },

    // ---------- แพลน ----------
    async loadPlans() {
        const id = ++this.req;
        if (!this.cache.plans) this.skeleton(3);
        const r = await this.get('dev.plans.list', 'plans');
        if (id !== this.req || this.sec !== 'plans') return;
        if (!r.success) return this.fail(r);
        $('devSub').textContent = `${fmtNum(r.plans.length)} แพลน · ${fmtNum(r.plans.filter(p => p.public && p.active).length)} แพลนแสดงในหน้าแพ็กเกจ`;
        const lim = n => (n ? fmtNum(n) : 'ไม่จำกัด');
        $('devBody').innerHTML = `
          <section class="toolbar"><div class="toolbar-row">
            <span class="muted-text grow">แพลนที่ "แสดงในหน้าแพ็กเกจ" จะปรากฏในหน้าแพ็กเกจบนเว็บไซต์ softlight ให้ลูกค้าดูและดาวน์โหลดเป็น PDF/PNG</span>
            <button type="button" class="btn btn-tonal btn-sm" data-act="offer">${icon('external')}สร้างลิงก์ข้อเสนอ</button>
            <button type="button" class="btn btn-primary btn-sm" data-act="plan-new">${icon('plus')}เพิ่มแพลน</button>
          </div></section>
          <div class="dev-plans">${r.plans.map(p => `
            <article class="card dev-plan ${p.highlight ? 'is-hl' : ''} ${p.active ? '' : 'is-off'}">
              <div class="dev-plan-top"><b>${esc(p.name)}</b>${p.highlight ? '<span class="badge is-accent">แนะนำ</span>' : ''}${!p.active ? '<span class="badge">ปิดขาย</span>' : !p.public ? '<span class="badge">ซ่อนจากหน้าแพ็กเกจ</span>' : ''}</div>
              <p class="muted-text">${esc(p.tagline || '')}</p>
              <div class="dev-price">${p.priceMonthly ? `${baht(p.priceMonthly)}<small>/เดือน</small>` : 'ติดต่อฝ่ายขาย'}</div>
              <small class="muted-text">${p.fromPrice ? 'ราคาเริ่มต้น · ' : ''}${p.priceYearly ? `${baht(p.priceYearly)}/ปี` : ''}${p.setupFee ? ` · ติดตั้ง ${baht(p.setupFee)}` : ''}${p.trialDays ? ` · ทดลองฟรี ${p.trialDays} วัน` : ''}</small>
              <ul class="dev-feat"><li>${icon('users')}ผู้ใช้สิทธิ์ ${lim(p.maxUsers)} · เจ้าหน้าที่ ${lim(p.maxStaff)}</li>${p.features.slice(0, 6).map(f => `<li>${icon('check')}${esc(f)}</li>`).join('')}</ul>
              <div class="dev-plan-foot"><code>${esc(p.id)}</code><button type="button" class="btn btn-tonal btn-sm" data-act="plan-edit" data-id="${esc(p.id)}">${icon('edit')}แก้ไข</button></div>
            </article>`).join('')}</div>`;
    },
    planForm(p) {
        const isNew = !p;
        this.form({
            title: isNew ? 'เพิ่มแพลน' : `แก้ไขแพลน ${p.name}`, sub: isNew ? '' : 'รหัสแพลนเปลี่ยนไม่ได้ (องค์กรอ้างอิงอยู่)', save: 'บันทึกแพลน',
            values: p ? Object.assign({}, p, { features: p.features.join('\n'), maxUsers: p.maxUsers || '', maxStaff: p.maxStaff || '', setupFee: p.setupFee || '' }) : { public: true, active: true, trialDays: 30, setupFee: 5000 },
            fields: [
                { k: 'id', label: 'รหัสแพลน', req: true, ph: 'เช่น pro', hint: 'a-z, 0-9, - หรือ _' }, { k: 'name', label: 'ชื่อแพลน', req: true, ph: 'เช่น Pro' },
                { k: 'tagline', label: 'คำโปรย', span: true, ph: 'เช่น คุ้มที่สุดสำหรับองค์กรทั่วไป' },
                { k: 'priceMonthly', label: 'ราคา/เดือน (บาท)', type: 'number', min: 0, hint: '0 = ติดต่อฝ่ายขาย' }, { k: 'priceYearly', label: 'ราคา/ปี (บาท)', type: 'number', min: 0, hint: 'เว้นว่าง = ไม่มีแบบรายปี' },
                { k: 'maxUsers', label: 'ผู้ใช้สิทธิ์สูงสุด', type: 'number', min: 0, hint: 'เว้นว่าง/0 = ไม่จำกัด' }, { k: 'maxStaff', label: 'เจ้าหน้าที่สูงสุด', type: 'number', min: 0, hint: 'เว้นว่าง/0 = ไม่จำกัด' },
                { k: 'setupFee', label: 'ค่าติดตั้ง ครั้งเดียว (บาท)', type: 'number', min: 0, hint: '0 = ไม่มีค่าติดตั้ง' }, { k: 'trialDays', label: 'วันทดลองใช้', type: 'number', min: 0, max: 365 },
                { k: 'order', label: 'ลำดับในหน้าแพ็กเกจ', type: 'number', min: 0 },
                { k: 'fromPrice', label: 'แสดงเป็น "เริ่มต้น" (ราคาปรับตามขอบเขต)', type: 'check' },
                { k: 'features', label: 'ฟีเจอร์ (บรรทัดละข้อ)', type: 'textarea', rows: 6, span: true },
                { k: 'highlight', label: 'แพลนแนะนำ (ไฮไลต์ในหน้าแพ็กเกจ)', type: 'check', span: true },
                { k: 'public', label: 'แสดงในหน้าแพ็กเกจ', type: 'check', span: true },
                { k: 'active', label: 'เปิดขาย (ปิด = เลือกให้องค์กรใหม่ไม่ได้ องค์กรเดิมยังใช้ต่อได้)', type: 'check', span: true }
            ],
            onSubmit: d => this.run('dev.plans.save', { plan: Object.assign(d, { isNew }) }, 'บันทึกแพลนแล้ว', ['plans', 'orgs'])
        });
        if (!isNew) $('devF_id').readOnly = true;
    },
    async offerForm() {
        const r = await this.get('dev.plans.list', 'plans');
        if (!r.success) return;
        const plans = r.plans.filter(p => p.active);
        this.form({
            title: 'สร้างลิงก์ข้อเสนอ', sub: 'หน้าแพ็กเกจเฉพาะลูกค้า — แชร์ลิงก์ หรือเปิดแล้วดาวน์โหลด PDF/PNG', save: 'สร้างลิงก์',
            extra: `<fieldset class="fgroup"><legend>แพลนที่เสนอ</legend><div class="dev-pick">${plans.map(p => `<label class="check"><input type="checkbox" data-plan="${esc(p.id)}" ${p.public ? 'checked' : ''}><span>${esc(p.name)} <small class="muted-text">${p.priceMonthly ? baht(p.priceMonthly) + '/เดือน' : 'ติดต่อฝ่ายขาย'}${p.public ? '' : ' · ซ่อนจากหน้าแพ็กเกจปกติ'}</small></span></label>`).join('')}</div></fieldset>`,
            values: { cycle: 'monthly', valid: isoDate(new Date(Date.now() + 30 * 86400000)) },
            fields: [
                { k: 'to', label: 'เสนอให้ (ชื่อลูกค้า)', ph: 'เช่น บริษัท เอบีซี จำกัด', span: true },
                { k: 'cycle', label: 'แสดงราคา', type: 'select', options: [['monthly', 'รายเดือน'], ['yearly', 'รายปี']] },
                { k: 'valid', label: 'ข้อเสนอใช้ได้ถึง', type: 'date' },
                { k: 'discount', label: 'ส่วนลด (%)', type: 'number', min: 0, max: 90 },
                { k: 'ref', label: 'เลขที่ข้อเสนอ', ph: 'เช่น QT-2569-001' },
                { k: 'note', label: 'ข้อความถึงลูกค้า', type: 'textarea', rows: 2, span: true, maxlength: 300 }
            ],
            onSubmit: d => {
                const ids = [...$('devMBody').querySelectorAll('[data-plan]:checked')].map(x => x.dataset.plan);
                if (!ids.length) return this.formErr('กรุณาเลือกแพลนอย่างน้อย 1 แพลน');
                const q = new URLSearchParams();
                q.set('plans', ids.join(','));
                if (d.cycle === 'yearly') q.set('cycle', 'yearly');
                ['to', 'valid', 'ref', 'note'].forEach(k => { if (d[k]) q.set(k, d[k]); });
                if (Number(d.discount) > 0) q.set('off', String(Math.min(90, Math.round(Number(d.discount)))));
                const url = PRODUCT_URL + '?' + q.toString() + '#packages';
                $('devMBody').innerHTML = `<p>ลิงก์หน้าแพ็กเกจสำหรับ <b>${esc(d.to || 'ลูกค้า')}</b> — ส่งให้ลูกค้าเปิดดู หรือเปิดแล้วกด "ดาวน์โหลด PDF / PNG"</p>
                  <label class="field"><span class="label">ลิงก์</span><input class="input mono" id="devOfferUrl" readonly value="${esc(url)}"></label>`;
                $('devMFoot').innerHTML = `<button type="button" class="btn btn-tonal" id="devOfferCopy">${icon('file')}คัดลอกลิงก์</button>${navigator.share ? `<button type="button" class="btn btn-tonal" id="devOfferShare">แชร์</button>` : ''}<a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener">${icon('external')}เปิดหน้าแพ็กเกจ</a>`;
                this.onSubmit = null;
                $('devOfferCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(url); toast('คัดลอกลิงก์แล้ว'); } catch (e) { $('devOfferUrl').select(); document.execCommand('copy'); toast('คัดลอกลิงก์แล้ว'); } });
                if ($('devOfferShare')) $('devOfferShare').addEventListener('click', () => navigator.share({ title: 'แพ็กเกจ HR Paper Mill', url }).catch(() => {}));
            }
        });
    },

    // ---------- ใบแจ้งหนี้ ----------
    async loadInvoices() {
        const id = ++this.req;
        if (!this.cache.invoices) this.skeleton(3);
        const r = await this.get('dev.invoices.list', 'invoices');
        if (id !== this.req || this.sec !== 'invoices') return;
        if (!r.success) return this.fail(r);
        const pend = r.invoices.filter(i => i.status === 'pending');
        $('devSub').textContent = `${fmtNum(r.invoices.length)} ใบ · รอชำระ ${fmtNum(pend.length)} ใบ (${baht(pend.reduce((a, i) => a + i.amount, 0))})`;
        const st = this.filt.invSt;
        $('devBody').innerHTML = `
          <section class="toolbar"><div class="toolbar-row">
            <div class="set-seg seg-sm" role="radiogroup" aria-label="สถานะใบแจ้งหนี้" data-seg="invSt">${[['all', 'ทั้งหมด'], ['pending', 'รอชำระ'], ['paid', 'ชำระแล้ว'], ['void', 'ยกเลิก']].map(([v, l]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${st === v}">${l}</button>`).join('')}</div>
            <span class="grow"></span>
            <button type="button" class="btn btn-primary btn-sm" data-act="inv-new">${icon('plus')}ออกใบแจ้งหนี้</button>
          </div></section>
          <div class="table-card" id="devInvTable"></div>`;
        this.renderInvoices();
    },
    renderInvoices() {
        const r = this.cache.invoices; if (!r || !$('devInvTable')) return;
        const list = r.invoices.filter(i => this.filt.invSt === 'all' || i.status === this.filt.invSt);
        $('devInvTable').innerHTML = list.length ? `<table class="dtable">
          <thead><tr><th>เลขที่</th><th>องค์กร</th><th>แพลน</th><th>จำนวนเงิน</th><th>สถานะ</th><th>ครบกำหนด</th><th><span class="sr-only">จัดการ</span></th></tr></thead>
          <tbody>${list.map(i => `<tr>
            <td class="td-main"><b class="mono">${esc(i.id)}</b><div class="cell-sub">ออก ${dShort(i.issued)}</div></td>
            <td data-label="องค์กร">${esc(i.orgName)}</td>
            <td data-label="แพลน">${esc(i.planName)}<div class="cell-sub">${CYCLE_TH[i.cycle] || i.cycle} · ${dShort(i.periodStart)} – ${dShort(i.periodEnd)}</div></td>
            <td data-label="จำนวนเงิน" class="mono"><b>${baht(i.amount)}</b></td>
            <td data-label="สถานะ"><span class="badge ${INV_ST[i.status][1]}">${INV_ST[i.status][0]}</span>${i.overdue ? ' <span class="badge is-bad">เกินกำหนด</span>' : ''}${i.status === 'paid' ? `<div class="cell-sub">${dShort(i.paidAt)}${i.ref ? ' · ' + esc(i.ref) : ''}</div>` : ''}</td>
            <td data-label="ครบกำหนด">${dShort(i.due)}</td>
            <td class="td-actions"><div class="row-btns">
              <button type="button" class="icon-btn" data-act="inv-print" data-id="${esc(i.id)}" aria-label="พิมพ์ใบแจ้งหนี้ ${esc(i.id)}" title="พิมพ์ / PDF">${icon('download')}</button>
              ${i.status === 'pending' ? `<button type="button" class="btn btn-sm btn-tonal" data-act="inv-pay" data-id="${esc(i.id)}">บันทึกชำระ</button><button type="button" class="icon-btn" data-act="inv-void" data-id="${esc(i.id)}" aria-label="ยกเลิกใบแจ้งหนี้ ${esc(i.id)}" title="ยกเลิก">${icon('x')}</button>` : ''}
            </div></td></tr>`).join('')}</tbody></table>` : emptyState('ยังไม่มีใบแจ้งหนี้', 'file');
    },
    async invoiceForm(orgId) {
        const [o, pl] = await Promise.all([this.get('dev.orgs.list', 'orgs'), this.get('dev.plans.list', 'plans')]);
        if (!o.success || !pl.success) return showMessage({ title: 'โหลดข้อมูลไม่สำเร็จ', text: o.message || pl.message, tone: 'bad' });
        if (!o.orgs.length) return showMessage({ title: 'ยังไม่มีองค์กร', text: 'เพิ่มองค์กรก่อน แล้วจึงออกใบแจ้งหนี้', tone: 'info' });
        const org = o.orgs.find(x => x.id === orgId) || o.orgs[0];
        this.form({
            title: 'ออกใบแจ้งหนี้', sub: 'ชำระแล้วระบบจะต่ออายุองค์กรถึงสิ้นสุดรอบของใบนี้ให้อัตโนมัติ', save: 'ออกใบแจ้งหนี้',
            values: { org: org.id, plan: org.plan, cycle: org.cycle, due: isoDate(new Date(Date.now() + 7 * 86400000)), withSetup: !org.periodEnd },
            fields: [
                { k: 'org', label: 'องค์กร', type: 'select', req: true, span: true, options: o.orgs.map(x => [x.id, x.name]) },
                { k: 'plan', label: 'แพลน', type: 'select', options: pl.plans.map(p => [p.id, p.name]) },
                { k: 'cycle', label: 'รอบบิล', type: 'select', options: [['monthly', 'รายเดือน'], ['yearly', 'รายปี']] },
                { k: 'amount', label: 'จำนวนเงิน (บาท)', type: 'number', min: 0, hint: 'เว้นว่าง = ตามราคาแพลน' },
                { k: 'due', label: 'ครบกำหนดชำระ', type: 'date' },
                { k: 'withSetup', label: 'รวมค่าติดตั้งครั้งเดียว (ใบแรกขององค์กร)', type: 'check', span: true, hint: 'คิดตามค่าติดตั้งของแพลน เมื่อไม่ได้กรอกจำนวนเงินเอง' },
                { k: 'periodStart', label: 'เริ่มรอบ', type: 'date', hint: 'เว้นว่าง = ต่อจากรอบเดิม / วันนี้' },
                { k: 'note', label: 'หมายเหตุ', type: 'textarea', rows: 2, span: true }
            ],
            onSubmit: d => this.run('dev.invoices.create', d, 'ออกใบแจ้งหนี้แล้ว', ['invoices'])
        });
        $('devF_org').addEventListener('change', e => { const x = o.orgs.find(y => y.id === e.target.value); if (x) { $('devF_plan').value = x.plan; $('devF_cycle').value = x.cycle; } });
    },
    async payForm(id) {
        const r = this.cache.invoices, inv = r && r.invoices.find(i => i.id === id);
        if (!inv) return;
        this.form({
            title: `บันทึกการชำระ ${inv.id}`, sub: `${inv.orgName} · ${baht(inv.amount)}`, save: 'ยืนยันรับชำระ',
            values: { paidAt: todayIso(), account: (r.accounts.find(a => a.isDefault) || r.accounts[0] || {}).id || '' },
            fields: [
                { k: 'paidAt', label: 'วันที่ชำระ', type: 'date', req: true },
                { k: 'account', label: 'เข้าบัญชี', type: 'select', options: [['', '— ไม่ระบุ —']].concat(r.accounts.map(a => [a.id, `${a.bank || ACC_TYPE_TH[a.type]} ${a.number}`])) },
                { k: 'method', label: 'ช่องทาง', ph: 'เช่น โอนเงิน, พร้อมเพย์, เช็ค' },
                { k: 'ref', label: 'เลขอ้างอิง / หมายเลขสลิป' }
            ],
            onSubmit: d => this.run('dev.invoices.pay', Object.assign({ id }, d), 'บันทึกการชำระแล้ว · ต่ออายุองค์กรแล้ว', ['invoices', 'orgs'])
        });
    },
    async voidInvoice(id) {
        const reason = await VIEWS.records.askReason({ title: `ยกเลิก ${id}?`, text: 'ใบแจ้งหนี้จะไม่ถูกนับเป็นยอดค้างชำระ (ยังเห็นในประวัติ)', okText: 'ยกเลิกใบแจ้งหนี้' });
        if (reason) this.run('dev.invoices.void', { id, reason }, 'ยกเลิกใบแจ้งหนี้แล้ว', ['invoices']);
    },
    async printInvoice(id) {
        const r = this.cache.invoices, inv = r && r.invoices.find(i => i.id === id);
        const orgs = await this.get('dev.orgs.list', 'orgs');
        const o = orgs.success && orgs.orgs.find(x => x.id === inv.org) || {};
        const acc = inv.status === 'paid' ? r.accounts.filter(a => a.id === inv.account) : r.accounts;
        const w = window.open('', '_blank');
        if (!w) return showMessage({ title: 'เปิดหน้าต่างไม่ได้', text: 'กรุณาอนุญาตป๊อปอัปสำหรับเว็บไซต์นี้', tone: 'warn' });
        const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
        w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(inv.id)} — ใบแจ้งหนี้</title>
          <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;700&display=swap" rel="stylesheet">
          <style>body{font-family:'Noto Sans Thai',sans-serif;color:#1f1f1f;margin:0;padding:40px;font-size:14px}h1{font-size:26px;margin:0}.top{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #0b57d0;padding-bottom:16px;margin-bottom:20px}
          .muted{color:#5f6368}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #e0e3e7;vertical-align:top}th{width:34%;color:#5f6368;font-weight:400}
          .total{font-size:22px;font-weight:700;color:#0b57d0}.stamp{display:inline-block;border:2px solid ${inv.status === 'paid' ? '#188038' : '#b3261e'};color:${inv.status === 'paid' ? '#188038' : '#b3261e'};padding:4px 12px;border-radius:6px;font-weight:700}
          @media print{body{padding:0}button{display:none}}</style></head><body>
          <div class="top"><div><h1>ใบแจ้งหนี้</h1><div class="muted">HR Paper Mill · พัฒนาและให้บริการโดย softlight</div></div><div style="text-align:right"><b>${esc(inv.id)}</b><div class="muted">ออกเมื่อ ${dShort(inv.issued)}</div><div class="stamp">${INV_ST[inv.status][0]}</div></div></div>
          <table>${row('ลูกค้า', `<b>${esc(o.name || inv.orgName)}</b>${o.address ? '<br>' + esc(o.address) : ''}${o.taxId ? '<br>เลขผู้เสียภาษี ' + esc(o.taxId) : ''}`)}
            ${row('ผู้ติดต่อ', esc([o.contact, o.phone, o.email].filter(Boolean).join(' · ') || '-'))}
            ${row('รายการ', `ค่าบริการ HR Paper Mill แพลน ${esc(inv.planName)} (${CYCLE_TH[inv.cycle] || inv.cycle})<br><span class="muted">รอบ ${dShort(inv.periodStart)} – ${dShort(inv.periodEnd)}</span>`)}
            ${row('ครบกำหนดชำระ', dShort(inv.due))}
            ${inv.status === 'paid' ? row('ชำระเมื่อ', `${dShort(inv.paidAt)}${inv.ref ? ' · อ้างอิง ' + esc(inv.ref) : ''}`) : ''}
            ${row('ยอดชำระ', `<span class="total">${baht(inv.amount)}</span>`)}</table>
          ${acc.length ? `<h3>${inv.status === 'paid' ? 'รับชำระเข้าบัญชี' : 'ช่องทางชำระเงิน'}</h3><table>${acc.map(a => row(esc(a.bank || ACC_TYPE_TH[a.type]), `<b>${esc(a.number)}</b> · ${esc(a.name)}${a.branch ? ' · สาขา' + esc(a.branch) : ''}`)).join('')}</table>` : ''}
          ${inv.note ? `<p class="muted">หมายเหตุ: ${esc(inv.note)}</p>` : ''}
          <button onclick="print()" style="margin-top:12px;padding:10px 18px;border-radius:20px;border:0;background:#0b57d0;color:#fff;font:inherit;cursor:pointer">พิมพ์ / บันทึกเป็น PDF</button>
          </body></html>`);
        w.document.close();
    },

    // ---------- บัญชีรับเงิน ----------
    async loadAccounts() {
        const id = ++this.req;
        if (!this.cache.accounts) this.skeleton(2);
        const r = await this.get('dev.accounts.list', 'accounts');
        if (id !== this.req || this.sec !== 'accounts') return;
        if (!r.success) return this.fail(r);
        $('devSub').textContent = `${fmtNum(r.accounts.length)} บัญชี · บัญชีที่ใช้งานแสดงในหน้าแพ็กเกจและใบแจ้งหนี้`;
        $('devBody').innerHTML = `
          <section class="toolbar"><div class="toolbar-row"><span class="muted-text grow">บัญชีค่าเริ่มต้นแสดงเป็นอันดับแรก</span><button type="button" class="btn btn-primary btn-sm" data-act="acc-new">${icon('plus')}เพิ่มบัญชี</button></div></section>
          ${r.accounts.length ? `<div class="dev-accs">${r.accounts.map(a => `
            <article class="card dev-acc ${a.active ? '' : 'is-off'}">
              <div class="dev-plan-top"><b>${esc(a.bank || ACC_TYPE_TH[a.type])}</b>${a.isDefault ? '<span class="badge is-accent">ค่าเริ่มต้น</span>' : ''}${a.active ? '' : '<span class="badge">ปิดใช้งาน</span>'}</div>
              <div class="dev-acc-no mono">${esc(a.number)}</div>
              <small class="muted-text">${esc(a.name)}${a.branch ? ' · สาขา' + esc(a.branch) : ''} · ${ACC_TYPE_TH[a.type]}</small>
              <div class="dev-plan-foot"><span></span><button type="button" class="btn btn-tonal btn-sm" data-act="acc-edit" data-id="${esc(a.id)}">${icon('edit')}แก้ไข</button></div>
            </article>`).join('')}</div>` : emptyState('ยังไม่มีบัญชีรับเงิน — เพิ่มบัญชีธนาคารหรือพร้อมเพย์เพื่อแสดงให้ลูกค้าชำระ', 'database')}`;
    },
    accountForm(a) {
        const isNew = !a;
        this.form({
            title: isNew ? 'เพิ่มบัญชีรับเงิน' : 'แก้ไขบัญชีรับเงิน', save: 'บันทึก',
            values: a || { type: 'bank', active: true },
            fields: [
                { k: 'type', label: 'ประเภท', type: 'select', options: Object.keys(ACC_TYPE_TH).map(k => [k, ACC_TYPE_TH[k]]) },
                { k: 'bank', label: 'ธนาคาร / ผู้ให้บริการ', ph: 'เช่น กสิกรไทย' },
                { k: 'name', label: 'ชื่อบัญชี', req: true, span: true },
                { k: 'number', label: 'เลขบัญชี / พร้อมเพย์', req: true }, { k: 'branch', label: 'สาขา' },
                { k: 'note', label: 'หมายเหตุ (ภายใน)', span: true },
                { k: 'isDefault', label: 'บัญชีค่าเริ่มต้น', type: 'check', span: true },
                { k: 'active', label: 'ใช้งาน (แสดงให้ลูกค้า)', type: 'check', span: true }
            ],
            danger: isNew ? null : { label: 'ลบบัญชี', fn: async () => { if (await showMessage({ title: 'ลบบัญชีนี้?', text: `${a.bank} ${a.number}`, tone: 'bad', okText: 'ลบ', cancelText: 'ยกเลิก' })) { $('devModal').close(); this.run('dev.accounts.delete', { id: a.id }, 'ลบบัญชีแล้ว', ['accounts', 'invoices']); } } },
            onSubmit: d => this.run('dev.accounts.save', { account: Object.assign({ id: a ? a.id : '' }, d) }, 'บันทึกบัญชีแล้ว', ['accounts', 'invoices'])
        });
    },

    // ---------- ผู้ใช้ทั้งระบบ ----------
    async loadUsers() {
        const id = ++this.req;
        if (!this.cache.users) this.skeleton(2);
        const r = await this.get('dev.users.list', 'users');
        if (id !== this.req || this.sec !== 'users') return;
        if (!r.success) return this.fail(r);
        $('devSub').textContent = `เจ้าหน้าที่ ${fmtNum(r.staff.length)} บัญชี · ผู้ใช้สิทธิ์ ${fmtNum(r.participants.length)} คน · ${fmtNum(r.orgs.length)} องค์กร`;
        const f = this.filt;
        const orgOpts = `<option value="all">ทุกองค์กร</option><option value="" ${f.uOrg === '' ? 'selected' : ''}>ยังไม่ผูกองค์กร</option>${r.orgs.map(o => `<option value="${esc(o.id)}" ${f.uOrg === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}`;
        $('devBody').innerHTML = `
          <section class="toolbar">
            <div class="toolbar-row">
              <div class="set-seg seg-sm" role="radiogroup" aria-label="ประเภทผู้ใช้" data-seg="uKind">${[['staff', 'เจ้าหน้าที่'], ['participants', 'ผู้ใช้สิทธิ์']].map(([v, l]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${f.uKind === v}">${l}</button>`).join('')}</div>
              <select class="select" data-f="uOrg" aria-label="องค์กร">${orgOpts}</select>
              <div class="search-field grow"><svg class="ic ic-16" aria-hidden="true"><use href="#i-search"/></svg><input type="search" class="input input-sm" data-f="uQ" value="${esc(f.uQ)}" placeholder="ค้นหาชื่อ รหัส อีเมล" aria-label="ค้นหาผู้ใช้"></div>
            </div>
            <div class="dev-bulk" id="devBulk" hidden>
              <b id="devBulkN"></b>
              <select class="select" id="devBulkOrg" aria-label="ย้ายไปองค์กร"><option value="">ไม่ผูกองค์กร</option>${r.orgs.map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</select>
              <button type="button" class="btn btn-primary btn-sm" data-act="bulk-move">ย้ายไปองค์กรนี้</button>
              <button type="button" class="btn-text" data-act="bulk-clear">ล้างที่เลือก</button>
            </div>
          </section>
          <div class="table-card" id="devUserTable"></div>`;
        this.renderUsers();
    },
    renderUsers() {
        const r = this.cache.users; if (!r || !$('devUserTable')) return;
        const f = this.filt, q = f.uQ.trim().toLowerCase(), orgName = {};
        r.orgs.forEach(o => { orgName[o.id] = o.name; });
        const pool = f.uKind === 'staff' ? r.staff : r.participants;
        const list = pool.filter(u => (f.uOrg === 'all' || (u.org || '') === f.uOrg) && (!q || [u.name, u.id, u.email, u.site].join(' ').toLowerCase().includes(q)));
        this.visible = list.map(u => u.id);
        const allOn = list.length && list.every(u => this.picked.has(u.id));
        const orgCell = u => u.org ? esc(orgName[u.org] || u.org) : '<span class="muted-text">ยังไม่ผูก</span>';
        const shown = list.slice(0, 300);
        $('devUserTable').innerHTML = list.length ? `<table class="dtable dev-utable">
          <thead><tr><th class="td-check"><input type="checkbox" data-act="pick-all" aria-label="เลือกทั้งหมด" ${allOn ? 'checked' : ''}></th><th>${f.uKind === 'staff' ? 'เจ้าหน้าที่' : 'ผู้ใช้สิทธิ์'}</th><th>องค์กร</th>${f.uKind === 'staff' ? '<th>บทบาท</th><th>สถานะ</th>' : '<th>จุดขาย</th><th>สถานะ</th>'}</tr></thead>
          <tbody>${shown.map(u => `<tr>
            <td class="td-check"><input type="checkbox" data-pick="${esc(u.id)}" aria-label="เลือก ${esc(u.name)}" ${this.picked.has(u.id) ? 'checked' : ''}></td>
            <td class="td-main"><div class="cell-person">${f.uKind === 'staff' ? avatarHtml(u.name, u.picture) : ''}<span><b>${esc(u.name)}</b><small>${esc(f.uKind === 'staff' ? (u.email || u.id) : u.id)}</small></span></div></td>
            <td data-label="องค์กร">${orgCell(u)}</td>
            ${f.uKind === 'staff' ? `<td data-label="บทบาท"><select class="select select-sm" data-role="${esc(u.id)}" aria-label="บทบาทของ ${esc(u.name)}" ${u.id === ST.me.id ? 'disabled' : ''}>${['viewer', 'editor', 'admin', 'dev'].concat(u.role === 'pending' ? ['pending'] : []).map(x => `<option value="${x}" ${u.role === x ? 'selected' : ''} ${x === 'pending' ? 'disabled' : ''}>${esc(ROLE_LABELS[x])}</option>`).join('')}</select></td>
              <td data-label="สถานะ"><span class="badge ${{ active: 'is-ok', pending: 'is-warn', suspended: 'is-bad' }[u.status] || ''}">${esc(STATUS_LABELS[u.status] || u.status)}</span></td>`
            : `<td data-label="จุดขาย">${esc(u.site || '-')}</td><td data-label="สถานะ"><span class="badge ${u.active ? 'is-ok' : ''}">${u.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</span></td>`}
          </tr>`).join('')}</tbody></table>${list.length > shown.length ? `<p class="muted-text dev-more">แสดง ${fmtNum(shown.length)} จาก ${fmtNum(list.length)} รายการ — ใช้ตัวกรองหรือค้นหาเพื่อจำกัดรายการ (เลือกทั้งหมดจะรวมทุกรายการที่ตรงตัวกรอง)</p>` : ''}`
            : emptyState('ไม่พบผู้ใช้ที่ตรงกับตัวกรอง', 'users');
        this.syncBulk();
    },
    syncBulk() {
        const b = $('devBulk'); if (!b) return;
        b.hidden = !this.picked.size;
        $('devBulkN').textContent = `เลือก ${fmtNum(this.picked.size)} ${this.filt.uKind === 'staff' ? 'บัญชี' : 'คน'}`;
    },
    async bulkMove() {
        const org = $('devBulkOrg').value, ids = [...this.picked];
        const name = org ? $('devBulkOrg').selectedOptions[0].textContent : 'ไม่ผูกองค์กร';
        const ok = await showMessage({ title: `ย้าย ${fmtNum(ids.length)} ${this.filt.uKind === 'staff' ? 'บัญชี' : 'คน'} ไป "${name}"?`, text: 'ผู้ใช้จะเห็นเฉพาะข้อมูลขององค์กรที่สังกัด และใช้งานได้ตามสถานะการสมัครสมาชิกขององค์กรนั้น', okText: 'ย้าย', cancelText: 'ยกเลิก' });
        if (!ok) return;
        showLoading(true, 'กำลังย้าย…');
        const r = await api('dev.users.assign', { kind: this.filt.uKind, ids, org });
        showLoading(false);
        if (!r.success) return showMessage({ title: 'ย้ายไม่สำเร็จ', text: r.message, tone: 'bad' });
        toast(`ย้ายแล้ว ${fmtNum(r.changed)} รายการ`);
        this.picked.clear();
        this.dirty('users', 'orgs');
        this.loadUsers();
    },
    async setRole(id, role, sel) {
        const u = this.cache.users.staff.find(x => x.id === id);
        if (role === 'dev' && !(await showMessage({ title: `ให้ ${u.name} เป็น Dev?`, text: 'Dev เห็นข้อมูลทุกองค์กร และจัดการแพลน การชำระเงิน และบัญชีทั้งหมดได้', tone: 'warn', okText: 'ยืนยัน', cancelText: 'ยกเลิก' }))) { sel.value = u.role; return; }
        const r = await api('dev.staff.role', { id, role });
        if (!r.success) { sel.value = u.role; return showMessage({ title: 'เปลี่ยนบทบาทไม่สำเร็จ', text: r.message, tone: 'bad' }); }
        u.role = role; u.status = u.status === 'pending' ? 'active' : u.status;
        toast(`${u.name}: ${ROLE_LABELS[role]}`);
        this.renderUsers();
    },

    // ---------- เหตุการณ์ ----------
    onClick(e) {
        const seg = e.target.closest('[data-seg] [data-v]');
        if (seg) {
            const key = seg.parentElement.dataset.seg;
            this.filt[key] = seg.dataset.v;
            seg.parentElement.querySelectorAll('[data-v]').forEach(x => x.setAttribute('aria-checked', String(x === seg)));
            if (key === 'uKind') { this.picked.clear(); return this.renderUsers(); }
            return this.renderInvoices();
        }
        const orgRow = e.target.closest('[data-org]');
        const a = e.target.closest('[data-act]');
        if (a) {
            const id = a.dataset.id, act = a.dataset.act;
            if (act === 'org-new') return this.orgForm(null);
            if (act === 'org-edit') return this.orgForm(this.cache.orgs.orgs.find(o => o.id === id));
            if (act === 'plan-new') return this.planForm(null);
            if (act === 'plan-edit') return this.planForm(this.cache.plans.plans.find(p => p.id === id));
            if (act === 'offer') return this.offerForm();
            if (act === 'inv-new') return this.invoiceForm();
            if (act === 'inv-pay') return this.payForm(id);
            if (act === 'inv-void') return this.voidInvoice(id);
            if (act === 'inv-print') return this.printInvoice(id);
            if (act === 'acc-new') return this.accountForm(null);
            if (act === 'acc-edit') return this.accountForm(this.cache.accounts.accounts.find(x => x.id === id));
            if (act === 'bulk-move') return this.bulkMove();
            if (act === 'bulk-clear') { this.picked.clear(); return this.renderUsers(); }
            if (act === 'pick-all') { const on = a.checked; (this.visible || []).forEach(x => on ? this.picked.add(x) : this.picked.delete(x)); return this.renderUsers(); }
            return;
        }
        if (orgRow && !e.target.closest('select,input,a')) return this.orgDetail(orgRow.dataset.org);
    },
    onInput(e) {
        const k = e.target.dataset.f;
        if (!k || e.target.tagName === 'SELECT') return;
        this.filt[k] = e.target.value;
        clearTimeout(this.qT);
        this.qT = setTimeout(() => (k === 'orgQ' ? this.renderOrgs() : this.renderUsers()), 200);
    },
    onChange(e) {
        const t = e.target;
        if (t.dataset.pick) { t.checked ? this.picked.add(t.dataset.pick) : this.picked.delete(t.dataset.pick); return this.syncBulk(); }
        if (t.dataset.role) return this.setRole(t.dataset.role, t.value, t);
        if (t.dataset.f && t.tagName === 'SELECT') { this.filt[t.dataset.f] = t.value; if (t.dataset.f === 'uOrg') this.picked.clear(); return t.dataset.f === 'orgSt' ? this.renderOrgs() : this.renderUsers(); }
    }
};
// แถว/รายการองค์กร: Enter เพื่อเปิด
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('#devBody tr[data-org]')) VIEWS.dev.orgDetail(e.target.dataset.org); });
