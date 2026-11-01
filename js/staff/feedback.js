// js/staff/feedback.js — หน้าเจ้าหน้าที่: แจ้งปัญหา (ทุกคน) · ผู้ดูแลระบบ › แจ้งปัญหา / แบบสอบถาม
// API: staff.problem.report · admin.problems.* · admin.surveys.* (Feedback.gs) · ฟอร์มกลางอยู่ใน js/feedback.js

const SV_STATE = { draft: ['ร่าง', ''], scheduled: ['รอส่ง', 'is-warn'], open: ['เปิดรับ', 'is-ok'], closed: ['ปิดแล้ว', ''] };
const SV_TYPES = { rating: 'คะแนน 1–5', choice: 'ตัวเลือก', text: 'ข้อความ' };
const SV_TEMPLATE = [
    { type: 'rating', text: 'ความสะดวกในการใช้งานแอปโดยรวม', required: true, low: 'ไม่สะดวกเลย', high: 'สะดวกมาก' },
    { type: 'rating', text: 'ความง่ายในการส่งรายงานแต่ละวัน', required: true, low: 'ยากมาก', high: 'ง่ายมาก' },
    { type: 'rating', text: 'ตัวหนังสือ ปุ่ม และเมนู อ่านและกดได้ง่าย', required: true, low: 'ยากมาก', high: 'ง่ายมาก' },
    { type: 'rating', text: 'ความเร็วในการเปิดแอปและส่งรายงาน', required: true, low: 'ช้ามาก', high: 'เร็วมาก' },
    { type: 'choice', text: 'ส่วนใหญ่ส่งรายงานด้วยอุปกรณ์อะไร', required: false, options: ['มือถือ iPhone', 'มือถือ Android', 'แท็บเล็ต', 'คอมพิวเตอร์'] },
    { type: 'text', text: 'สิ่งที่อยากให้ปรับปรุง หรือปัญหาที่เจอ', required: false }
];

