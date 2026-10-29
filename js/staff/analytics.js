// js/staff/analytics.js — สถิติการใช้งาน (คล้าย Google Analytics) สำหรับผู้ดูแลระบบ
// ข้อมูลจาก staff.analytics.report (Analytics.gs) · รายงานเป็นภาพรวม (รายบุคคลดูในชีต Analytics)

const AN_APPS = { user: 'ผู้ใช้สิทธิ์', staff: 'Staff', quote: 'ใบเสนอราคา' };
const AN_PAGES = {
    'user:login': 'เข้าสู่ระบบ', 'user:form': 'ส่งรายงาน', 'user:history': 'ประวัติ', 'user:account': 'บัญชี',
    'staff:overview': 'ภาพรวม', 'staff:records': 'รายงาน', 'staff:participants': 'ผู้ใช้สิทธิ์', 'staff:analytics': 'สถิติ', 'staff:admin': 'ผู้ดูแลระบบ', 'staff:account': 'บัญชี',
    'quote:edit': 'แก้ไขใบเสนอราคา', 'quote:preview': 'ตัวอย่าง A4', 'quote:saved': 'ใบที่บันทึก'
};
const AN_EVENTS = {
    page_view: 'เปิดหน้า', first_visit: 'เข้าใช้ครั้งแรก', login: 'เข้าสู่ระบบ', login_fail: 'เข้าสู่ระบบไม่สำเร็จ',
    location_ok: 'ระบุตำแหน่งสำเร็จ', location_fail: 'ระบุตำแหน่งไม่สำเร็จ', type_select: 'เลือกประเภทการขาย', photo_ok: 'ถ่าย/เลือกภาพแล้ว', camera_error: 'เปิดกล้องไม่ได้',
    submit: 'กดบันทึกรายงาน', submit_success: 'ส่งรายงานสำเร็จ', submit_fail: 'ส่งรายงานไม่สำเร็จ', submit_queued: 'เก็บไว้ในเครื่อง (ออฟไลน์)', submit_blocked: 'กดบันทึกแต่ยังไม่ครบ',
    outbox_sent: 'ส่งรายงานที่ค้างไว้', outbox_rejected: 'รายงานที่ค้างส่งไม่ผ่าน', calendar_nav: 'เปลี่ยนเดือนในปฏิทิน', history_filter: 'เปลี่ยนช่วงประวัติ',
    onboarding_close: 'ปิดแนะนำการใช้งาน', setting_change: 'เปลี่ยนการตั้งค่า', js_error: 'ข้อผิดพลาดในหน้าเว็บ',
    kpi_drill: 'แตะการ์ดภาพรวม', record_save: 'เพิ่ม/แก้รายงาน', record_delete: 'ลบรายงาน', record_restore: 'กู้คืนรายงาน',
    participant_save: 'บันทึกผู้ใช้สิทธิ์', participant_delete: 'ลบผู้ใช้สิทธิ์', contact_add: 'บันทึกการติดต่อ',
    export: 'ส่งออกไฟล์', report_view: 'เปิดรายงานสำเร็จรูป', report_email: 'ส่งรายงานทางอีเมล',
    template_apply: 'ใช้แพ็กเกจ', print: 'พิมพ์ / PDF', quote_new: 'สร้างใบใหม่', quote_copy: 'ทำสำเนา', data_export: 'ดาวน์โหลดข้อมูล', data_import: 'เปิดไฟล์ข้อมูล', theme: 'เปลี่ยนธีม'
};
const anEvent = e => AN_EVENTS[e] || AN_EVENTS[e.replace(/_fail$/, '')] && AN_EVENTS[e.replace(/_fail$/, '')] + ' (ไม่สำเร็จ)' || e;
const anPage = (app, p) => AN_PAGES[app + ':' + p] || p || '-';
const anDur = s => s >= 3600 ? `${Math.floor(s / 3600)} ชม. ${Math.round(s % 3600 / 60)} น.` : s >= 60 ? `${Math.floor(s / 60)} น. ${s % 60} วิ` : `${s} วิ`;

