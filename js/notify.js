// js/notify.js — การแจ้งเตือนบนเครื่องนี้ (Web Push) + ส่วน "การแจ้งเตือน" ในหน้าตั้งค่า
// ใช้ร่วมกันทั้งหน้าผู้ใช้สิทธิ์ (kind = 'user') และหน้า Staff (kind = 'staff')
//
// ข้อจำกัดของเบราว์เซอร์
//   - Android (Chrome/Edge/Samsung) และคอมพิวเตอร์: ได้รับแจ้งเตือนแม้ปิดเว็บอยู่
//   - iPhone/iPad (iOS 16.4+): ต้อง "เพิ่มไปยังหน้าจอโฮม" แล้วเปิดจากไอคอนก่อน จึงเปิดการแจ้งเตือนได้

const NotifyUI = {
    kind: 'user',
    call: null,      // (action, data) => Promise<res>
    extra: () => ({}),
    state: null,     // { support, endpoint, config, busy, message }

    platform() {
        const ua = navigator.userAgent;
        const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        return {
            ios,
            android: /Android/i.test(ua),
            standalone: (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true,
            label: ios ? (/iPad/.test(ua) || !/iPhone|iPod/.test(ua) ? 'iPad' : 'iPhone') : /Android/i.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'อุปกรณ์อื่น'
        };
    },

    support() {
        const p = this.platform();
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
            return p.ios && !p.standalone ? 'ios-install' : 'unsupported';
        }
        if (Notification.permission === 'denied') return 'denied';
        return 'ok';
    },

    action(name) { return (this.kind === 'staff' ? 'staff.notify.' : 'notify.') + name; },

    async currentSub() {
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            return reg ? await reg.pushManager.getSubscription() : null;
        } catch (e) { return null; }
    },

    // ตรวจสถานะล่าสุด (เรียกตอนเปิดหน้าตั้งค่า)
    async refresh() {
        const support = this.support();
        const sub = support === 'ok' || support === 'denied' ? await this.currentSub() : null;
        const config = await this.call(this.action('config'), Object.assign({ endpoint: sub ? sub.endpoint : '' }, this.extra()));
        this.state = { support, endpoint: sub ? sub.endpoint : '', config: config.success ? config : null, error: config.success ? '' : (config.message || 'ตรวจสอบสถานะไม่สำเร็จ') };
        // เครื่องมี subscription แต่ระบบไม่รู้จัก (เช่น ถูกลบเพราะส่งไม่สำเร็จ) → ถือว่ายังไม่เปิด
        return this.state;
    },

    async enable(topics) {
        if (Notification.permission !== 'granted') {
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') return { success: false, message: perm === 'denied' ? 'denied' : 'ยังไม่ได้อนุญาตการแจ้งเตือน' };
        }
        const cfg = this.state && this.state.config;
        if (!cfg || !cfg.publicKey) return { success: false, message: 'ระบบแจ้งเตือนยังไม่พร้อม' };
        let sub;
        try {
            await navigator.serviceWorker.register('sw.js?v=3.16.0');
            const reg = await navigator.serviceWorker.ready;
            sub = await reg.pushManager.getSubscription();
            // กุญแจของระบบเปลี่ยน → ต้องสมัครใหม่
            if (sub && sub.options && sub.options.applicationServerKey && b64urlFromBuffer(sub.options.applicationServerKey) !== cfg.publicKey) { await sub.unsubscribe(); sub = null; }
            if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bufferFromB64url(cfg.publicKey) });
        } catch (e) {
            return { success: false, message: 'เปิดการแจ้งเตือนบนเครื่องนี้ไม่สำเร็จ (' + (e && e.message ? e.message : e) + ')' };
        }
        const res = await this.call(this.action('subscribe'), Object.assign({ endpoint: sub.endpoint, topics, device: this.platform().label }, this.extra()));
        if (res.success) { this.state.endpoint = sub.endpoint; this.state.config.device = { topics: res.topics }; }
        return res;
    },

    async disable() {
        const sub = await this.currentSub();
        if (sub) {
            await this.call(this.action('unsubscribe'), Object.assign({ endpoint: sub.endpoint }, this.extra()));
            try { await sub.unsubscribe(); } catch (e) {}
        }
        if (this.state && this.state.config) this.state.config.device = null;
        return { success: true };
    },

    async test() {
        return this.call(this.action('test'), Object.assign({ endpoint: this.state.endpoint }, this.extra()));
    },

    // ---------- ส่วน "การแจ้งเตือน" ในหน้าตั้งค่า ----------
    async mount(el) {
        this.el = el;
        renderSettings(el, [{ title: 'การแจ้งเตือน', rows: [{ icon: 'bell', tone: 'red', label: 'การแจ้งเตือน', desc: 'กำลังตรวจสอบ…' }] }]);
        await this.refresh();
        this.render();
    },

    render(note) {
        const st = this.state, cfg = st.config, el = this.el;
        if (!el || !el.isConnected) return;
        const device = cfg && cfg.device;
        const on = !!device;
        const rows = [];
        const help = this.helpHtml(st.support, note);
        const blocked = st.support !== 'ok' || !cfg;
        const remindAt = cfg ? `${cfg.remindHour}:00 น.` : '17:00 น.';
        if (this.kind === 'user') {
            rows.push({ id: 'nfRemind', icon: 'bell', tone: 'red', label: 'เตือนเมื่อยังไม่ได้ส่งรายงาน', desc: `เด้งเตือนบนเครื่องนี้ทุกวันเวลา ${remindAt} ถ้ายังไม่ได้ส่ง`, control: { type: 'toggle', checked: on, disabled: blocked && !on, onChange: v => this.toggle(v, ['remind']) } });
        } else {
            rows.push({ id: 'nfDevice', icon: 'bell', tone: 'red', label: 'แจ้งเตือนบนเครื่องนี้', desc: 'เด้งเตือนแม้ไม่ได้เปิดหน้าเว็บ', control: { type: 'toggle', checked: on, disabled: blocked && !on, onChange: v => this.toggle(v, ['new', 'summary']) } });
            if (on) {
                const has = t => device.topics.indexOf(t) !== -1;
                rows.push({ id: 'nfNew', icon: 'inbox', tone: 'blue', label: 'รายงานใหม่', desc: 'ทันทีที่ผู้ใช้สิทธิ์ส่งรายงาน', control: { type: 'toggle', checked: has('new'), onChange: v => this.setTopic('new', v) } });
                rows.push({ id: 'nfSummary', icon: 'calendar', tone: 'purple', label: 'สรุปประจำวัน', desc: `ทุกวัน ${cfg.summaryHour}:00 น. · ส่งแล้ว/ยังไม่ส่ง`, control: { type: 'toggle', checked: has('summary'), onChange: v => this.setTopic('summary', v) } });
            }
            const email = cfg && cfg.email;
            rows.push({ id: 'nfEmail', icon: 'mail', tone: 'green', label: 'สรุปประจำวันทางอีเมล', desc: email ? `ส่งไปที่ ${settingsEsc(email)} ทุกวัน ${cfg.summaryHour}:00 น.` : 'บัญชีที่เข้าสู่ระบบด้วย LINE ไม่มีอีเมล', control: { type: 'toggle', checked: !!(cfg && cfg.emailTopics && cfg.emailTopics.length), disabled: !email, onChange: v => this.setEmail(v) } });
        }
        if (help || on) {
            rows.push({ id: 'nfInfo', icon: 'info', tone: 'gray', label: on ? 'เปิดอยู่บนเครื่องนี้' : 'วิธีเปิดการแจ้งเตือน', desc: '', control: { type: 'info', html: (help || '') + (on ? '<div class="row-actions"><button type="button" class="btn-chip" id="nfTest">ส่งการแจ้งเตือนทดสอบ</button></div>' : '') } });
        }
        renderSettings(el, [{ title: 'การแจ้งเตือน', rows }]);
        const t = el.querySelector('#nfTest');
        if (t) t.addEventListener('click', () => this.runTest(t));
    },

    helpHtml(support, note) {
        const p = this.platform();
        const parts = [];
        if (note) parts.push(`<span class="set-status ${note.tone ? 'is-' + note.tone : ''}">${settingsEsc(note.text)}</span>`);
        if (this.state && !this.state.config) parts.push(`<span class="set-status is-bad">${settingsEsc(this.state.error)}</span>`);
        if (support === 'ios-install') {
            parts.push('<span><b>iPhone/iPad ต้องติดตั้งเว็บเป็นแอปก่อน</b> (iOS 16.4 ขึ้นไป)</span><ol class="set-steps"><li>เปิดหน้านี้ใน <b>Safari</b></li><li>แตะปุ่ม <b>แชร์</b> (สี่เหลี่ยมมีลูกศรขึ้น)</li><li>เลือก <b>เพิ่มไปยังหน้าจอโฮม</b></li><li>เปิดแอปจากไอคอนบนหน้าจอโฮม แล้วกลับมาเปิดการแจ้งเตือนที่หน้านี้</li></ol>');
        } else if (support === 'unsupported') {
            parts.push('<span>เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน กรุณาใช้ Chrome, Edge หรือ Safari รุ่นล่าสุด</span>');
        } else if (support === 'denied') {
            parts.push(`<span class="set-status is-bad">การแจ้งเตือนถูกปิดในเบราว์เซอร์</span><span>${p.ios ? 'การตั้งค่าของเครื่อง › การแจ้งเตือน › HR Paper Mill › อนุญาตการแจ้งเตือน' : p.android ? 'แตะรูปแม่กุญแจข้างที่อยู่เว็บ › สิทธิ์ › การแจ้งเตือน › อนุญาต แล้วกลับมาเปิดที่นี่' : 'คลิกรูปแม่กุญแจข้างที่อยู่เว็บ › การแจ้งเตือน › อนุญาต แล้วโหลดหน้าใหม่'}</span>`);
        } else if (p.ios && this.state && this.state.config && this.state.config.device) {
            parts.push('<span>ถ้าลบไอคอนแอปออกจากหน้าจอโฮม การแจ้งเตือนจะหยุด</span>');
        }
        return parts.join('');
    },

    async toggle(on, topics) {
        this.setBusy(true);
        let res;
        if (on) {
            res = await this.enable(topics);
            if (!res.success && res.message === 'denied') this.state.support = 'denied';
        } else {
            res = await this.disable();
        }
        this.setBusy(false);
        this.render(res.success ? (on ? { tone: 'ok', text: 'เปิดการแจ้งเตือนแล้ว' } : { text: 'ปิดการแจ้งเตือนบนเครื่องนี้แล้ว' }) : res.message === 'denied' ? null : { tone: 'bad', text: res.message || 'ทำรายการไม่สำเร็จ' });
    },

    async setTopic(topic, on) {
        const cur = (this.state.config.device && this.state.config.device.topics) || [];
        const topics = on ? cur.concat(topic).filter((t, i, a) => a.indexOf(t) === i) : cur.filter(t => t !== topic);
        if (!topics.length) return this.toggle(false);
        this.setBusy(true);
        const res = await this.call(this.action('subscribe'), Object.assign({ endpoint: this.state.endpoint, topics, device: this.platform().label }, this.extra()));
        this.setBusy(false);
        if (res.success) this.state.config.device = { topics: res.topics };
        this.render(res.success ? null : { tone: 'bad', text: res.message || 'บันทึกไม่สำเร็จ' });
    },

    async setEmail(on) {
        this.setBusy(true);
        const res = await this.call('staff.notify.email', { topics: on ? ['summary'] : [] });
        this.setBusy(false);
        if (res.success) this.state.config.emailTopics = res.emailTopics;
        this.render(res.success ? { tone: on ? 'ok' : '', text: on ? 'จะส่งสรุปทางอีเมลทุกวัน' : 'ยกเลิกอีเมลสรุปแล้ว' } : { tone: 'bad', text: res.message || 'บันทึกไม่สำเร็จ' });
    },

    async runTest(btn) {
        btn.disabled = true;
        btn.textContent = 'กำลังส่ง…';
        const res = await this.test();
        this.render(res.success ? { tone: 'ok', text: 'ส่งแล้ว — ควรเห็นการแจ้งเตือนภายในไม่กี่วินาที' } : { tone: 'bad', text: res.message || 'ส่งไม่สำเร็จ' });
    },

    setBusy(busy) {
        if (this.el) this.el.querySelectorAll('input, button').forEach(i => { i.disabled = busy || i.disabled; });
        if (this.el) this.el.setAttribute('aria-busy', String(busy));
    }
};

function bufferFromB64url(s) {
    const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    return Uint8Array.from(b, c => c.charCodeAt(0));
}
function b64urlFromBuffer(buf) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