const FeedbackAdmin = {
    problems: [], probFilter: 'open', probSearch: '', probReq: 0, statuses: null, openRow: null,
    surveys: [], participants: [], svReq: 0, edit: null, result: null,

    init() {
        document.addEventListener('click', e => { if (e.target.closest('[data-problem]')) { if (typeof haptic === 'function') haptic(); this.openReport(); } });
        $('probFilter').addEventListener('click', e => {
            const b = e.target.closest('[data-f]'); if (!b) return;
            this.probFilter = b.dataset.f;
            $('probFilter').querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
            this.renderProblems();
        });
        $('probSearch').addEventListener('input', debounce(() => { this.probSearch = $('probSearch').value.trim().toLowerCase(); this.renderProblems(); }, 250));
        $('probList').addEventListener('click', e => this.onProblemClick(e));

        $('svNew').addEventListener('click', () => this.openEditor(null));
        $('svList').addEventListener('click', e => this.onSurveyClick(e));
        $('svAddQ').addEventListener('click', () => { this.readEditor(); this.edit.questions.push({ type: 'rating', text: '', required: true }); this.renderQs(true); });
        $('svTemplate').addEventListener('click', () => this.applyTemplate());
        $('svQs').addEventListener('click', e => this.onQClick(e));
        $('svQs').addEventListener('change', e => { if (e.target.matches('[data-k="type"]')) { this.readEditor(); this.renderQs(); } });
        $('svTargetMode').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) this.setSeg('svTargetMode', b.dataset.v); });
        $('svWhen').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) this.setSeg('svWhen', b.dataset.v); });
        $('svPickSearch').addEventListener('input', debounce(() => this.renderPick(), 200));
        $('svPickList').addEventListener('change', e => { const c = e.target.closest('input[type=checkbox]'); if (!c) return; if (c.checked) this.edit.picked.add(c.value); else this.edit.picked.delete(c.value); this.pickCount(); });
        $('svPickAll').addEventListener('click', () => { this.pickVisible().forEach(p => this.edit.picked.add(p.id)); this.renderPick(); });
        $('svPickNone').addEventListener('click', () => { this.edit.picked.clear(); this.renderPick(); });
        $('svEditForm').addEventListener('submit', e => { e.preventDefault(); this.save(false); });
        $('svDraft').addEventListener('click', () => this.save(true));
        $('svPreview').addEventListener('click', () => this.preview());
        $('svResCsv').addEventListener('click', () => this.downloadCsv());
    },

    // ---------- แจ้งปัญหา (ทุกคน) ----------
    openReport() {
        const signedIn = !!ST.token;
        Feedback.openProblem({
            who: signedIn ? 'staff' : 'guest', staffGuest: !signedIn, page: 'staff:' + (ST.view || (signedIn ? 'pending' : 'login')),
            send: payload => signedIn ? api('staff.problem.report', payload) : callApi('problem.report', payload)
        });
    },

    // ---------- ผู้ดูแลระบบ › แจ้งปัญหา ----------
    async loadProblems(silent) {
        const req = ++this.probReq;
        if (!silent && !this.problems.length) $('probList').innerHTML = '<li class="skel" style="height:96px;border-radius:16px"></li><li class="skel" style="height:96px;border-radius:16px"></li>';
        const r = await api('admin.problems.list', { limit: 300 });
        if (req !== this.probReq) return;
        if (!r.success) { if (!silent) $('probList').innerHTML = `<li>${emptyState(r.message || 'โหลดไม่สำเร็จ', 'wifi-off')}</li>`; return; }
        this.problems = r.problems; this.statuses = r.statuses; this.counts = r.counts;
        $('probNote').innerHTML = r.recipients ? 'ทุกเรื่องส่งอีเมลถึงผู้ดูแลระบบทันที (PROBLEM_EMAILS หรือ ADMIN_EMAILS) · เก็บทั้งหมดในแผ่นงาน Problems'
            : '<b class="text-bad">ยังไม่ได้ตั้งอีเมลผู้รับ</b> — เพิ่ม ADMIN_EMAILS หรือ PROBLEM_EMAILS ใน Script Properties ระบบจึงจะส่งอีเมลแจ้งเรื่องใหม่';
        this.badge();
        if (silent && document.activeElement && document.activeElement.closest('#probList')) return; // กำลังพิมพ์หมายเหตุ: ไม่วาดทับ
        this.renderProblems();
    },
    badge() {
        const n = this.counts ? this.counts.new : 0;
        document.querySelectorAll('[data-problem-badge]').forEach(b => { b.hidden = !n; b.textContent = n; });
    },
    renderProblems() {
        const q = this.probSearch, f = this.probFilter;
        const list = this.problems.filter(p => (f === 'all' || (f === 'done' ? ['done', 'wont'].includes(p.statusKey) : ['new', 'doing'].includes(p.statusKey)))
            && (!q || [p.reporterName, p.reporterId, p.title, p.detail, p.category, p.contact, p.id].join(' ').toLowerCase().includes(q)));
        const c = this.counts || {};
        $('probSummary').innerHTML = `<span class="stat ${c.new ? 'is-bad' : ''}"><b>${fmtNum(c.new || 0)}</b>ใหม่</span><span class="stat ${c.doing ? 'is-warn' : ''}"><b>${fmtNum(c.doing || 0)}</b>กำลังแก้ไข</span><span class="stat"><b>${fmtNum(c.done || 0)}</b>แก้ไขแล้ว</span><span class="stat"><b>${fmtNum(this.problems.length)}</b>ทั้งหมด</span>`;
        if (!list.length) { $('probList').innerHTML = `<li>${emptyState(this.problems.length ? 'ไม่มีเรื่องในมุมมองนี้' : 'ยังไม่มีการแจ้งปัญหา', 'check-circle')}</li>`; return; }
        const roleTh = { participant: 'ผู้ใช้สิทธิ์', staff: 'เจ้าหน้าที่', guest: 'ยังไม่เข้าระบบ' };
        const tone = { new: 'is-bad', doing: 'is-warn', done: 'is-ok', wont: '' };
        $('probList').innerHTML = list.map(p => `
          <li class="prob ${p.statusKey === 'new' ? 'is-new' : ''}" data-row="${p.row}">
            <button type="button" class="prob-top" data-pa="toggle" aria-expanded="${this.openRow === p.row}">
              <span class="prob-main">
                <span class="prob-meta"><span class="badge ${tone[p.statusKey] || ''}">${esc(p.status)}</span><span class="badge is-accent">${esc(p.category)}</span><span class="mono">${esc(p.id)}</span></span>
                <b>${esc(p.title || p.detail.split('\n')[0].slice(0, 90))}</b>
                <small>${esc(p.reporterName || '-')} · ${esc(roleTh[p.role] || p.role)}${p.reporterId ? ' · ' + esc(p.reporterId) : ''}${p.role === 'guest' && p.reporterId ? ' (ยังไม่ยืนยัน)' : ''} · ${relTime(p.ts)}</small>
              </span>
              ${icon('chevron-down', 'ic-16 prob-chev')}
            </button>
            <div class="prob-body" ${this.openRow === p.row ? '' : 'hidden'}>
              <p class="prob-detail">${esc(p.detail)}</p>
              <dl class="kv kv-sm">
                <div><dt>เวลา</dt><dd>${thDateTime(p.ts)}</dd></div>
                ${p.contact ? `<div><dt>ติดต่อกลับ</dt><dd>${/^[0-9+\-\s]{8,}$/.test(p.contact) ? `<a href="tel:${esc(p.contact.replace(/[^0-9+]/g, ''))}">${esc(p.contact)}</a>` : /@/.test(p.contact) ? `<a href="mailto:${esc(p.contact)}">${esc(p.contact)}</a>` : esc(p.contact)}</dd></div>` : ''}
                ${p.page ? `<div><dt>หน้า</dt><dd>${esc(p.page)}</dd></div>` : ''}
                ${p.client ? `<div><dt>อุปกรณ์</dt><dd>${esc(p.client)}${p.version ? ' · v' + esc(p.version) : ''}</dd></div>` : ''}
                ${p.image ? `<div><dt>ภาพหน้าจอ</dt><dd><a href="${esc(p.image)}" target="_blank" rel="noopener">เปิดใน Google Drive ${icon('external', 'ic-16')}</a></dd></div>` : ''}
                ${p.handledBy ? `<div><dt>จัดการโดย</dt><dd>${esc(p.handledBy)}${p.handledAt ? ' · ' + thDateTime(p.handledAt) : ''}</dd></div>` : ''}
              </dl>
              <div class="prob-edit">
                <label class="field"><span class="label">สถานะ</span>
                  <select class="select select-lg" data-pk="status">${Object.keys(this.statuses || {}).map(k => `<option value="${k}" ${k === p.statusKey ? 'selected' : ''}>${esc(this.statuses[k])}</option>`).join('')}</select></label>
                <label class="field"><span class="label">หมายเหตุผู้ดูแล</span><input class="input input-sm" data-pk="note" maxlength="500" value="${esc(p.note)}" placeholder="เช่น โทรแนะนำแล้ว / แก้ในเวอร์ชันถัดไป"></label>
                <button type="button" class="btn btn-primary btn-sm" data-pa="save">บันทึก</button>
              </div>
            </div>
          </li>`).join('');
    },
    async onProblemClick(e) {
        const li = e.target.closest('.prob'); if (!li) return;
        const row = Number(li.dataset.row), p = this.problems.find(x => x.row === row);
        const a = e.target.closest('[data-pa]'); if (!a || !p) return;
        if (a.dataset.pa === 'toggle') {
            this.openRow = this.openRow === row ? null : row;
            li.querySelector('.prob-body').hidden = this.openRow !== row;
            a.setAttribute('aria-expanded', String(this.openRow === row));
            return;
        }
        if (a.dataset.pa === 'save') {
            const status = li.querySelector('[data-pk="status"]').value, note = li.querySelector('[data-pk="note"]').value.trim();
            a.disabled = true;
            const r = await api('admin.problems.update', { row: p.row, id: p.id, status, note });
            a.disabled = false;
            if (!r.success) return showMessage({ title: 'บันทึกไม่สำเร็จ', text: r.message || 'กรุณาลองใหม่', tone: 'bad' });
            toast('บันทึกสถานะแล้ว');
            this.loadProblems(true);
        }
    },

    // ---------- ผู้ดูแลระบบ › แบบสอบถาม ----------
    async loadSurveys(silent) {
        const req = ++this.svReq;
        if (!silent && !this.surveys.length) $('svList').innerHTML = '<div class="skel" style="height:150px;border-radius:16px"></div><div class="skel" style="height:150px;border-radius:16px"></div>';
        const r = await api('admin.surveys.list');
        if (req !== this.svReq) return;
        if (!r.success) { $('svList').innerHTML = emptyState(r.message || 'โหลดไม่สำเร็จ', 'wifi-off'); return; }
        this.surveys = r.surveys; this.participants = r.participants || []; this.remindHours = r.remindHours || 48;
        this.renderSurveys();
    },
    renderSurveys() {
        if (!this.surveys.length) {
            $('svList').innerHTML = `<div class="card sv-empty">${icon('help')}<b>ยังไม่มีแบบสอบถาม</b><p class="muted-text">เริ่มจากชุดคำถามมาตรฐาน (ความสะดวก ความง่าย ความเร็ว) แล้วปรับได้ตามต้องการ</p><button type="button" class="btn btn-primary btn-sm" data-sa="new-template">${icon('plus', 'ic-16')} สร้างจากชุดมาตรฐาน</button></div>`;
            return;
        }
        $('svList').innerHTML = this.surveys.map(s => {
            const st = SV_STATE[s.state] || SV_STATE.open, pct = s.targetCount ? Math.min(100, Math.round(s.responses / s.targetCount * 100)) : 0;
            const ratings = s.questions.map((q, i) => [q, s.summary[i]]).filter(([q, m]) => q.type === 'rating' && m && m.avg !== null);
            const when = s.state === 'scheduled' ? `ส่ง ${thDateTime(s.startAt)}` : s.state === 'draft' ? 'ยังไม่ส่ง' : `เริ่ม ${thDateTime(s.startAt)}`;
            return `<article class="card sv-card" data-id="${esc(s.id)}">
              <div class="sv-card-top">
                <div class="sv-card-title"><span class="badge ${st[1]}">${st[0]}</span><b>${esc(s.title)}</b></div>
                <small class="muted-text">${when}${s.endAt ? ` · ปิดรับ ${thDateTime(s.endAt)}` : ''} · ${s.target === 'all' ? 'ทุกคน' : `เลือก ${fmtNum(s.target.length)} คน`} · ${fmtNum(s.questions.length)} ข้อ</small>
              </div>
              <div class="sv-progress"><div class="sv-progress-bar"><span style="width:${pct}%"></span></div><span><b>${fmtNum(s.responses)}</b> / ${fmtNum(s.targetCount)} คนตอบแล้ว (${pct}%)</span></div>
              ${ratings.length ? `<ul class="sv-avgs">${ratings.slice(0, 4).map(([q, m]) => `<li><span>${esc(q.text)}</span><b>${m.avg.toFixed(1)}</b><small>/5</small></li>`).join('')}</ul>` : ''}
              <div class="sv-actions">
                <button type="button" class="btn-chip" data-sa="result">${icon('chart', 'ic-16')} ดูผล</button>
                <button type="button" class="btn-chip" data-sa="edit">${icon('edit', 'ic-16')} แก้ไข</button>
                ${s.state === 'closed' ? '<button type="button" class="btn-chip" data-sa="reopen">เปิดรับอีกครั้ง</button>' : s.state !== 'draft' ? '<button type="button" class="btn-chip" data-sa="close">ปิดรับคำตอบ</button>' : ''}
                <button type="button" class="btn-chip" data-sa="copy">ทำสำเนา</button>
                ${s.responses ? '' : `<button type="button" class="btn-chip btn-chip-bad" data-sa="delete">${icon('trash', 'ic-16')} ลบ</button>`}
              </div>
            </article>`;
        }).join('');
    },
    async onSurveyClick(e) {
        const b = e.target.closest('[data-sa]'); if (!b) return;
        if (b.dataset.sa === 'new-template') return this.openEditor(null, true);
        const s = this.surveys.find(x => x.id === b.closest('[data-id]').dataset.id); if (!s) return;
        const act = b.dataset.sa;
        if (act === 'edit') return this.openEditor(s);
        if (act === 'copy') return this.openEditor(Object.assign({}, s, { id: null, title: s.title + ' (สำเนา)', state: 'draft', responses: 0, startAt: null, endAt: null }));
        if (act === 'result') return this.openResult(s);
        if (act === 'close' || act === 'reopen') {
            if (act === 'close' && !await showMessage({ title: 'ปิดรับคำตอบ?', text: `"${s.title}" จะไม่แสดงให้ผู้ใช้สิทธิ์อีก (ผลที่ได้ยังเก็บไว้ เปิดรับอีกครั้งได้)`, tone: 'warn', okText: 'ปิดรับ', cancelText: 'ยกเลิก' })) return;
            const r = await api('admin.surveys.close', { id: s.id, reopen: act === 'reopen' });
            if (!r.success) return showMessage({ title: 'ทำรายการไม่สำเร็จ', text: r.message || '', tone: 'bad' });
            toast(act === 'close' ? 'ปิดรับคำตอบแล้ว' : 'เปิดรับคำตอบอีกครั้งแล้ว');
            return this.loadSurveys(true);
        }
        if (act === 'delete') {
            if (!await showMessage({ title: 'ลบแบบสอบถาม?', text: `"${s.title}" ยังไม่มีผู้ตอบ ลบแล้วกู้คืนไม่ได้`, tone: 'bad', okText: 'ลบ', cancelText: 'ยกเลิก' })) return;
            const r = await api('admin.surveys.delete', { id: s.id });
            if (!r.success) return showMessage({ title: 'ลบไม่สำเร็จ', text: r.message || '', tone: 'bad' });
            toast('ลบแล้ว');
            this.loadSurveys(true);
        }
    },

    // ----- ตัวแก้ไข -----
    setSeg(id, v) {
        $(id).querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === v)));
        if (id === 'svTargetMode') { $('svPick').hidden = v !== 'some'; if (v === 'some') this.renderPick(); }
        if (id === 'svWhen') $('svStartWrap').hidden = v !== 'later';
    },
    segVal(id) { const b = $(id).querySelector('[aria-checked="true"]'); return b ? b.dataset.v : ''; },
    localInput(ts) { if (!ts) return ''; const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); },
    async openEditor(s, template) {
        if (!this.participants.length) { const r = await api('admin.surveys.list'); if (r.success) { this.surveys = r.surveys; this.participants = r.participants || []; } }
        const locked = !!(s && s.id && s.responses);
        this.edit = {
            id: s && s.id || null, locked,
            questions: s ? JSON.parse(JSON.stringify(s.questions)) : (template ? JSON.parse(JSON.stringify(SV_TEMPLATE)) : [{ type: 'rating', text: '', required: true }]),
            picked: new Set(s && Array.isArray(s.target) ? s.target : [])
        };
        $('svEditTitle').textContent = s && s.id ? 'แก้ไขแบบสอบถาม' : 'สร้างแบบสอบถาม';
        $('svLocked').hidden = !locked;
        $('svTitle').value = s ? s.title : (template ? 'ความพึงพอใจการใช้งานแอป HR Paper Mill' : '');
        $('svIntro').value = s ? s.intro : (template ? 'ความเห็นของคุณช่วยให้เราปรับปรุงแอปให้ใช้ง่ายขึ้น ตอบได้ในไม่ถึง 1 นาที' : '');
        $('svTemplate').hidden = locked; $('svAddQ').hidden = locked;
        this.setSeg('svTargetMode', s && Array.isArray(s.target) ? 'some' : 'all');
        $('svTargetMode').querySelector('[data-v="all"]').textContent = `ผู้ใช้สิทธิ์ทุกคน (${fmtNum(this.participants.length)} คน)`;
        const future = s && s.startAt && s.startAt > Date.now() && s.state !== 'draft';
        this.setSeg('svWhen', future ? 'later' : 'now');
        $('svStart').value = this.localInput(future ? s.startAt : Date.now() + 3600000);
        $('svStart').min = this.localInput(Date.now());
        $('svEnd').value = this.localInput(s && s.endAt);
        $('svWhen').querySelector('[data-v="now"]').textContent = s && s.id && s.state !== 'draft' && s.state !== 'scheduled' ? 'เริ่มแล้ว (คงเดิม)' : 'ส่งทันที';
        this.keepStart = s && s.id && s.state !== 'draft' && s.state !== 'scheduled' ? s.startAt : null;
        $('svWhenHint').textContent = `ผู้ใช้สิทธิ์จะเห็นแบบสอบถามหลังส่งรายงานของวันนั้น หรือทำภายหลังจากแถบเตือน · เครื่องที่เปิดการแจ้งเตือนจะได้รับแจ้งเมื่อถึงเวลา และเตือนซ้ำหลัง ${this.remindHours || 48} ชม. หากยังไม่ทำ`;
        $('svSave').textContent = s && s.id && s.state !== 'draft' ? 'บันทึก' : 'ส่งแบบสอบถาม';
        $('svDraft').hidden = !!(s && s.id && s.state !== 'draft');
        $('svPickSearch').value = '';
        this.renderQs();
        showModal('svEditModal');
        $('svEditForm').querySelector('.sheet-body').scrollTop = 0;
    },
    applyTemplate() {
        this.readEditor();
        const empty = this.edit.questions.every(q => !q.text.trim());
        this.edit.questions = (empty ? [] : this.edit.questions).concat(JSON.parse(JSON.stringify(SV_TEMPLATE)));
        if (!$('svTitle').value.trim()) $('svTitle').value = 'ความพึงพอใจการใช้งานแอป HR Paper Mill';
        this.renderQs();
    },
    renderQs(focusLast) {
        const L = this.edit.locked;
        $('svQs').innerHTML = this.edit.questions.map((q, i) => `
          <li class="sv-q" data-i="${i}">
            <div class="sv-q-row">
              <span class="fb-qn mono">${i + 1}</span>
              <select class="select" data-k="type" aria-label="ชนิดคำถามข้อ ${i + 1}" ${L ? 'disabled' : ''}>${Object.keys(SV_TYPES).map(t => `<option value="${t}" ${t === q.type ? 'selected' : ''}>${SV_TYPES[t]}</option>`).join('')}</select>
              <span class="sv-q-tools">
                <button type="button" class="icon-btn" data-qa="up" aria-label="เลื่อนขึ้น" ${i === 0 || L ? 'disabled' : ''}>${icon('chevron-up')}</button>
                <button type="button" class="icon-btn" data-qa="down" aria-label="เลื่อนลง" ${i === this.edit.questions.length - 1 || L ? 'disabled' : ''}>${icon('chevron-down')}</button>
                <button type="button" class="icon-btn" data-qa="del" aria-label="ลบคำถามข้อ ${i + 1}" ${L || this.edit.questions.length < 2 ? 'disabled' : ''}>${icon('trash')}</button>
              </span>
            </div>
            <input class="input" data-k="text" maxlength="200" value="${esc(q.text)}" placeholder="พิมพ์คำถาม" aria-label="คำถามข้อ ${i + 1}">
            ${q.type === 'rating' ? `<div class="sv-q-ends"><input class="input input-sm" data-k="low" maxlength="30" value="${esc(q.low || '')}" placeholder="1 = น้อยที่สุด" aria-label="ความหมายของ 1"><input class="input input-sm" data-k="high" maxlength="30" value="${esc(q.high || '')}" placeholder="5 = มากที่สุด" aria-label="ความหมายของ 5"></div>` : ''}
            ${q.type === 'choice' ? `<textarea class="input textarea" data-k="options" rows="3" ${L ? 'readonly' : ''} placeholder="ตัวเลือก บรรทัดละ 1 ตัวเลือก" aria-label="ตัวเลือกข้อ ${i + 1}">${esc((q.options || []).join('\n'))}</textarea>` : ''}
            <label class="check sv-q-req"><input type="checkbox" data-k="required" ${q.required ? 'checked' : ''}><span>ต้องตอบ</span></label>
          </li>`).join('');
        if (focusLast) { const ins = $('svQs').querySelectorAll('[data-k="text"]'); ins[ins.length - 1].focus(); }
    },
    readEditor() {
        $('svQs').querySelectorAll('.sv-q').forEach(li => {
            const q = this.edit.questions[Number(li.dataset.i)], v = k => li.querySelector(`[data-k="${k}"]`);
            q.type = v('type').value; q.text = v('text').value; q.required = v('required').checked;
            if (v('low')) { q.low = v('low').value.trim(); q.high = v('high').value.trim(); }
            if (v('options')) q.options = v('options').value.split('\n').map(x => x.trim()).filter(Boolean);
        });
    },
    onQClick(e) {
        const b = e.target.closest('[data-qa]'); if (!b) return;
        this.readEditor();
        const i = Number(b.closest('.sv-q').dataset.i), qs = this.edit.questions;
        if (b.dataset.qa === 'del') qs.splice(i, 1);
        if (b.dataset.qa === 'up' && i > 0) [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]];
        if (b.dataset.qa === 'down' && i < qs.length - 1) [qs[i + 1], qs[i]] = [qs[i], qs[i + 1]];
        this.renderQs();
    },
    pickVisible() {
        const q = $('svPickSearch').value.trim().toLowerCase();
        return this.participants.filter(p => !q || [p.id, p.name, p.site].join(' ').toLowerCase().includes(q));
    },
    renderPick() {
        const list = this.pickVisible();
        $('svPickList').innerHTML = list.length ? list.map(p => `<li><label class="check"><input type="checkbox" value="${esc(p.id)}" ${this.edit.picked.has(p.id) ? 'checked' : ''}><span><b>${esc(p.name)}</b> <small class="mono">${esc(p.id)}</small>${p.site ? `<small> · ${esc(p.site)}</small>` : ''}</span></label></li>`).join('') : `<li class="muted-text">ไม่พบผู้ใช้สิทธิ์</li>`;
        this.pickCount();
    },
    pickCount() { $('svPickCount').textContent = `เลือก ${fmtNum(this.edit.picked.size)} คน`; },
    // ทำ id คำถามให้คงที่ (ใช้จับคู่คำตอบ) — ข้อใหม่ได้ id ใหม่ที่ไม่ซ้ำ
    payloadQuestions() {
        const used = new Set(this.edit.questions.map(q => q.id).filter(Boolean));
        let n = 1;
        return this.edit.questions.map(q => {
            let id = q.id;
            if (!id) { while (used.has('q' + n)) n++; id = 'q' + n; used.add(id); }
            q.id = id;
            const o = { id, type: q.type, text: q.text.trim(), required: !!q.required };
            if (q.type === 'rating') { o.low = q.low || ''; o.high = q.high || ''; }
            if (q.type === 'choice') o.options = q.options || [];
            return o;
        });
    },
    validate() {
        this.readEditor();
        const title = $('svTitle').value.trim();
        if (!title) { $('svTitle').focus(); return 'กรุณาใส่หัวข้อแบบสอบถาม'; }
        const bad = this.edit.questions.findIndex(q => !q.text.trim());
        if (bad !== -1) { $('svQs').querySelectorAll('[data-k="text"]')[bad].focus(); return `คำถามข้อ ${bad + 1} ยังไม่มีข้อความ`; }
        const badC = this.edit.questions.findIndex(q => q.type === 'choice' && (q.options || []).length < 2);
        if (badC !== -1) return `คำถามข้อ ${badC + 1} ต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก (บรรทัดละ 1 ตัวเลือก)`;
        if (this.segVal('svTargetMode') === 'some' && !this.edit.picked.size) return 'กรุณาเลือกผู้ใช้สิทธิ์อย่างน้อย 1 คน';
        return '';
    },
    preview() {
        const err = this.validate();
        if (err) return showMessage({ title: 'ยังไม่ครบ', text: err, tone: 'warn' });
        const end = $('svEnd').value ? new Date($('svEnd').value).getTime() : null;
        // ซ่อนหน้าแก้ไขระหว่างดูตัวอย่าง (ไม่ให้เห็นกรอบหน้าต่างซ้อนกันสองชั้น)
        $('svEditModal').classList.add('is-behind');
        Feedback.openSurvey({ title: $('svTitle').value.trim(), intro: $('svIntro').value.trim(), questions: this.payloadQuestions(), endAt: end }, { preview: true })
            .then(() => $('svEditModal').classList.remove('is-behind'));
    },
    async save(draft) {
        const err = this.validate();
        if (err) return showMessage({ title: 'ยังไม่ครบ', text: err, tone: 'warn' });
        const later = this.segVal('svWhen') === 'later';
        const startAt = later ? new Date($('svStart').value).getTime() : (this.keepStart || Date.now());
        if (later && !(startAt > 0)) return showMessage({ title: 'ยังไม่ได้ตั้งเวลา', text: 'กรุณาเลือกวันเวลาเริ่มส่ง', tone: 'warn' });
        if (later && !draft && startAt < Date.now() - 60000 && !this.keepStart) return showMessage({ title: 'เวลาผ่านไปแล้ว', text: 'เวลาเริ่มส่งต้องเป็นอนาคต หรือเลือก "ส่งทันที"', tone: 'warn' });
        const endAt = $('svEnd').value ? new Date($('svEnd').value).getTime() : null;
        if (endAt && endAt <= startAt) return showMessage({ title: 'วันปิดรับไม่ถูกต้อง', text: 'วันปิดรับต้องอยู่หลังวันเริ่มส่ง', tone: 'warn' });
        const target = this.segVal('svTargetMode') === 'some' ? [...this.edit.picked] : 'all';
        const count = target === 'all' ? this.participants.length : target.length;
        if (!draft && !this.edit.id) {
            const ok = await showMessage({ title: later ? 'ตั้งเวลาส่งแบบสอบถาม?' : 'ส่งแบบสอบถามตอนนี้?',
                text: `ส่งถึงผู้ใช้สิทธิ์ ${fmtNum(count)} คน ${later ? 'เวลา ' + thDateTime(startAt) : 'ทันที'} · เครื่องที่เปิดการแจ้งเตือนจะได้รับแจ้ง`, tone: 'info', okText: later ? 'ตั้งเวลา' : 'ส่งเลย', cancelText: 'ยกเลิก' });
            if (!ok) return;
        }
        $('svSave').disabled = $('svDraft').disabled = true;
        const r = await api('admin.surveys.save', { id: this.edit.id, title: $('svTitle').value.trim(), intro: $('svIntro').value.trim(), questions: this.payloadQuestions(), startAt, endAt, target, draft: !!draft });
        $('svSave').disabled = $('svDraft').disabled = false;
        if (!r.success) return showMessage({ title: 'บันทึกไม่สำเร็จ', text: r.message || 'กรุณาลองใหม่', tone: 'bad' });
        $('svEditModal').close();
        toast(draft ? 'บันทึกร่างแล้ว' : r.pushed && r.pushed.sent ? `ส่งแล้ว · แจ้งเตือน ${fmtNum(r.pushed.sent)} เครื่อง` : later ? 'ตั้งเวลาส่งแล้ว' : 'บันทึกแล้ว');
        this.loadSurveys(true);
    },

    // ----- ผลแบบสอบถาม -----
    async openResult(s) {
        $('svResTitle').textContent = s.title;
        $('svResSub').textContent = `ตอบแล้ว ${fmtNum(s.responses)} / ${fmtNum(s.targetCount)} คน`;
        $('svResBody').innerHTML = '<div class="skel" style="height:160px;border-radius:16px"></div>';
        showModal('svResultModal');
        const r = await api('admin.surveys.responses', { id: s.id });
        if (!r.success) { $('svResBody').innerHTML = emptyState(r.message || 'โหลดไม่สำเร็จ', 'wifi-off'); return; }
        this.result = { survey: s, data: r };
        const qs = s.questions, rs = r.responses;
        const blocks = qs.map((q, i) => {
            const m = s.summary[i] || { n: 0 };
            let body = '';
            if (q.type === 'rating') {
                const max = Math.max(1, ...(m.dist || []));
                body = `<div class="sv-res-avg"><b>${m.avg !== null && m.avg !== undefined ? m.avg.toFixed(2) : '-'}</b><span>คะแนนเฉลี่ย จาก 5 · ${fmtNum(m.n)} คนตอบ</span></div>
                  <ul class="sv-bars">${(m.dist || []).map((c, k) => ({ c, k })).reverse().map(({ c, k }) => `<li><span>${k + 1} ${['😞', '🙁', '😐', '🙂', '😄'][k] || ''}</span><i><em style="width:${c / max * 100}%"></em></i><b>${fmtNum(c)}</b></li>`).join('')}</ul>`;
            } else if (q.type === 'choice') {
                const counts = m.counts || {}, max = Math.max(1, ...Object.values(counts));
                body = `<ul class="sv-bars sv-bars-text">${Object.keys(counts).map(o => `<li><span>${esc(o)}</span><i><em style="width:${counts[o] / max * 100}%"></em></i><b>${fmtNum(counts[o])}</b></li>`).join('')}</ul>`;
            } else {
                const texts = rs.filter(x => x.answers[q.id]).map(x => `<li><p>${esc(x.answers[q.id])}</p><small>${esc(x.name)} · ${esc(x.userId)} · ${thDate(x.ts)}</small></li>`);
                body = texts.length ? `<ul class="sv-texts">${texts.join('')}</ul>` : '<p class="muted-text">ยังไม่มีคำตอบ</p>';
            }
            return `<section class="card sv-res-q"><h3 class="card-title"><span class="fb-qn mono">${i + 1}</span>${esc(q.text)}</h3>${body}</section>`;
        }).join('');
        const pending = r.pending || [];
        $('svResBody').innerHTML = (rs.length ? blocks : `<div class="card">${emptyState('ยังไม่มีผู้ตอบ', 'inbox')}</div>`) +
            `<section class="card"><h3 class="card-title">ยังไม่ตอบ ${fmtNum(pending.length)} คน</h3>${pending.length ? `<p class="sv-pending">${pending.slice(0, 200).map(p => `<span>${esc(p.name)} <small class="mono">${esc(p.id)}</small></span>`).join('')}${pending.length > 200 ? ' …' : ''}</p>` : '<p class="muted-text">ทุกคนตอบแล้ว</p>'}</section>`;
        $('svResCsv').disabled = !rs.length;
    },
    downloadCsv() {
        if (!this.result) return;
        const { survey: s, data } = this.result, q = s.questions;
        const cell = v => { const t = String(v == null ? '' : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
        const rows = [['เวลา', 'รหัส', 'ชื่อ', 'ทำเมื่อ', 'อุปกรณ์'].concat(q.map((x, i) => `${i + 1}. ${x.text}`))]
            .concat(data.responses.map(r => [new Date(r.ts).toLocaleString('th-TH', { timeZone: TZ }), r.userId, r.name, r.when, r.client].concat(q.map(x => r.answers[x.id] == null ? '' : r.answers[x.id]))));
        const blob = new Blob(['﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `HRPM-survey-${s.id}.csv`; // ชื่อไฟล์ภาษาอังกฤษ: บางเบราว์เซอร์เปลี่ยนชื่อไทยเป็น "download" (ไม่มีนามสกุล)
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    FeedbackAdmin.init();
    if (location.hash === '#problem') setTimeout(() => FeedbackAdmin.openReport(), 900);
});