VIEWS.analytics = {
    app: 'all', days: 7, metric: 'users', data: null, counts: {},

    init() {
        const seg = (id, attr, fn) => $(id).addEventListener('click', e => {
            const b = e.target.closest('button[' + attr + ']'); if (!b) return;
            $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
            haptic(); fn(b.getAttribute(attr));
        });
        seg('anApp', 'data-app', v => { this.app = v; this.load(); });
        seg('anRange', 'data-days', v => { this.days = Number(v); this.load(); });
        seg('anMetric', 'data-m', v => { this.metric = v; this.renderTrend(); });
        $('anRefresh').addEventListener('click', () => this.load(true));
    },
    show() { this.load(); this.startRealtime(); },
    reset() { this.data = null; this.counts = {}; this.stopRealtime(); },

    // เรียลไทม์: รีเฟรชทุก 60 วินาทีขณะเปิดแท็บนี้อยู่
    startRealtime() {
        this.stopRealtime();
        this.rt = setInterval(() => { if (ST.view !== 'analytics') return this.stopRealtime(); if (!document.hidden) this.load(false, true); }, 60000); // ระบบเก็บผลไว้ 60 วินาที
    },
    stopRealtime() { clearInterval(this.rt); this.rt = 0; },

    async load(fresh, quiet) {
        const key = this.app + ':' + this.days;
        if (!quiet && (!this.data || this.dataKey !== key)) this.skeleton();
        if (fresh && !quiet) $('anRefresh').disabled = true;
        // ส่งเหตุการณ์ที่ค้างในเครื่องนี้ก่อน (ไม่เกิน 1.5 วินาที) ให้เห็นการใช้งานล่าสุดของตัวเองด้วย
        await Promise.race([Analytics.flush(), new Promise(r => setTimeout(r, 1500))]).catch(() => {});
        const r = await api('staff.analytics.report', { app: this.app, days: this.days, fresh: !!fresh || !this.data });
        $('anRefresh').disabled = false;
        if (key !== this.app + ':' + this.days) return; // เปลี่ยนตัวกรองไปแล้วระหว่างรอ
        if (!r.success) {
            if (!quiet) $('anKpis').innerHTML = `<div class="card empty" style="grid-column:1/-1">${icon('alert')}${esc(r.message || 'โหลดสถิติไม่สำเร็จ')}</div>`;
            return;
        }
        this.data = r; this.dataKey = key;
        this.render();
        if (fresh && !quiet) toast('อัปเดตสถิติแล้ว');
    },

    skeleton() {
        $('anKpis').innerHTML = Array.from({ length: 6 }, () =>
            '<div class="kpi" aria-hidden="true"><span class="skel skel-text" style="width:60%"></span><span class="skel" style="height:30px;width:45%;margin:6px 0"></span><span class="skel skel-sm" style="width:40%"></span></div>').join('');
    },

    render() {
        const d = this.data, t = d.totals, p = d.previous;
        const range = d.days === 1 ? 'วันนี้' : `${thDate(d.from, { day: 'numeric', month: 'short' })} – ${thDate(d.to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
        $('anSub').textContent = `${range} · ${d.app === 'all' ? 'ทุกแอป' : AN_APPS[d.app]} · อัปเดต ${thTime(d.generatedAt)} น.`;
        const delta = (a, b) => {
            if (!b) return a ? '<span class="delta is-up">ใหม่</span>' : '';
            const x = Math.round((a - b) / b * 100);
            return `<span class="delta ${x >= 0 ? 'is-up' : 'is-down'}" title="เทียบกับช่วงก่อนหน้า (${fmtNum(b)})">${x >= 0 ? '▲' : '▼'} ${Math.abs(x)}%</span>`;
        };
        const kpi = (label, key, value, prev, sub, unit = '') => `<div class="kpi"><small>${label}</small><b>${cnum(value, key)}${unit ? `<span class="of">${unit}</span>` : ''}</b><span class="kpi-foot">${delta(value, prev)}${sub ? `<span>${sub}</span>` : ''}</span></div>`;
        $('anKpis').innerHTML =
            kpi('ผู้ใช้', 'users', t.users, p.users, `ผู้ใช้ใหม่ ${fmtNum(t.newUsers)}`) +
            kpi('เซสชัน', 'sessions', t.sessions, p.sessions, `${t.viewsPerSession} หน้า/เซสชัน`) +
            kpi('การดูหน้า', 'views', t.views, p.views, '') +
            `<div class="kpi"><small>เวลาเฉลี่ยต่อเซสชัน</small><b class="kpi-dur">${anDur(t.avgSession)}</b><span class="kpi-foot">${delta(t.avgSession, p.avgSession)}</span></div>` +
            kpi('อัตราการมีส่วนร่วม', 'eng', t.engagementRate, p.engagementRate, 'ใช้งาน ≥10 วิ หรือ ≥2 หน้า', '%') +
            kpi('ส่งรายงานสำเร็จ', 'conv', d.outcomes.submitSuccess, null, d.outcomes.submitFail ? `<b class="text-bad">ไม่สำเร็จ ${fmtNum(d.outcomes.submitFail)}</b>` : 'ไม่มีส่งไม่สำเร็จ');
        Counting.scan($('anKpis'), this.counts);
        this.renderTrend(); this.renderRealtime(); this.renderFunnel(); this.renderPages(); this.renderEvents(); this.renderTech(); this.renderHeat();
    },

    renderTrend() {
        const d = this.data; if (!d) return;
        const m = this.metric, rows = d.daily, names = { users: 'ผู้ใช้', sessions: 'เซสชัน', views: 'การดูหน้า' };
        const labels = rows.map(x => thDate(x.date, { day: 'numeric', month: 'short' }));
        const n = rows.length;
        if (n <= 1) {
            $('anTrend').innerHTML = `<div class="an-single"><b>${fmtNum(rows[0] ? rows[0][m] : 0)}</b><span>${names[m]}วันนี้ · เลือก 7 วันขึ้นไปเพื่อดูแนวโน้ม</span></div>`;
            $('anTrendLegend').innerHTML = '';
            return;
        }
        Charts.area($('anTrend'), {
            labels, height: 220, active: n - 1, ariaLabel: `กราฟ${names[m]}รายวัน`,
            xLabels: [0, Math.floor((n - 1) / 2), n - 1],
            series: [{ label: names[m], values: rows.map(x => x[m]), color: Charts.color('--accent') }],
            tooltip: i => `<small>${thDate(rows[i].date, { weekday: 'short', day: 'numeric', month: 'short' })}</small><b>${fmtNum(rows[i][m])} ${names[m]}</b><div class="tip-row">ผู้ใช้ ${fmtNum(rows[i].users)} · เซสชัน ${fmtNum(rows[i].sessions)} · ดูหน้า ${fmtNum(rows[i].views)}</div>`
        });
        const sum = rows.reduce((a, x) => a + x[m], 0), peak = rows.reduce((a, x) => (x[m] > a[m] ? x : a), rows[0]);
        $('anTrendLegend').innerHTML = `<span class="muted-text">รวม ${fmtNum(sum)} · เฉลี่ย ${fmtNum(Math.round(sum / n * 10) / 10)}/วัน · สูงสุด ${fmtNum(peak[m])} (${thDate(peak.date, { day: 'numeric', month: 'short' })})</span>`;
    },

    renderRealtime() {
        const r = this.data.realtime;
        Counting.to($('anActive'), r.active);
        Charts.bars($('anRtBars'), {
            labels: r.perMinute.map((_, i) => String(29 - i)), height: 90, ariaLabel: 'ผู้ใช้แต่ละนาทีใน 30 นาทีล่าสุด',
            xLabels: [0, 29], series: [{ label: 'ผู้ใช้', values: r.perMinute, color: Charts.color('--accent') }],
            tooltip: i => `<small>${29 - i === 0 ? 'นาทีนี้' : (29 - i) + ' นาทีก่อน'}</small><b>${r.perMinute[i]} ผู้ใช้</b>`
        });
        $('anRtPages').innerHTML = r.pages.length
            ? r.pages.map(x => { const [app, page] = x.key.split(':'); return `<li><span>${esc(anPage(app, page))} <small>${esc(AN_APPS[app] || app)}</small></span><b>${fmtNum(x.views)}</b></li>`; }).join('')
            : `<li class="muted-text">ไม่มีการเปิดหน้าใน 5 นาทีล่าสุด · ${fmtNum(r.users30)} ผู้ใช้ใน 30 นาที</li>`;
    },

    renderFunnel() {
        const d = this.data, show = d.app === 'all' || d.app === 'user';
        $('anFunnelCard').hidden = !show;
        if (!show) return;
        const f = d.funnel, top = Math.max(1, f[0].sessions);
        $('anFunnel').innerHTML = f.map((s, i) => {
            const pct = Math.round(s.sessions / top * 100), prev = i ? f[i - 1].sessions : 0;
            const drop = i && prev ? Math.round((prev - s.sessions) / prev * 100) : 0;
            return `<li><div class="funnel-top"><span><b>${i + 1}</b>${esc(s.label)}</span><span class="mono">${fmtNum(s.sessions)}${i ? ` <small>${pct}%</small>` : ''}</span></div>
              <div class="funnel-bar"><i style="width:${s.sessions ? Math.max(2, pct) : 0}%"></i></div>${drop > 0 ? `<small class="funnel-drop">หลุด ${drop}% จากขั้นก่อน</small>` : ''}</li>`;
        }).join('');
        const o = d.outcomes;
        $('anOutcomes').innerHTML = `
          <div class="an-out"><span class="badge is-ok">${icon('check')}สำเร็จ ${fmtNum(o.submitSuccess)}</span><span class="badge ${o.submitFail ? 'is-bad' : ''}">ไม่สำเร็จ ${fmtNum(o.submitFail)}</span><span class="badge">เก็บในเครื่อง ${fmtNum(o.queued)}</span>${o.loginFail ? `<span class="badge is-warn">เข้าสู่ระบบไม่สำเร็จ ${fmtNum(o.loginFail)}</span>` : ''}${o.errors ? `<span class="badge is-warn">ข้อผิดพลาดหน้าเว็บ ${fmtNum(o.errors)}</span>` : ''}</div>
          ${o.failReasons.length ? `<p class="muted-text">สาเหตุที่ส่งไม่สำเร็จ: ${o.failReasons.map(x => `${esc(x.label)} (${x.count})`).join(' · ')}</p>` : ''}`;
    },

    renderPages() {
        const list = this.data.pages, max = Math.max(1, ...list.map(x => x.views));
        $('anPages').innerHTML = list.length ? `<div class="an-row an-head"><span>หน้า</span><span>ดู</span><span>ผู้ใช้</span><span>เวลาเฉลี่ย</span></div>` + list.slice(0, 12).map(x => `
          <div class="an-row"><span class="an-name"><b>${esc(anPage(x.app, x.page))}</b><small>${esc(AN_APPS[x.app] || x.app)}</small><i class="an-bar" style="width:${Math.round(x.views / max * 100)}%"></i></span>
            <span class="mono">${fmtNum(x.views)}</span><span class="mono">${fmtNum(x.users)}</span><span class="mono">${x.avgTime ? anDur(x.avgTime) : '-'}</span></div>`).join('')
            : emptyState('ยังไม่มีข้อมูลในช่วงนี้', 'chart');
    },

    renderEvents() {
        const list = this.data.events.filter(x => x.event !== 'page_view');
        $('anEvents').innerHTML = list.length ? `<div class="an-row an-row-ev an-head"><span>เหตุการณ์</span><span>ครั้ง</span><span>ผู้ใช้</span></div>` + list.slice(0, 16).map((x, i) => `
          <details class="an-ev"><summary class="an-row an-row-ev"><span class="an-name"><b>${esc(anEvent(x.event))}</b><small>${esc(AN_APPS[x.app] || x.app)} · <code>${esc(x.event)}</code></small></span>
            <span class="mono">${fmtNum(x.count)}</span><span class="mono">${fmtNum(x.users)}</span></summary>
            ${x.labels.length ? `<ul class="an-labels">${x.labels.map(l => `<li><span>${esc(l.label)}</span><b class="mono">${fmtNum(l.count)}</b></li>`).join('')}</ul>` : '<p class="muted-text an-labels">ไม่มีรายละเอียดเพิ่มเติม</p>'}
          </details>`).join('')
            : emptyState('ยังไม่มีเหตุการณ์ในช่วงนี้', 'chart');
    },

    bars(title, list, map) {
        const total = list.reduce((a, x) => a + x.users, 0) || 1;
        return `<div class="an-block"><h4>${title}</h4>${list.length ? list.slice(0, 6).map(x => {
            const pct = Math.round(x.users / total * 100);
            return `<div class="an-share"><span>${esc(map ? map(x.key) : x.key)}</span><span class="an-share-bar"><i style="width:${pct}%"></i></span><b class="mono">${pct}%</b></div>`;
        }).join('') : '<p class="muted-text">-</p>'}</div>`;
    },
    renderTech() {
        const d = this.data, dev = { mobile: 'มือถือ', tablet: 'แท็บเล็ต', desktop: 'คอมพิวเตอร์' };
        $('anTech').innerHTML = this.bars('อุปกรณ์', d.devices, k => dev[k] || k) + this.bars('ระบบปฏิบัติการ', d.os) + this.bars('เบราว์เซอร์', d.browsers) + this.bars('เปิดจาก', d.pwa);
        $('anSources').innerHTML = this.bars('ที่มา (ลิงก์ที่กดเข้ามา)', d.sources) + (d.app === 'all' ? this.bars('แอป', d.apps, k => AN_APPS[k] || k) : '');
    },

    renderHeat() {
        const g = this.data.heat, max = Math.max(1, ...g.flat()), days = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
        const order = [1, 2, 3, 4, 5, 6, 0]; // จันทร์ก่อน
        $('anHeat').innerHTML = `<div class="heat-grid" role="table" aria-label="จำนวนเซสชันตามวันและชั่วโมง">
          <span></span>${Array.from({ length: 24 }, (_, h) => `<span class="heat-h">${h % 3 === 0 ? h : ''}</span>`).join('')}
          ${order.map(d => `<span class="heat-d">${days[d]}</span>${g[d].map((v, h) => `<span class="heat-c" style="--a:${v ? (0.15 + 0.85 * v / max).toFixed(2) : 0}" title="${days[d]} ${String(h).padStart(2, '0')}:00 น. · ${v} เซสชัน" aria-label="${days[d]} ${h} นาฬิกา ${v} เซสชัน"></span>`).join('')}`).join('')}
        </div><div class="heat-legend"><span>น้อย</span><i style="--a:.15"></i><i style="--a:.45"></i><i style="--a:.75"></i><i style="--a:1"></i><span>มาก</span></div>`;
    }
};
