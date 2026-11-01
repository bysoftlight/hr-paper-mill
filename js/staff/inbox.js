// js/staff/inbox.js — หน้าเจ้าหน้าที่: กล่องการแจ้งเตือน (กระดิ่ง) + ผู้ดูแลระบบ › ประกาศ
// API: staff.inbox.list · admin.news.list / save / delete (Inbox.gs) · กล่องกลางอยู่ใน js/inbox.js

const NEWS_AUD = { all: ['ทุกคน', 'is-accent'], participants: ['ผู้ใช้สิทธิ์', 'is-ok'], staff: ['เจ้าหน้าที่', 'is-warn'] };

const NewsAdmin = {
    list: [], req: 0, edit: null,

    init() {
        $('newsNew').addEventListener('click', () => this.openEditor(null));
        $('newsList').addEventListener('click', e => this.onClick(e));
        $('newsAudience').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) this.setAud(b.dataset.v); });
        $('newsBody').addEventListener('input', () => { $('newsCount').textContent = $('newsBody').value.length + '/1500'; });
        $('newsForm').addEventListener('submit', e => { e.preventDefault(); this.save(); });
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
              <div class="news-meta"><span class="badge ${a[1]}">${a[0]}</span>${expired ? '<span class="badge">หมดอายุแล้ว</span>' : n.expiresAt ? `<span class="muted-text">ถึง ${thDateTime(n.expiresAt)}</span>` : ''}${n.pushed ? `<span class="muted-text">แจ้งเตือนมือถือ ${fmtNum(n.pushed)} เครื่อง</span>` : ''}</div>
              <b class="news-title">${esc(n.title)}</b>
              <p class="news-body">${esc(n.body)}</p>
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
        const r = await api('admin.news.save', { id: this.edit ? this.edit.id : null, title, body, link, audience: this.aud(), expiresAt, push: $('newsPush').checked });
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
        openSettings: () => openSettings(),
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
    if (location.hash === '#inbox') setTimeout(() => { if (ST.me) Inbox.open(); }, 1800);
});
