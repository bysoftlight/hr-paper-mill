// js/staff/inbox.js — หน้าเจ้าหน้าที่: กล่องการแจ้งเตือน (กระดิ่ง) + ผู้ดูแลระบบ › ประกาศ
// API: staff.inbox.list · admin.news.list / save / delete (Inbox.gs) · กล่องกลางอยู่ใน js/inbox.js

const NEWS_AUD = { all: ['ทุกคน', 'is-accent'], participants: ['ผู้ใช้สิทธิ์', 'is-ok'], staff: ['เจ้าหน้าที่', 'is-warn'] };
// แม่แบบประกาศสำเร็จรูป — เลือกแล้วแก้ข้อความ/วันที่ได้ก่อนประกาศ (d = วันที่พรุ่งนี้แบบไทย)
const NEWS_TEMPLATES = [
    { id: 'maint', label: 'ปิดปรับปรุงระบบ', kind: 'system', audience: 'all', push: true, days: 2,
        title: d => `ปิดปรับปรุงระบบ ${d} เวลา 22:00–23:00 น.`,
        body: d => `ระบบจะปิดปรับปรุงชั่วคราวในวันที่ ${d} เวลา 22:00–23:00 น. ช่วงเวลาดังกล่าวอาจเข้าใช้งานหรือส่งรายงานไม่ได้\nกรุณาส่งรายงานก่อนหรือหลังช่วงเวลานี้ ขออภัยในความไม่สะดวก` },
    { id: 'outage', label: 'ระบบขัดข้อง', kind: 'system', audience: 'all', push: true, days: 1,
        title: () => 'แจ้งด่วน: ระบบส่งรายงานขัดข้องชั่วคราว',
        body: () => 'ขณะนี้ระบบส่งรายงานขัดข้อง ทีมงานกำลังแก้ไขอย่างเร่งด่วน\nรายงานที่ส่งไม่สำเร็จจะเก็บไว้ในเครื่องและส่งให้อัตโนมัติเมื่อระบบกลับมา ไม่ต้องส่งซ้ำ' },
    { id: 'fixed', label: 'ระบบกลับมาใช้งานได้', kind: 'system', audience: 'all', push: false, days: 2,
        title: () => 'ระบบกลับมาใช้งานได้ตามปกติแล้ว',
        body: () => 'ระบบส่งรายงานกลับมาใช้งานได้ตามปกติแล้ว ขออภัยในความไม่สะดวก หากยังพบปัญหา แจ้งได้ที่ บัญชี › แจ้งปัญหาการใช้งาน' },
    { id: 'holiday', label: 'วันหยุด', kind: 'news', audience: 'participants', push: true, days: 3,
        title: d => `วันหยุด ${d} — ไม่ต้องส่งรายงาน`,
        body: d => `วันที่ ${d} เป็นวันหยุด ไม่ต้องส่งรายงานการขายประจำวัน\nกลับมาส่งรายงานตามปกติในวันทำการถัดไป` },
    { id: 'remind', label: 'เตือนส่งรายงาน', kind: 'news', audience: 'participants', push: true, days: 1,
        title: () => 'อย่าลืมส่งรายงานการขายวันนี้',
        body: () => 'ขอให้ผู้ใช้สิทธิ์ทุกท่านส่งรายงานการขายประจำวัน พร้อมรูปหลักฐานที่เห็นบัตร ล็อคที่ขาย และผู้ขาย ภายในเวลา 17:00 น.' },
    { id: 'rule', label: 'เปลี่ยนข้อปฏิบัติ', kind: 'news', audience: 'participants', push: true, days: 14,
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
        $('newsForm').addEventListener('submit', e => { e.preventDefault(); this.save(); });
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
        $('newsExpires').value = this.localInput(Date.now() + t.days * 86400000);
        $('newsTpls').querySelectorAll('[data-tpl]').forEach(b => b.classList.toggle('is-on', b.dataset.tpl === id));
        $('newsBody').focus();
    },
    setAud(v) { $('newsAudience').querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === v))); },
    aud() { const b = $('newsAudience').querySelector('[aria-checked="true"]'); return b ? b.dataset.v : 'all'; },

    async load(silent) {
        const req = ++this.req;
        if (!silent && !this.list.length) $('newsList').innerHTML = '<div class="skel" style="height:120px;border-radius:16px"></div>';
        const r = await api('admin.news.list');
        if (req !== this.req) return;
        if (!r.success) { $('newsList').innerHTML = emptyState(r.message || 'โหลดไม่สำเร็จ', 'wifi-off'); return; }
        this.list = r.news;
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
              <div class="news-meta"><span class="badge ${a[1]}">${a[0]}</span>${n.kind === 'system' ? '<span class="badge is-bad">ระบบ</span>' : ''}${expired ? '<span class="badge">หมดอายุแล้ว</span>' : n.expiresAt ? `<span class="muted-text">ถึง ${thDateTime(n.expiresAt)}</span>` : ''}${n.pushed ? `<span class="muted-text">แจ้งเตือนมือถือ ${fmtNum(n.pushed)} เครื่อง</span>` : ''}</div>
              <b class="news-title">${esc(n.title)}</b>
              <p class="news-body">${esc(n.body)}</p>
              ${n.image ? `<img class="news-img" src="${esc(n.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
              ${n.link ? `<a class="news-link" href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.link)}</a>` : ''}
              <div class="news-foot"><small class="muted-text">${esc(n.by || '-')} · ${thDateTime(n.ts)}${n.updatedAt && n.updatedAt - n.ts > 60000 ? ' · แก้ไขแล้ว' : ''}</small>
                <span class="sv-actions"><button type="button" class="btn-chip" data-na="edit">${icon('edit', 'ic-16')} แก้ไข</button><button type="button" class="btn-chip btn-chip-bad" data-na="delete">${icon('trash', 'ic-16')} ลบ</button></span></div>
            </article>`;
        }).join('');
    },
    async onClick(e) {
        const b = e.target.closest('[data-na]'); if (!b) return;
        if (b.dataset.na === 'new') return this.openEditor(null);
        const n = this.list.find(x => x.id === b.closest('[data-id]').dataset.id); if (!n) return;
        if (b.dataset.na === 'edit') return this.openEditor(n);
        if (b.dataset.na === 'delete') {
            if (!await showMessage({ title: 'ลบประกาศ?', text: `"${n.title}" จะหายจากกล่องการแจ้งเตือนของทุกคน`, tone: 'bad', okText: 'ลบ', cancelText: 'ยกเลิก' })) return;
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
        $('newsTpls').querySelectorAll('[data-tpl]').forEach(b => b.classList.remove('is-on'));
        $('newsSave').textContent = n ? 'บันทึก' : 'ประกาศ';
        showModal('newsModal');
        setTimeout(() => $('newsTitle').focus(), 50);
    },
    async save() {
        const title = $('newsTitle').value.trim(), body = $('newsBody').value.trim(), link = $('newsLink').value.trim();
        if (!title) { $('newsTitle').focus(); return showMessage({ title: 'ยังไม่มีหัวข้อ', text: 'กรุณาใส่หัวข้อประกาศ', tone: 'warn' }); }
        if (!body) { $('newsBody').focus(); return showMessage({ title: 'ยังไม่มีข้อความ', text: 'กรุณาใส่รายละเอียดประกาศ', tone: 'warn' }); }
        if (link && !/^https:\/\/\S+$/i.test(link)) return showMessage({ title: 'ลิงก์ไม่ถูกต้อง', text: 'ลิงก์ต้องขึ้นต้นด้วย https://', tone: 'warn' });
        const expiresAt = $('newsExpires').value ? new Date($('newsExpires').value).getTime() : null;
        if (expiresAt && expiresAt <= Date.now()) return showMessage({ title: 'วันที่ผ่านไปแล้ว', text: '"แสดงถึง" ต้องเป็นเวลาในอนาคต', tone: 'warn' });
        $('newsSave').disabled = true;
        if (this.img) showLoading(true, 'กำลังอัปโหลดรูป…');
        const r = await api('admin.news.save', { id: this.edit ? this.edit.id : null, title, body, link, audience: this.aud(), kind: this.kind(), expiresAt, push: $('newsPush').checked,
            image: this.img ? { data: this.img.data, mimeType: this.img.mimeType } : null, removeImage: this.imgRemove });
        showLoading(false);
        $('newsSave').disabled = false;
        if (!r.success) return showMessage({ title: 'บันทึกไม่สำเร็จ', text: r.message || 'กรุณาลองใหม่', tone: 'bad' });
        $('newsModal').close();
        toast(r.pushed ? `ประกาศแล้ว · แจ้งเตือนมือถือ ${fmtNum(r.pushed.sent || 0)} เครื่อง` : this.edit ? 'บันทึกแล้ว' : 'ประกาศแล้ว');
        this.load(true); Inbox.refresh(true);
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
        openSettings: () => openSettings(),
        show: () => switchTab('inbox'),
        manage: { label: 'เขียนประกาศ', show: () => can('admin'), open: () => { VIEWS.admin.tab = 'news'; switchTab('admin'); setTimeout(() => NewsAdmin.openEditor(null), 150); } },
        onAction: it => {
            if (!it.action) return;
            if (it.action.kind === 'admin' && can('admin')) { VIEWS.admin.tab = it.action.value; switchTab('admin'); }
            else if (it.action.kind === 'tab') switchTab(it.action.value);
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
