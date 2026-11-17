// js/staff/inbox.js — หน้าเจ้าหน้าที่: กล่องการแจ้งเตือน (กระดิ่ง) + ผู้ดูแลระบบ › ประกาศ
// API: staff.inbox.list · admin.news.list / save / delete (Inbox.gs) · กล่องกลางอยู่ใน js/inbox.js

const NEWS_AUD = { all: ['ทุกคน', 'is-accent'], participants: ['ผู้ใช้สิทธิ์', 'is-ok'], staff: ['เจ้าหน้าที่', 'is-warn'] };
// แม่แบบประกาศสำเร็จรูป — เลือกแล้วแก้ข้อความ/วันที่ได้ก่อนประกาศ (d = วันที่พรุ่งนี้แบบไทย)
const NEWS_TEMPLATES = [
    { id: 'maint', label: 'ปิดปรับปรุงระบบ', kind: 'system', audience: 'all', push: true, banner: true, days: 2,
        title: d => `ปิดปรับปรุงระบบ ${d} เวลา 22:00–23:00 น.`,
        body: d => `ระบบจะปิดปรับปรุงชั่วคราวในวันที่ ${d} เวลา 22:00–23:00 น. ช่วงเวลาดังกล่าวอาจเข้าใช้งานหรือส่งรายงานไม่ได้\nกรุณาส่งรายงานก่อนหรือหลังช่วงเวลานี้ ขออภัยในความไม่สะดวก` },
    { id: 'outage', label: 'ระบบขัดข้อง', kind: 'system', audience: 'all', push: true, banner: true, days: 1,
        title: () => 'แจ้งด่วน: ระบบส่งรายงานขัดข้องชั่วคราว',
        body: () => 'ขณะนี้ระบบส่งรายงานขัดข้อง ทีมงานกำลังแก้ไขอย่างเร่งด่วน\nรายงานที่ส่งไม่สำเร็จจะเก็บไว้ในเครื่องและส่งให้อัตโนมัติเมื่อระบบกลับมา ไม่ต้องส่งซ้ำ' },
    { id: 'fixed', label: 'ระบบกลับมาใช้งานได้', kind: 'system', audience: 'all', push: false, days: 2,
        title: () => 'ระบบกลับมาใช้งานได้ตามปกติแล้ว',
        body: () => 'ระบบส่งรายงานกลับมาใช้งานได้ตามปกติแล้ว ขออภัยในความไม่สะดวก หากยังพบปัญหา แจ้งได้ที่ บัญชี › แจ้งปัญหาการใช้งาน' },
    { id: 'holiday', label: 'วันหยุด', kind: 'news', audience: 'participants', push: true, days: 3,
        title: d => `วันหยุด ${d} — ไม่ต้องส่งรายงาน`,
        body: d => `วันที่ ${d} เป็นวันหยุด ไม่ต้องส่งรายงานการขายประจำวัน\nกลับมาส่งรายงานตามปกติในวันทำการถัดไป` },
    { id: 'remind', label: 'เตือนส่งรายงาน', kind: 'news', audience: 'participants', push: true, target: 'missing', days: 1,
        title: () => 'อย่าลืมส่งรายงานการขายวันนี้',
        body: () => 'ขอให้ผู้ใช้สิทธิ์ทุกท่านส่งรายงานการขายประจำวัน พร้อมรูปหลักฐานที่เห็นบัตร ล็อคที่ขาย และผู้ขาย ภายในเวลา 17:00 น.' },
    { id: 'rule', label: 'เปลี่ยนข้อปฏิบัติ', kind: 'news', audience: 'participants', push: true, ack: true, days: 14,
        title: () => 'ปรับปรุงข้อปฏิบัติการส่งรายงาน',
        body: d => `ตั้งแต่วันที่ ${d} เป็นต้นไป มีการปรับปรุงข้อปฏิบัติการส่งรายงาน ดังนี้\n- (รายละเอียดข้อที่ 1)\n- (รายละเอียดข้อที่ 2)\nอ่านข้อปฏิบัติฉบับเต็มได้ที่หน้าเข้าสู่ระบบ` },
    { id: 'feature', label: 'ฟีเจอร์ใหม่', kind: 'news', audience: 'all', push: false, days: 14,
        title: () => 'ใหม่! ฟีเจอร์ที่ช่วยให้ใช้งานง่ายขึ้น',
        body: () => 'เราเพิ่มฟีเจอร์ใหม่ (ชื่อฟีเจอร์) ช่วยให้ (ประโยชน์) ได้สะดวกขึ้น ลองใช้งานได้แล้วที่เมนู (ชื่อเมนู)' },
    { id: 'meeting', label: 'ประชุม / อบรม', kind: 'news', audience: 'staff', push: true, days: 7,
        title: d => `ประชุมเจ้าหน้าที่ ${d} เวลา 10:00 น.`,
        body: d => `ขอเชิญเจ้าหน้าที่ทุกท่านเข้าร่วมประชุม/อบรมการใช้งานระบบ วันที่ ${d} เวลา 10:00–11:00 น.\nสถานที่/ลิงก์: (ระบุ)` }
];
const thLongDate = ts => new Date(ts).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const NewsAdmin = {
    list: [], req: 0, edit: null,

    init() {
        $('newsNew').addEventListener('click', () => this.openEditor(null));
        $('newsList').addEventListener('click', e => this.onClick(e));
        $('newsAudience').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) this.setAud(b.dataset.v); });
        $('newsBody').addEventListener('input', () => { $('newsCount').textContent = $('newsBody').value.length + '/1500'; });
        $('newsForm').addEventListener('submit', e => { e.preventDefault(); this.save(false); });
        $('newsDraft').addEventListener('click', () => this.save(true));
        $('newsPreviewBtn').addEventListener('click', () => this.togglePreview());
        $('newsTarget').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) this.setTarget(b.dataset.v); });
        $('newsTargetPick').addEventListener('click', e => this.onPick(e));
        $('newsTargetPick').addEventListener('input', e => { if (e.target.id === 'newsPeopleQ') this.renderPick(); });
        $('newsPublishAt').addEventListener('change', () => this.syncSaveLabel());
        ['newsTitle', 'newsBody'].forEach(id => $(id).addEventListener('input', () => { if (!$('newsPreview').hidden) this.renderPreview(); }));
        $('newsReadersTabs').addEventListener('click', e => { const b = e.target.closest('[data-rt]'); if (b) { this.readersTab = b.dataset.rt; this.renderReaders(); } });
        $('newsReadersCopy').addEventListener('click', () => this.copyReaders());
        $('newsKind').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) this.setKind(b.dataset.v); });
        $('newsTpls').innerHTML = NEWS_TEMPLATES.map(t => `<button type="button" class="qchip" data-tpl="${t.id}">${esc(t.label)}${t.kind === 'system' ? ' <span class="tpl-sys">ระบบ</span>' : ''}</button>`).join('');
        $('newsTpls').addEventListener('click', e => { const b = e.target.closest('[data-tpl]'); if (b) this.applyTpl(b.dataset.tpl); });
        $('newsImgFile').addEventListener('change', async e => {
            const f = e.target.files[0]; if (!f) return;
            try { this.img = await shrinkImage(f, 1600, false); this.imgRemove = false; this.showImg(this.img.url); }
            catch (err) { showMessage({ title: 'ใช้รูปนี้ไม่ได้', text: err.message, tone: 'warn' }); }
            e.target.value = '';
        });
        $('newsImgDel').addEventListener('click', () => { this.img = null; this.imgRemove = !!(this.edit && this.edit.image); this.showImg(''); });
    },
    setKind(v) { $('newsKind').querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === v))); },
    kind() { const b = $('newsKind').querySelector('[aria-checked="true"]'); return b ? b.dataset.v : 'news'; },
    showImg(url) {
        $('newsImgPrev').hidden = !url; $('newsImgDel').hidden = !url;
        $('newsImgPrev').innerHTML = url ? `<img src="${esc(url)}" alt="" referrerpolicy="no-referrer">` : '';
    },
    // ใส่ข้อความจากแม่แบบ (ถามก่อนถ้าพิมพ์อะไรไว้แล้ว)
    async applyTpl(id) {
        const t = NEWS_TEMPLATES.find(x => x.id === id); if (!t) return;
        if (($('newsTitle').value.trim() || $('newsBody').value.trim()) && !(await showMessage({ title: 'ใช้แม่แบบ "' + t.label + '"?', text: 'ข้อความที่พิมพ์ไว้จะถูกแทนที่', okText: 'ใช้แม่แบบ', cancelText: 'ยกเลิก' }))) return;
        const d = thLongDate(Date.now() + 86400000);
        $('newsTitle').value = t.title(d); $('newsBody').value = t.body(d);
        $('newsCount').textContent = $('newsBody').value.length + '/1500';
        this.setAud(t.audience); this.setKind(t.kind); $('newsPush').checked = !!t.push;
        $('newsBanner').checked = !!t.banner; $('newsAck').checked = !!t.ack;
        if (t.target) this.setTarget(t.target);
        $('newsExpires').value = this.localInput(Date.now() + t.days * 86400000);
        $('newsTpls').querySelectorAll('[data-tpl]').forEach(b => b.classList.toggle('is-on', b.dataset.tpl === id));
        $('newsBody').focus();
    },
    setAud(v) { $('newsAudience').querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === v))); this.syncTargetWrap(); },
    aud() { const b = $('newsAudience').querySelector('[aria-checked="true"]'); return b ? b.dataset.v : 'all'; },

    async load(silent) {
        const req = ++this.req;
        if (!silent && !this.list.length) $('newsList').innerHTML = '<div class="skel" style="height:120px;border-radius:16px"></div>';
        const r = await api('admin.news.list');
        if (req !== this.req) return;
        if (!r.success) { $('newsList').innerHTML = emptyState(r.message || 'โหลดไม่สำเร็จ', 'wifi-off'); return; }
        this.list = r.news;
        this.orgs = r.orgs || []; this.isDev = can('dev');
        this.render();
    },
    render() {
        if (!this.list.length) {
            $('newsList').innerHTML = `<div class="card sv-empty">${icon('bell')}<b>ยังไม่มีประกาศ</b><p class="muted-text">เช่น แจ้งปิดปรับปรุงระบบ วันหยุด หรือเปลี่ยนแปลงข้อปฏิบัติ — ผู้รับเห็นในกล่องการแจ้งเตือนทันที</p><button type="button" class="btn btn-primary btn-sm" data-na="new">${icon('plus', 'ic-16')} เขียนประกาศ</button></div>`;
            return;
        }
        const now = Date.now();
        $('newsList').innerHTML = this.list.map(n => {
            const a = NEWS_AUD[n.audience] || NEWS_AUD.all, expired = n.expiresAt && n.expiresAt <= now;
            return `<article class="card news-card ${expired ? 'is-expired' : ''}" data-id="${esc(n.id)}">
              <div class="news-meta">${n.status === 'draft' ? '<span class="badge is-warn">ร่าง</span>' : ''}${n.scheduled ? `<span class="badge is-info">${icon('calendar', 'ic-16')} เผยแพร่ ${esc(thDateTime(n.publishAt))}</span>` : ''}${n.banner ? '<span class="badge is-bad">ด่วน</span>' : ''}${n.ack ? '<span class="badge is-warn">ต้องรับทราบ</span>' : ''}${n.target ? `<span class="badge">${esc(n.target.label || 'บางกลุ่ม')}</span>` : ''}<span class="badge ${a[1]}">${a[0]}</span>${this.isDev ? `<span class="badge ${n.org ? 'is-info' : ''}">${esc(n.org ? (n.orgName || n.org) : 'ทุกองค์กร')}</span>` : ''}${n.kind === 'system' ? '<span class="badge is-bad">ระบบ</span>' : ''}${expired ? '<span class="badge">หมดอายุแล้ว</span>' : n.expiresAt ? `<span class="muted-text">ถึง ${thDateTime(n.expiresAt)}</span>` : ''}${n.pushed ? `<span class="muted-text">แจ้งเตือนมือถือ ${fmtNum(n.pushed)} เครื่อง</span>` : ''}</div>
              <b class="news-title" data-no-i18n>${esc(n.title)}</b>
              <p class="news-body" data-no-i18n>${esc(n.body)}</p>
              ${n.image ? `<img class="news-img" src="${esc(n.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
              ${n.link ? `<a class="news-link" href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.link)}</a>` : ''}
              ${n.stats ? this.statsHtml(n) : ''}
              <div class="news-foot"><small class="muted-text">${esc(n.by || '-')} · ${n.status === 'draft' ? 'บันทึก ' + thDateTime(n.updatedAt || n.ts) : thDateTime(n.at || n.ts)}${n.status !== 'draft' && n.updatedAt && n.updatedAt - n.ts > 60000 ? ' · แก้ไขแล้ว' : ''}</small>
                <span class="sv-actions">${n.stats ? `<button type="button" class="btn-chip" data-na="readers">${icon('users', 'ic-16')} รายชื่อ</button>` : ''}<button type="button" class="btn-chip" data-na="edit">${icon('edit', 'ic-16')} ${n.status === 'draft' ? 'แก้ไข/เผยแพร่' : 'แก้ไข'}</button><button type="button" class="btn-chip btn-chip-bad" data-na="delete">${icon('trash', 'ic-16')} ลบ</button></span></div>
            </article>`;
        }).join('');
    },
    async onClick(e) {
        const b = e.target.closest('[data-na]'); if (!b) return;
        if (b.dataset.na === 'new') return this.openEditor(null);
        const n = this.list.find(x => x.id === b.closest('[data-id]').dataset.id); if (!n) return;
        if (b.dataset.na === 'edit') return this.openEditor(n);
        if (b.dataset.na === 'readers') return this.openReaders(n);
        if (b.dataset.na === 'delete') {
            if (!await showMessage({ title: 'ลบประกาศ?', text: `"${n.title}" จะหายจากกล่องการแจ้งเตือนของผู้รับทุกคน`, tone: 'bad', okText: 'ลบ', cancelText: 'ยกเลิก' })) return;
            const r = await api('admin.news.delete', { id: n.id });
            if (!r.success) return showMessage({ title: 'ลบไม่สำเร็จ', text: r.message || '', tone: 'bad' });
            toast('ลบประกาศแล้ว'); this.load(true); Inbox.refresh(true);
        }
    },
    localInput(ts) { if (!ts) return ''; const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); },
    openEditor(n) {
        this.edit = n;
        $('newsTitleH').textContent = n ? 'แก้ไขประกาศ' : 'เขียนประกาศ';
        $('newsTitle').value = n ? n.title : ''; $('newsBody').value = n ? n.body : ''; $('newsLink').value = n ? n.link : '';
        $('newsExpires').value = this.localInput(n && n.expiresAt); $('newsExpires').min = this.localInput(Date.now());
        $('newsPush').checked = false;
        $('newsCount').textContent = $('newsBody').value.length + '/1500';
        this.setAud(n ? n.audience : 'all');
        this.setKind(n ? n.kind || 'news' : 'news');
        this.img = null; this.imgRemove = false; this.showImg(n && n.image ? n.image : '');
        $('newsTplWrap').hidden = !!n;
        // องค์กรที่ส่งถึง: Dev เลือกได้ · ผู้ดูแลองค์กร = องค์กรตัวเองเสมอ
        const dev = can('dev'), scoped = !dev && !!(ST.me && ST.me.org);
        $('newsOrgWrap').hidden = !dev; $('newsScopeHint').hidden = !scoped;
        if (dev) { $('newsOrg').innerHTML = '<option value="">ทุกองค์กร (ประกาศจากผู้ให้บริการ)</option>' + (this.orgs || []).map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join(''); $('newsOrg').value = n ? n.org || '' : ''; }
        $('newsTpls').querySelectorAll('[data-tpl]').forEach(b => b.classList.remove('is-on'));
        const sched = n && n.publishAt && n.publishAt > Date.now();
        $('newsPublishAt').value = sched ? this.localInput(n.publishAt) : ''; $('newsPublishAt').min = this.localInput(Date.now());
        $('newsBanner').checked = !!(n && n.banner); $('newsAck').checked = !!(n && n.ack);
        $('newsPreview').hidden = true; $('newsPreviewBtn').lastChild.textContent = ' ดูตัวอย่าง';
        this.tgt = { mode: 'all', sites: new Set(), ids: new Set() };
        if (n && n.target) this.tgt = { mode: n.target.sites.length ? 'sites' : 'people', sites: new Set(n.target.sites), ids: new Set(n.target.ids) };
        this.setTarget(this.tgt.mode, true);
        $('newsDraft').hidden = !!(n && n.status === 'active'); // เผยแพร่แล้ว: ไม่ย้อนกลับเป็นร่าง
        this.syncSaveLabel();
        showModal('newsModal');
        setTimeout(() => $('newsTitle').focus(), 50);
    },
    // ข้อความปุ่มหลักตามสถานะ: ประกาศ · ตั้งเวลา · บันทึก (แก้ประกาศที่เผยแพร่แล้ว) · เผยแพร่ (จากร่าง)
    syncSaveLabel() {
        const n = this.edit, sched = !!$('newsPublishAt').value && new Date($('newsPublishAt').value).getTime() > Date.now() + 60000;
        $('newsSave').textContent = sched ? 'ตั้งเวลาเผยแพร่' : n && n.status === 'active' ? 'บันทึก' : n && n.status === 'draft' ? 'เผยแพร่' : 'ประกาศ';
    },
    // ---------- ผู้ใช้สิทธิ์ที่ได้รับ (เฉพาะประกาศถึงผู้ใช้สิทธิ์) ----------
    syncTargetWrap() { const show = this.aud() === 'participants'; $('newsTargetWrap').hidden = !show; if (show) this.renderPick(); },
    async setTarget(mode, keep) {
        this.tgt = this.tgt || { mode: 'all', sites: new Set(), ids: new Set() };
        this.tgt.mode = mode;
        $('newsTarget').querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === mode)));
        if (mode !== 'all' && !this.people) { $('newsTargetPick').innerHTML = '<div class="skel" style="height:64px;border-radius:12px"></div>'; this.people = await loadParticipants().catch(() => []); }
        if (mode === 'missing' && !keep) this.tgt.ids = new Set((this.people || []).filter(p => p.active !== false && !p.reportedToday).map(p => p.id));
        this.syncTargetWrap();
    },
    renderPick() {
        const t = this.tgt || { mode: 'all' }, box = $('newsTargetPick'), ppl = (this.people || []).filter(p => p.active !== false);
        let html = '', n = 0;
        if (t.mode === 'sites') {
            const sites = {};
            ppl.forEach(p => { const k = p.site || ''; if (k) sites[k] = (sites[k] || 0) + 1; });
            const keys = Object.keys(sites).sort((a, b) => a.localeCompare(b, 'th'));
            html = keys.length ? `<div class="chips-row news-site-chips" role="group" aria-label="จุดขาย">${keys.map(k => `<button type="button" class="qchip ${t.sites.has(k) ? 'is-on' : ''}" data-site="${esc(k)}" aria-pressed="${t.sites.has(k)}">${esc(k)} <span class="muted-text">${sites[k]}</span></button>`).join('')}</div>`
                : '<p class="hint">ยังไม่มีผู้ใช้สิทธิ์ที่กำหนดจุดขาย</p>';
            n = ppl.filter(p => t.sites.has(p.site)).length;
        } else if (t.mode === 'missing') {
            n = t.ids.size;
            html = `<p class="hint">ส่งถึงผู้ใช้สิทธิ์ที่ยังไม่ส่งรายงานวันนี้ ณ ตอนนี้ — คนที่ส่งหลังจากนี้ยังเห็นประกาศอยู่</p>`;
        } else if (t.mode === 'people') {
            const q = ($('newsPeopleQ') || {}).value || '', ql = q.trim().toLowerCase();
            const list = ppl.filter(p => !ql || (p.name + ' ' + p.id + ' ' + (p.site || '')).toLowerCase().indexOf(ql) !== -1).slice(0, 200);
            html = `<input class="input input-sm" id="newsPeopleQ" type="search" placeholder="ค้นหาชื่อ รหัส หรือจุดขาย" value="${esc(q)}" autocomplete="off">
              <ul class="news-people">${list.map(p => `<li><label class="check"><input type="checkbox" data-pid="${esc(p.id)}" ${t.ids.has(p.id) ? 'checked' : ''}><span>${esc(p.name)}<small class="hint">${esc(p.id)}${p.site ? ' · ' + esc(p.site) : ''}${p.reportedToday ? '' : ' · ยังไม่ส่งวันนี้'}</small></span></label></li>`).join('') || '<li class="hint">ไม่พบ</li>'}</ul>`;
            n = t.ids.size;
        }
        const focus = document.activeElement && document.activeElement.id === 'newsPeopleQ', pos = focus ? document.activeElement.selectionStart : 0;
        box.innerHTML = html;
        if (focus && $('newsPeopleQ')) { $('newsPeopleQ').focus(); try { $('newsPeopleQ').setSelectionRange(pos, pos); } catch (e) {} }
        $('newsTargetCount').textContent = t.mode === 'all' ? '' : `ส่งถึง ${fmtNum(n)} คน`;
    },
    onPick(e) {
        const t = this.tgt; if (!t) return;
        const sb = e.target.closest('[data-site]');
        if (sb) { const k = sb.dataset.site; t.sites.has(k) ? t.sites.delete(k) : t.sites.add(k); this.renderPick(); return; }
        const cb = e.target.closest('[data-pid]');
        if (cb) { cb.checked ? t.ids.add(cb.dataset.pid) : t.ids.delete(cb.dataset.pid); $('newsTargetCount').textContent = `ส่งถึง ${fmtNum(t.ids.size)} คน`; }
    },
    targetPayload() {
        const t = this.tgt;
        if (this.aud() !== 'participants' || !t || t.mode === 'all') return null;
        if (t.mode === 'sites') return t.sites.size ? { sites: [...t.sites], label: [...t.sites].slice(0, 2).join(', ') + (t.sites.size > 2 ? ` +${t.sites.size - 2}` : '') } : { error: 'เลือกจุดขายอย่างน้อย 1 จุด' };
        if (!t.ids.size) return { error: t.mode === 'missing' ? 'วันนี้ทุกคนส่งรายงานแล้ว' : 'เลือกผู้รับอย่างน้อย 1 คน' };
        return { ids: [...t.ids], label: t.mode === 'missing' ? 'ยังไม่ส่ง ' + thDate(Date.now(), { day: 'numeric', month: 'short' }) : `${t.ids.size} คน` };
    },
    // ---------- ตัวอย่าง: หน้าตาในกล่องแจ้งเตือน (+ แถบด่วน) ----------
    togglePreview() {
        const p = $('newsPreview'); p.hidden = !p.hidden;
        $('newsPreviewBtn').lastChild.textContent = p.hidden ? ' ดูตัวอย่าง' : ' ซ่อนตัวอย่าง';
        if (!p.hidden) { this.renderPreview(); p.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    },
    renderPreview() {
        const tIn = $('newsTitle').value.trim(), bIn = $('newsBody').value.trim(), sys = this.kind() === 'system';
        const title = tIn || 'หัวข้อประกาศ', body = bIn || 'รายละเอียดประกาศ', nt = tIn ? ' data-no-i18n' : '', nb = bIn ? ' data-no-i18n' : '';
        const img = this.img ? 'data:' + this.img.mimeType + ';base64,' + this.img.data : (this.edit && !this.imgRemove ? this.edit.image : '');
        $('newsPreview').innerHTML = `<p class="label">ตัวอย่างที่ผู้รับเห็น</p>
          ${$('newsBanner').checked ? `<div class="urgent-banner is-preview"><span class="urgent-ic">${icon('alert')}</span><div class="urgent-main"><b${nt}>${esc(title)}</b><p${nb}>${esc(body)}</p>
            <div class="urgent-acts">${$('newsAck').checked ? `<span class="btn btn-primary btn-sm">${icon('check', 'ic-16')}รับทราบ</span>` : ''}<span class="btn btn-outline btn-sm">อ่านทั้งหมด</span></div></div></div>` : ''}
          <article class="inbox-item is-unread"><span class="inbox-ic tone-${sys ? 'warn' : 'news'}">${icon(sys ? 'alert' : 'bell')}</span>
            <div class="inbox-main"><div class="inbox-top"><b${nt}>${esc(title)}</b><time>เมื่อสักครู่</time></div>
              ${$('newsBanner').checked || $('newsAck').checked ? `<div class="inbox-tags">${$('newsBanner').checked ? '<span class="inbox-tag is-bad">ด่วน</span>' : ''}${$('newsAck').checked ? '<span class="inbox-tag is-warn">ต้องกดรับทราบ</span>' : ''}</div>` : ''}
              <p${nb}>${esc(body)}</p>${img ? `<img class="inbox-img" src="${esc(img)}" alt="" referrerpolicy="no-referrer">` : ''}
              ${$('newsAck').checked ? `<div class="inbox-ack"><span class="btn btn-primary btn-sm">${icon('check', 'ic-16')}รับทราบ</span></div>` : ''}
              ${$('newsLink').value.trim() ? `<div class="inbox-actions"><span class="btn-chip">เปิดลิงก์</span></div>` : ''}</div>
            <span class="inbox-dot"></span></article>`;
    },
    async save(draft) {
        const title = $('newsTitle').value.trim(), body = $('newsBody').value.trim(), link = $('newsLink').value.trim();
        if (!title) { $('newsTitle').focus(); return showMessage({ title: 'ยังไม่มีหัวข้อ', text: 'กรุณาใส่หัวข้อประกาศ', tone: 'warn' }); }
        if (!draft && !body) { $('newsBody').focus(); return showMessage({ title: 'ยังไม่มีข้อความ', text: 'กรุณาใส่รายละเอียดประกาศ', tone: 'warn' }); }
        if (link && !/^https:\/\/\S+$/i.test(link)) return showMessage({ title: 'ลิงก์ไม่ถูกต้อง', text: 'ลิงก์ต้องขึ้นต้นด้วย https://', tone: 'warn' });
        const expiresAt = $('newsExpires').value ? new Date($('newsExpires').value).getTime() : null;
        const publishAt = $('newsPublishAt').value ? new Date($('newsPublishAt').value).getTime() : null;
        if (!draft && expiresAt && expiresAt <= Date.now()) return showMessage({ title: 'วันที่ผ่านไปแล้ว', text: '"แสดงถึง" ต้องเป็นเวลาในอนาคต', tone: 'warn' });
        if (!draft && publishAt && publishAt <= Date.now() + 60000 && !(await showMessage({ title: 'เวลาเผยแพร่ผ่านไปแล้ว', text: 'ประกาศทันทีแทนไหม?', tone: 'warn', okText: 'ประกาศทันที', cancelText: 'แก้เวลา' }))) return;
        if (publishAt && expiresAt && expiresAt <= publishAt) return showMessage({ title: 'เวลาไม่ถูกต้อง', text: '"แสดงถึง" ต้องหลังเวลาเผยแพร่', tone: 'warn' });
        const banner = $('newsBanner').checked, ack = $('newsAck').checked;
        if (banner && !expiresAt) { $('newsExpires').focus(); return showMessage({ title: 'กำหนด "แสดงถึง" ก่อน', text: 'แถบประกาศด่วนจะแสดงบนหน้าแรกจนถึงเวลานั้น', tone: 'warn' }); }
        const target = this.targetPayload();
        if (target && target.error) return showMessage({ title: 'ยังไม่ได้เลือกผู้รับ', text: target.error, tone: 'warn' });
        $('newsSave').disabled = $('newsDraft').disabled = true;
        if (this.img) showLoading(true, 'กำลังอัปโหลดรูป…');
        const r = await api('admin.news.save', Object.assign(can('dev') ? { org: $('newsOrg').value } : {}, { id: this.edit ? this.edit.id : null, title, body, link, audience: this.aud(), kind: this.kind(), expiresAt, push: $('newsPush').checked,
            publishAt: publishAt && publishAt > Date.now() + 60000 ? publishAt : null, banner, ack, target, draft: !!draft,
            image: this.img ? { data: this.img.data, mimeType: this.img.mimeType } : null, removeImage: this.imgRemove }));
        showLoading(false);
        $('newsSave').disabled = $('newsDraft').disabled = false;
        if (!r.success) return showMessage({ title: 'บันทึกไม่สำเร็จ', text: r.message || 'กรุณาลองใหม่', tone: 'bad' });
        $('newsModal').close();
        toast(r.draft ? 'บันทึกร่างแล้ว' : r.scheduled ? `ตั้งเวลาแล้ว · เผยแพร่ ${thDateTime(r.scheduled)}${$('newsPush').checked ? ' พร้อมแจ้งเตือนมือถือ' : ''}` : r.pushed ? `ประกาศแล้ว · แจ้งเตือนมือถือ ${fmtNum(r.pushed.sent || 0)} เครื่อง` : this.edit && this.edit.status === 'active' ? 'บันทึกแล้ว' : 'ประกาศแล้ว');
        this.load(true); Inbox.refresh(true);
    },
    // ---------- ยอดคนอ่าน / รับทราบ ----------
    statsHtml(n) {
        const st = n.stats, pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
        const bar = (label, a, cls) => `<div class="news-stat"><div class="news-stat-top"><span>${label}</span><b>${fmtNum(a)}<small> / ${fmtNum(st.recipients)}</small></b></div><span class="news-bar ${cls}" role="progressbar" aria-valuenow="${pct(a, st.recipients)}" aria-valuemin="0" aria-valuemax="100" aria-label="${label} ${pct(a, st.recipients)}%"><i style="width:${pct(a, st.recipients)}%"></i></span></div>`;
        return `<div class="news-stats">${bar('อ่านแล้ว', st.read, '')}${st.acked != null ? bar('รับทราบแล้ว', st.acked, 'is-ok') : ''}</div>`;
    },
    async openReaders(n) {
        this.readersOf = n; this.readers = null; this.readersTab = n.ack ? 'noack' : 'unread';
        $('newsReadersTitle').textContent = n.title; $('newsReadersSub').textContent = 'กำลังโหลด…';
        $('newsReadersTabs').innerHTML = ''; $('newsReadersList').innerHTML = '<li><div class="skel" style="height:120px;border-radius:12px"></div></li>';
        showModal('newsReadersModal');
        const r = await api('admin.news.readers', { id: n.id });
        if (!r.success) { $('newsReadersList').innerHTML = `<li class="hint">${esc(r.message || 'โหลดไม่สำเร็จ')}</li>`; return; }
        this.readers = r; this.renderReaders();
    },
    readersGroups() {
        const p = (this.readers && this.readers.people) || [], g = [['unread', 'ยังไม่อ่าน', p.filter(x => !x.read)], ['read', 'อ่านแล้ว', p.filter(x => x.read)]];
        if (this.readers && this.readers.ack) g.unshift(['noack', 'ยังไม่รับทราบ', p.filter(x => !x.ackAt)], ['ack', 'รับทราบแล้ว', p.filter(x => x.ackAt)]);
        return g;
    },
    renderReaders() {
        const r = this.readers; if (!r) return;
        const groups = this.readersGroups(), cur = groups.find(g => g[0] === this.readersTab) || groups[0];
        this.readersTab = cur[0];
        $('newsReadersSub').textContent = `ผู้รับ ${fmtNum(r.people.length)} คน`;
        $('newsReadersTabs').innerHTML = groups.map(g => `<button type="button" role="tab" data-rt="${g[0]}" aria-selected="${g[0] === cur[0]}">${g[1]} <span class="seg-count">${fmtNum(g[2].length)}</span></button>`).join('');
        $('newsReadersList').innerHTML = cur[2].length ? cur[2].map(x => `<li><span class="avatar">${esc(String(x.name || '?').trim().charAt(0))}</span><span class="news-reader-main"><b>${esc(x.name)}</b><small>${esc(x.sub || '')}${x.kind === 'staff' ? ' · เจ้าหน้าที่' : ''}</small></span>${x.ackAt ? `<small class="news-reader-at">${esc(thDateTime(x.ackAt))}</small>` : ''}</li>`).join('')
            : `<li class="news-readers-empty">${icon('check-circle')}<span>ไม่มีรายชื่อในกลุ่มนี้</span></li>`;
        $('newsReadersCopy').disabled = !cur[2].length;
    },
    copyReaders() {
        const cur = this.readersGroups().find(g => g[0] === this.readersTab); if (!cur) return;
        const text = cur[2].map(x => `${x.name}\t${x.sub || ''}`).join('\n');
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast(`คัดลอก ${fmtNum(cur[2].length)} รายชื่อแล้ว`)).catch(() => toast('คัดลอกไม่สำเร็จ'));
    }
};

// ---------- กล่องการแจ้งเตือนของเจ้าหน้าที่ ----------
document.addEventListener('DOMContentLoaded', () => {
    NewsAdmin.init();
    Inbox.init({
        app: 'staff',
        uid: () => (ST.me && ST.token ? ST.me.id : ''),
        fetch: () => api('staff.inbox.list'),
        push: patch => api('staff.inbox.read', patch),
        pullState: () => api('staff.inbox.state'),
        ack: id => api('staff.inbox.ack', { id }),
        openSettings: () => openSettings(),
        show: () => switchTab('inbox'),
        manage: { label: 'เขียนประกาศ', show: () => can('admin'), open: () => { VIEWS.admin.tab = 'news'; switchTab('admin'); setTimeout(() => NewsAdmin.openEditor(null), 150); } },
        onAction: it => {
            if (!it.action) return;
            if (it.action.kind === 'admin' && can('admin')) { VIEWS.admin.tab = it.action.value; switchTab('admin'); }
            else if (it.action.kind === 'tab') switchTab(it.action.value);
            else if (it.action.kind === 'dev' && can('dev') && VIEWS.dev) { VIEWS.dev.sec = it.action.value; VIEWS.dev.filt.invSt = 'pending'; delete VIEWS.dev.cache.invoices; switchTab('dev'); }
        }
    });
    // เข้าสู่ระบบ/สลับบัญชี/ออกจากระบบ: โหลดกล่องของบัญชีนั้นใหม่
    let last = null;
    const watch = () => {
        const id = ST.me && ST.token ? ST.me.id : '';
        if (id !== last) { last = id; Inbox.reset(); if (id) Inbox.refresh(true); }
    };
    setInterval(watch, 1500); watch();
});
