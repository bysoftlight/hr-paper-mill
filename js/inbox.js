// js/inbox.js — ปุ่มกระดิ่ง + กล่องการแจ้งเตือนในแอป (ใช้ร่วมกันหน้าผู้ใช้สิทธิ์และหน้าเจ้าหน้าที่)
//   Inbox.init({ app: 'user'|'staff', uid(), fetch() → Promise<{success, items}>, local() → items[], onAction(item), manage?: { label, show(), open() } })
//   Inbox.setServer(items) · Inbox.refresh(force) · Inbox.update() (คำนวณรายการในเครื่องใหม่) · Inbox.open()
// item = { id, ts, cat: 'usage'|'update'|'news', icon, tone?, title, body, link?, action?: { kind, value, label } }
// หน้าเว็บต้องมี #inboxView (#inboxTabs #inboxBody #inboxReadAll #inboxSettings [#inboxManage]) และส่ง show() ที่สลับไปแท็บนี้
// อ่านแล้ว/เปิดดูล่าสุด เก็บในเครื่อง (HRPM_INBOX_<app>_<uid>) และซิงก์กับระบบ (push/pullState) ให้ทุกอุปกรณ์ของบัญชีตรงกัน — กระดิ่งนับเฉพาะรายการใหม่หลังเปิดครั้งล่าสุด
const Inbox = (() => {
    // ประวัติการอัปเดตแอป (ใหม่สุดก่อน) — who: all | user | staff
    const CHANGELOG = [
        { v: '3.40.0', date: '2026-11-02', who: 'staff', title: 'สถิติการใช้งานแสดงผลถูกต้อง อัปเดตสด', body: 'หน้าสถิตินับผู้ใช้ เซสชัน และการดูหน้าได้ครบแล้ว (เดิมเป็น 0) · การ์ดเรียลไทม์อัปเดตทุก 15 วินาที · เพิ่มหน้าแพ็กเกจและราคา ดาวน์โหลดเป็น PDF/PNG หรือแชร์ลิงก์ได้' },
        { v: '3.39.0', date: '2026-11-02', who: 'all', title: 'สถานะอ่านแล้วตรงกันทุกเครื่อง', body: 'อ่านการแจ้งเตือนที่เครื่องไหน เครื่องอื่นที่เข้าสู่ระบบบัญชีเดียวกันก็แสดงว่าอ่านแล้วภายในไม่กี่วินาที · มือถือแนวนอนใช้แถบเมนูลอยแบบแนวตั้ง เลื่อนลงแล้วซ่อน' },
        { v: '3.38.0', date: '2026-11-01', who: 'all', title: 'แท็บแจ้งเตือนย้ายมาอยู่แถบเมนูด้านล่าง', body: 'แตะ "แจ้งเตือน" ก่อนแท็บบัญชีเพื่อดูการแจ้งเตือนทั้งหมด แท็บบัญชีแสดงรูปโปรไฟล์ และแตะโปรไฟล์ของคุณที่ไหนก็เปิดหน้าบัญชีได้' },
        { v: '3.37.0', date: '2026-11-01', who: 'user', title: 'แบบสอบถามแบบใหม่ ทำทีละข้อ', body: 'คำถามตัวใหญ่ขึ้น ปุ่มคะแนนกดง่าย เลือกแล้วไปข้อถัดไปเอง ย้อนกลับแก้คำตอบได้', vkey: 'user' },
        { v: '3.37.0', date: '2026-11-01', who: 'staff', title: 'ดูภาพรวมย้อนหลังได้', body: 'หน้าภาพรวมเลือก วันนี้ / เมื่อวาน / เลือกวันเองได้ ช่องวันที่แสดงแบบไทยและพอดีจอทุกเครื่อง', vkey: 'staff' },
        { v: '3.36.0', date: '2026-11-01', who: 'all', title: 'ใหม่: กล่องการแจ้งเตือน', body: 'ดูการแจ้งเตือนทั้งหมดในที่เดียว ทั้งการใช้งาน การอัปเดตแอป และข่าวสารจากผู้ดูแลระบบ' },
        { v: '3.36.0', date: '2026-11-01', who: 'staff', title: 'ผู้ดูแลระบบประกาศข่าวสารได้แล้ว', body: 'ผู้ดูแลระบบ › ประกาศ — เขียนประกาศถึงผู้ใช้สิทธิ์หรือเจ้าหน้าที่ และเลือกส่งแจ้งเตือนบนมือถือได้', vkey: 'staff' },
        { v: '3.35.0', date: '2026-11-01', who: 'all', title: 'แจ้งปัญหาการใช้งานได้ในแอป', body: 'เจอปัญหา แจ้งได้ที่ บัญชี › แจ้งปัญหาการใช้งาน แนบภาพหน้าจอได้ เรื่องจะส่งถึงผู้ดูแลระบบทันที' },
        { v: '3.35.0', date: '2026-11-01', who: 'user', title: 'แบบสอบถามความพึงพอใจ', body: 'ช่วยบอกความเห็นการใช้งานแอป ใช้เวลาไม่ถึง 1 นาที ทำหลังส่งรายงาน หรือทำภายหลังก็ได้', vkey: 'user' },
        { v: '3.34.0', date: '2026-10-31', who: 'all', title: 'แถบเมนูด้านล่างแบบใหม่', body: 'แตะค้างแล้วลากนิ้วเลือกเมนูได้ ตั้งค่าหัวแอปแบบกระจกและแสดงชื่อใต้ไอคอนได้ที่ ตั้งค่า' }
    ];
    const CATS = [['all', 'ทั้งหมด'], ['usage', 'การใช้งาน'], ['update', 'อัปเดตแอป'], ['news', 'ข่าวสาร']];
    const ICONS = {
        bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
        megaphone: '<path d="m3 11 15-6v14L3 13z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/><path d="M21 9v6"/>',
        sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
        edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
        trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
        user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
        'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>',
        clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>',
        send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
        x: '<path d="M18 6 6 18M6 6l12 12"/>',
        external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        check: '<path d="M20 6 9 17l-5-5"/>'
    };
    const svg = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ICONS.bell}</svg>`;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const el = id => document.getElementById(id);
    const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

    let O = null, server = [], serverAt = 0, filter = 'all', loading = null, expanded = new Set();

    function storeKey() { return 'HRPM_INBOX_' + O.app + '_' + (O.uid() || 'guest'); }
    function state() {
        let s = null;
        try { s = JSON.parse(ls.get(storeKey()) || 'null'); } catch (e) { s = null; }
        if (!s || typeof s !== 'object') {
            // ครั้งแรกในเครื่องนี้: ของย้อนหลังเกิน 7 วันถือว่าอ่านแล้ว (ไม่ให้กระดิ่งขึ้นเลขเยอะเกินจริง)
            s = { first: Date.now() - 7 * 86400000, seen: Date.now() - 7 * 86400000, read: [] };
            ls.set(storeKey(), JSON.stringify(s));
        }
        s.read = Array.isArray(s.read) ? s.read : [];
        return s;
    }
    function save(s) { s.read = s.read.slice(-300); ls.set(storeKey(), JSON.stringify(s)); }
    const isUnread = (it, s) => it.ts > s.first && s.read.indexOf(it.id) === -1;

    function updates() {
        return CHANGELOG.filter(u => u.who === 'all' || u.who === O.app).map(u => ({
            id: 'upd-' + u.v + '-' + (u.vkey || 'all'), ts: Math.min(Date.now() - 1000, new Date(u.date + 'T09:00:00+07:00').getTime()), cat: 'update', icon: 'sparkle', tone: 'accent',
            title: u.title, body: u.body, ver: u.v
        }));
    }
    function items() {
        let loc = [];
        try { loc = (O.local && O.local()) || []; } catch (e) { loc = []; }
        const seen = new Set(), out = [];
        loc.concat(server, updates()).forEach(it => { if (it && it.id && !seen.has(it.id)) { seen.add(it.id); out.push(it); } });
        const now = Date.now();
        out.forEach(it => { if (it.ts > now) it.ts = now; }); // นาฬิกาเครื่อง/ระบบไม่ตรงกัน: ไม่ให้รายการ "อนาคต" ค้างเป็นของใหม่ตลอด
        return out.sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.ts - a.ts);
    }

    function relTime(ts) {
        const s = Math.round((Date.now() - ts) / 1000);
        if (s < 60) return 'เมื่อสักครู่';
        if (s < 3600) return Math.floor(s / 60) + ' นาที';
        if (s < 86400) return Math.floor(s / 3600) + ' ชั่วโมง';
        if (s < 86400 * 7) return Math.floor(s / 86400) + ' วัน';
        return new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
    }

    // ---------- กระดิ่ง ----------
    function badge() {
        if (!O) return;
        const s = state(), list = items();
        const n = list.filter(it => isUnread(it, s) && it.ts > s.seen).length;
        document.querySelectorAll('[data-inbox-badge]').forEach(b => { b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n); });
        document.querySelectorAll('[data-inbox]').forEach(b => b.setAttribute('aria-label', n ? `การแจ้งเตือน (${n} รายการใหม่)` : 'การแจ้งเตือน'));
        if (shown()) render();
    }

    // ---------- หน้าการแจ้งเตือน (แท็บ "แจ้งเตือน" ก่อนแท็บบัญชี แบบ Facebook) ----------
    let bound = false;
    const shown = () => { const v = el('inboxView'); return !!(v && !v.hidden); };
    function bind() {
        if (bound || !el('inboxView')) return;
        bound = true;
        if (typeof ScrollFade !== 'undefined') ScrollFade.watch(el('inboxTabs'));
        el('inboxTabs').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; filter = b.dataset.cat; render(); });
        el('inboxReadAll').addEventListener('click', () => { const s = state(), ids = []; items().forEach(it => { if (s.read.indexOf(it.id) === -1) { s.read.push(it.id); ids.push(it.id); } }); save(s); queue(ids); render(); badge(); });
        el('inboxBody').addEventListener('click', onClick);
        el('inboxBody').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('inbox-item')) { e.preventDefault(); e.target.click(); } });
        el('inboxSettings').addEventListener('click', () => { if (O.openSettings) O.openSettings(); });
        if (el('inboxManage')) el('inboxManage').addEventListener('click', () => { if (O.manage) O.manage.open(); });
    }

    function render() {
        const s = state(), list = items();
        const unread = c => list.filter(it => (c === 'all' || it.cat === c) && isUnread(it, s)).length;
        el('inboxTabs').innerHTML = CATS.map(([c, t]) => { const n = unread(c); return `<button type="button" role="tab" data-cat="${c}" aria-selected="${c === filter}">${t}${n ? `<span class="inbox-count">${n > 9 ? '9+' : n}</span>` : ''}</button>`; }).join('');
        el('inboxReadAll').disabled = !unread('all');
        if (typeof ScrollFade !== 'undefined') requestAnimationFrame(() => ScrollFade.update(el('inboxTabs')));
        const shown = list.filter(it => filter === 'all' || it.cat === filter);
        if (!shown.length) {
            el('inboxBody').innerHTML = `<div class="inbox-empty">${svg('bell')}<b>ยังไม่มีการแจ้งเตือน</b><span>${filter === 'news' ? 'ประกาศจากผู้ดูแลระบบจะแสดงที่นี่' : filter === 'update' ? 'เมื่อแอปมีฟีเจอร์ใหม่จะแจ้งที่นี่' : 'การแจ้งเตือนเกี่ยวกับรายงานและบัญชีของคุณจะแสดงที่นี่'}</span></div>`;
            return;
        }
        const neu = shown.filter(it => isUnread(it, s)), old = shown.filter(it => !isUnread(it, s));
        const card = it => {
            const un = isUnread(it, s), long = String(it.body || '').length > 140, open = expanded.has(it.id);
            return `<article class="inbox-item ${un ? 'is-unread' : ''} ${it.pin ? 'is-pin' : ''}" data-id="${esc(it.id)}" tabindex="0">
              <span class="inbox-ic tone-${esc(it.tone || it.cat)}">${svg(it.icon || (it.cat === 'news' ? 'megaphone' : it.cat === 'update' ? 'sparkle' : 'bell'))}</span>
              <div class="inbox-main">
                <div class="inbox-top"><b>${esc(it.title)}</b><time datetime="${new Date(it.ts).toISOString()}">${relTime(it.ts)}</time></div>
                ${it.body ? `<p class="${long && !open ? 'is-clamped' : ''}">${esc(it.body)}</p>` : ''}
                ${long ? `<button type="button" class="btn-text inbox-more" data-ia="more">${open ? 'ย่อ' : 'อ่านต่อ'}</button>` : ''}
                ${it.action || it.link || it.ver ? `<div class="inbox-actions">
                    ${it.action ? `<button type="button" class="btn-chip" data-ia="act">${esc(it.action.label || 'เปิด')}</button>` : ''}
                    ${it.link ? `<a class="btn-chip" data-ia="link" href="${esc(it.link)}" target="_blank" rel="noopener">เปิดลิงก์ ${svg('external', 'ic-16')}</a>` : ''}
                    ${it.ver ? `<span class="inbox-ver mono">v${esc(it.ver)}</span>` : ''}
                  </div>` : ''}
              </div>
              ${un ? '<span class="inbox-dot" aria-label="ยังไม่อ่าน"></span>' : ''}
            </article>`;
        };
        el('inboxBody').innerHTML = (neu.length ? `<h3 class="inbox-group">ใหม่</h3>${neu.map(card).join('')}` : '') + (old.length ? `<h3 class="inbox-group">${neu.length ? 'ก่อนหน้านี้' : 'ล่าสุด'}</h3>${old.map(card).join('')}` : '');
    }

    function markRead(id) { const s = state(); if (s.read.indexOf(id) === -1) { s.read.push(id); save(s); queue([id]); } }

    // ---------- ซิงก์สถานะอ่านแล้วข้ามอุปกรณ์ (Inbox.gs: inbox.read / inbox.state) ----------
    // อ่านที่เครื่องไหน → ส่งขึ้นระบบ (รวบเป็นชุดทุก 0.6 วิ) · ทุกเครื่องดึงสถานะทุก 20 วิ ขณะเปิดแอป และทันทีที่กลับมาที่แอป
    // รวมแบบไม่ถอยหลัง: read = รวมกัน · seen = ค่ามากสุด · first = ค่าน้อยสุด
    let pend = { read: new Set(), seen: 0 }, pushTimer = 0, pushing = false;
    function queue(ids, seen) {
        if (!O || !O.push || !O.uid()) return;
        (ids || []).forEach(x => pend.read.add(x));
        if (seen) pend.seen = Math.max(pend.seen, seen);
        clearTimeout(pushTimer);
        pushTimer = setTimeout(flushPush, 600);
    }
    async function flushPush() {
        if (pushing || !O || !O.uid() || (!pend.read.size && !pend.seen)) return;
        const uid = O.uid(), batch = { read: [...pend.read].slice(-300), seen: pend.seen, first: state().first };
        pend = { read: new Set(), seen: 0 };
        pushing = true;
        let r = null;
        try { r = await O.push(batch); } catch (e) { r = null; }
        pushing = false;
        if (O.uid() !== uid) return; // สลับบัญชีระหว่างรอ
        if (r && r.success && r.state) applyState(r.state);
        else if (!r || r.networkError) { batch.read.forEach(x => pend.read.add(x)); pend.seen = Math.max(pend.seen, batch.seen); pushTimer = setTimeout(flushPush, 15000); } // เน็ตหลุด: ลองใหม่
        // ระบบหลังบ้านยังไม่รองรับ (ยังไม่ได้วาง Inbox.gs รุ่นใหม่): เก็บไว้ในเครื่องอย่างเดียว ไม่ส่งซ้ำ
    }
    function applyState(st) {
        if (!st || !O || !O.uid()) return;
        const s = state(), have = new Set(s.read);
        let changed = false;
        (st.read || []).forEach(x => { if (!have.has(x)) { have.add(x); s.read.push(x); changed = true; } });
        if ((st.seen || 0) > s.seen) { s.seen = st.seen; changed = true; }
        if (st.first && st.first < s.first) { s.first = st.first; changed = true; }
        // เครื่องนี้มีที่ระบบยังไม่มี (เช่น อ่านตอนออฟไลน์) → ส่งขึ้นไปด้วย
        const srv = new Set(st.read || []), extra = s.read.filter(x => !srv.has(x));
        if (extra.length || s.seen > (st.seen || 0) || !st.at) queue(extra.slice(-300), s.seen > (st.seen || 0) ? s.seen : 0);
        if (changed) { save(s); if (shown()) render(); badge(); }
    }
    async function pullState() {
        if (!O || !O.uid() || !O.pullState || document.hidden) return;
        const uid = O.uid();
        try { const r = await O.pullState(); if (O.uid() === uid && r && r.success && r.state) applyState(r.state); } catch (e) { /* ลองรอบหน้า */ }
    }
    function onClick(e) {
        const art = e.target.closest('.inbox-item'); if (!art) return;
        const it = items().find(x => x.id === art.dataset.id); if (!it) return;
        const a = e.target.closest('[data-ia]');
        if (a && a.dataset.ia === 'more') { expanded.has(it.id) ? expanded.delete(it.id) : expanded.add(it.id); markRead(it.id); render(); badge(); return; }
        markRead(it.id);
        if (a && a.dataset.ia === 'link') { setTimeout(() => { render(); badge(); }, 0); return; } // ให้ลิงก์เปิดตามปกติ
        if ((a && a.dataset.ia === 'act') || (!a && it.action)) { badge(); if (O.onAction) O.onAction(it); return; }
        render(); badge();
    }

    // เปิดแท็บแจ้งเตือน (ปุ่ม/ลิงก์อื่นที่ต้องการพาไปหน้านี้)
    let pendingCat = null;
    function open(cat) { if (!O) return; pendingCat = cat || null; if (O.show) O.show(); }
    // เรียกตอนแท็บแจ้งเตือนแสดง: เลขบนกระดิ่งหาย (จุด "ยังไม่อ่าน" ยังอยู่) · ดึงรายการใหม่
    function onShow(cat) {
        if (!O) return;
        bind();
        filter = cat || pendingCat || 'all'; // เปิดแท็บใหม่ทุกครั้งเริ่มที่ "ทั้งหมด" (เว้นแต่ขอหมวดมา)
        pendingCat = null;
        const s = state(); s.seen = Date.now(); save(s); queue([], s.seen);
        if (el('inboxManage')) {
            el('inboxManage').hidden = !(O.manage && O.manage.show());
            if (O.manage) el('inboxManage').querySelector('span').textContent = O.manage.label;
        }
        render();
        badge();
        refresh(false).then(() => { if (shown()) { const s2 = state(); s2.seen = Date.now(); save(s2); queue([], s2.seen); badge(); } });
        try { if (window.Analytics) Analytics.track('inbox_open', { v: items().filter(it => isUnread(it, s)).length }); } catch (e) {}
    }

    function setServer(list, at) { server = Array.isArray(list) ? list.filter(x => x && x.id && x.ts) : []; serverAt = at || Date.now(); badge(); }
    async function refresh(force) {
        if (!O || !O.uid()) return Promise.resolve();
        if (loading) return loading;
        if (!force && Date.now() - serverAt < 60000) return Promise.resolve();
        loading = (async () => {
            try { const r = await O.fetch(); if (r && r.success) { setServer(r.items, Date.now()); if (r.state) applyState(r.state); } } catch (e) { /* ใช้ของเดิม */ }
            finally { loading = null; }
        })();
        return loading;
    }
    function reset() { server = []; serverAt = 0; expanded.clear(); filter = 'all'; clearTimeout(pushTimer); pend = { read: new Set(), seen: 0 }; badge(); }

    function init(opts) {
        O = opts;
        bind();
        document.addEventListener('click', e => { if (e.target.closest('[data-inbox]')) { if (typeof haptic === 'function') haptic(); open(); } });
        // กลับมาที่แอป: ดึงสถานะ + รายการใหม่ · เปิดค้าง: สถานะอ่านแล้วทุก 20 วิ รายการใหม่ทุก 2 นาที · ปิดแอป: ส่งที่ค้างทันที
        document.addEventListener('visibilitychange', () => { if (!document.hidden) { badge(); pullState(); refresh(false); } else flushPush(); });
        setInterval(pullState, O.stateEvery || 20000);
        setInterval(() => { if (!document.hidden) refresh(true); }, 2 * 60000);
        // แท็บอื่นในเบราว์เซอร์เดียวกัน: อัปเดตทันที
        window.addEventListener('storage', e => { if (O.uid() && e.key === storeKey()) { if (shown()) render(); badge(); } });
        badge();
    }
    return { init, open, onShow, setServer, setState: applyState, pullState, refresh, update: badge, reset, items, CHANGELOG };
})();
