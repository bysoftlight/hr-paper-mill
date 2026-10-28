// js/staff/overview.js — ภาพรวมวันนี้ (KPI, แนวโน้ม 30 วัน, ยังไม่ส่ง, เฝ้าระวัง, รายการล่าสุด)

VIEWS.overview = {
    data: null,
    loading: false,

    init() {
        $('ovRefresh').addEventListener('click', () => this.load(true));
    },

    show() {
        if (!this.data) this.skeleton();
        this.load();
    },

    reset() { this.data = null; this.loading = false; this.stale = false; },

    onLive() {
        if (ST.view === 'overview' && !document.querySelector('dialog[open]')) this.load();
        else this.stale = true;
    },

    skeleton() {
        $('ovKpis').innerHTML = Array.from({ length: 5 }, () =>
            '<div class="kpi" aria-hidden="true"><span class="skel skel-text" style="width:60%"></span><span class="skel" style="height:30px;width:45%;margin:6px 0"></span><span class="skel skel-sm" style="width:70%"></span></div>').join('');
        $('ovTrend').innerHTML = Array.from({ length: 30 }, (_, i) => `<div class="bar"><i class="skel" style="height:${20 + ((i * 37) % 60)}%"></i></div>`).join('');
        ['ovLatest', 'ovMissing', 'ovAgent', 'ovAnom'].forEach(id => {
            $(id).innerHTML = Array.from({ length: 3 }, () => '<div class="feed-item" aria-hidden="true"><span class="skel" style="width:36px;height:36px;border-radius:50%"></span><span class="fi-text"><span class="skel skel-text" style="width:60%"></span><span class="skel skel-sm" style="width:40%"></span></span></div>').join('');
        });
    },

    async load(manual) {
        if (this.loading) return;
        this.loading = true;
        if (manual) $('ovRefresh').disabled = true;
        const pre = !manual && ST.prefetch && ST.prefetch.overview;
        if (ST.prefetch) ST.prefetch.overview = null;
        const r = await (pre || api('staff.overview'));
        this.loading = false;
        $('ovRefresh').disabled = false;
        if (!r.success) {
            if (!this.data) $('ovKpis').innerHTML = `<div class="card empty" style="grid-column:1/-1">${icon('wifi-off')}${esc(r.message || 'โหลดข้อมูลไม่สำเร็จ')}</div>`;
            return;
        }
        this.data = r;
        this.stale = false;
        ST.lastSync = Date.now();
        this.render();
        if (manual) toast('อัปเดตข้อมูลแล้ว');
    },

    render() {
        const d = this.data, k = d.kpi;
        $('ovDate').textContent = `${thDateLong(d.today)} · อัปเดต ${thTime(d.generatedAt)} น.`;
        const rate = k.participants ? Math.round(k.reportedToday / k.participants * 100) : 0;
        $('ovKpis').innerHTML = `
          <button type="button" class="kpi is-ok" data-ov-filter="today">
            <small>ส่งแล้ววันนี้</small><b>${fmtNum(k.reportedToday)}<span class="of"> / ${fmtNum(k.participants)}</span></b>
            <span>${rate}% ของผู้ใช้สิทธิ์ที่ใช้งาน</span><div class="kpi-meter"><i style="width:${rate}%"></i></div>
          </button>
          <button type="button" class="kpi ${k.missingToday ? 'is-bad' : 'is-ok'}" data-ov-filter="missing">
            <small>ยังไม่ส่งวันนี้</small><b>${fmtNum(k.missingToday)}</b><span>คน · แตะเพื่อดูรายชื่อ</span>
          </button>
          <button type="button" class="kpi" data-ov-filter="agentToday">
            <small>ขายโดยตัวแทนวันนี้</small><b>${fmtNum(k.agentToday)}</b><span>${k.agentOverLimit ? `<b class="text-bad">${k.agentOverLimit} คน</b> เกิน ${ST.config && ST.config.agentLimit || 10} ครั้ง/เดือน` : 'ไม่มีผู้เกินโควตาเดือนนี้'}</span>
          </button>
          <button type="button" class="kpi ${k.anomaliesToday + k.nogpsToday ? 'is-warn' : ''}" data-ov-filter="anomaly">
            <small>ตำแหน่งต้องตรวจสอบ</small><b>${fmtNum(k.anomaliesToday + k.nogpsToday)}</b><span>ผิดปกติ ${k.anomaliesToday} · ไม่มี GPS ${k.nogpsToday}</span>
          </button>
          <button type="button" class="kpi" data-ov-filter="month">
            <small>อัตราการส่งเดือนนี้</small><b>${k.monthRate}<span class="of">%</span></b><span>${fmtNum(k.monthRecords)} รายการ</span>
          </button>`;
        $('ovKpis').querySelectorAll('[data-ov-filter]').forEach(b => b.addEventListener('click', () => this.drill(b.dataset.ovFilter)));

        // แนวโน้ม 30 วัน (ซ้อน ขายเอง + ตัวแทน)
        const max = Math.max(1, ...d.trend.map(t => t.count));
        $('ovTrend').innerHTML = d.trend.map(t => {
            const self = t.count - t.agent;
            const label = `${thDate(t.date, { day: 'numeric', month: 'short' })}: ${t.count} รายการ (ตัวแทน ${t.agent})`;
            return `<div class="bar${t.date === d.today ? ' is-today' : ''}${t.count ? '' : ' empty-bar'}" title="${label}"><i class="s" style="height:${self / max * 100}%"></i><i class="a" style="height:${t.agent / max * 100}%"></i></div>`;
        }).join('');
        const t = d.trend;
        $('ovTrendAxis').innerHTML = [t[0], t[14], t[29]].map(x => `<span>${thDate(x.date, { day: 'numeric', month: 'short' })}</span>`).join('');

        // รายการล่าสุด
        $('ovLatest').innerHTML = d.latest.length ? d.latest.map((r, i) => `
          <button type="button" class="feed-item" data-i="${i}">
            ${avatarHtml(r.userName, r.userPic)}
            <span class="fi-text"><b>${esc(r.userName)}</b><small>${esc(r.site || r.userId)} · ${thDate(r.date, { day: 'numeric', month: 'short' })} ${esc(r.time)} น.</small></span>
            <span class="fi-side">${r.anomaly ? `<span class="badge is-bad">${icon('alert')}${fmtDistance(r.distance)}</span>` : ''}${typeChip(r.type)}</span>
          </button>`).join('') : `<div class="empty">${icon('inbox')}ยังไม่มีรายการ</div>`;
        $('ovLatest').querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => VIEWS.records.openDetail(d.latest[b.dataset.i])));

        // ยังไม่ส่ง
        $('ovMissCount').textContent = d.missing.length;
        $('ovMissing').innerHTML = d.missing.length ? d.missing.map(m => `
          <div class="person">
            ${avatarHtml(m.name, m.pic)}
            <span class="fi-text"><b>${esc(m.name)}</b><small><span class="mono">${esc(m.id)}</span>${m.site ? ' · ' + esc(m.site) : ''}</small></span>
            ${m.phone ? `<a class="call-btn" href="tel:${esc(m.phone.replace(/[^0-9+]/g, ''))}" aria-label="โทรหา ${esc(m.name)}">${icon('phone')}</a>` : ''}
            ${can('participants.view') ? `<button type="button" class="icon-btn" data-pid="${esc(m.id)}" aria-label="ดูข้อมูล ${esc(m.name)}" style="margin:0">${icon('chevron-right')}</button>` : ''}
          </div>`).join('') : `<div class="empty">${icon('check-circle')}ทุกคนส่งรายงานวันนี้แล้ว</div>`;
        $('ovMissing').querySelectorAll('[data-pid]').forEach(b => b.addEventListener('click', () => VIEWS.participants.openDetail(b.dataset.pid)));

        // เฝ้าระวังโควตาตัวแทน
        $('ovAgent').innerHTML = d.agentWatch.length ? d.agentWatch.map(a => {
            const ratio = a.used / a.limit, cls = ratio >= 0.8 ? 'is-bad' : 'is-warn';
            return `<button type="button" class="person" data-uid="${esc(a.id)}">
              ${avatarHtml(a.name, a.pic)}
              <span class="fi-text"><b>${esc(a.name)}</b><small><span class="mono">${esc(a.id)}</span>${a.site ? ' · ' + esc(a.site) : ''}</small></span>
              <span class="fi-side"><span class="mini-meter ${cls}"><i style="width:${Math.min(100, ratio * 100)}%"></i></span><b class="mono ${a.used > a.limit ? 'text-bad' : ''}">${a.used}/${a.limit}</b></span>
            </button>`;
        }).join('') : `<div class="empty">${icon('check-circle')}ไม่มีผู้ใช้สิทธิ์ที่ใกล้ครบโควตา</div>`;
        $('ovAgent').querySelectorAll('[data-uid]').forEach(b => b.addEventListener('click', () =>
            VIEWS.records.openWith({ period: 'month', userIds: [b.dataset.uid], types: [AGENT_TYPE] })));

        // ตำแหน่งต้องตรวจสอบ
        $('ovAnom').innerHTML = d.anomalies.length ? d.anomalies.map((r, i) => `
          <button type="button" class="feed-item" data-i="${i}">
            ${avatarHtml(r.userName, r.userPic)}
            <span class="fi-text"><b>${esc(r.userName)}</b><small>${esc(r.site || '-')} · ${esc(r.time)} น.</small></span>
            <span class="fi-side">${r.hasGps ? `<span class="badge is-bad">${icon('alert')}ห่าง ${fmtDistance(r.distance)}</span>` : `<span class="badge is-warn">ไม่มี GPS</span>`}</span>
          </button>`).join('') : `<div class="empty">${icon('check-circle')}ไม่มีรายการผิดปกติวันนี้</div>`;
        $('ovAnom').querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => VIEWS.records.openDetail(d.anomalies[b.dataset.i])));
    },

    drill(kind) {
        const today = todayIso();
        if (kind === 'missing') return can('participants.view') ? VIEWS.participants.openWith('missing') : null;
        if (kind === 'today') return VIEWS.records.openWith({ period: 'day', day: today });
        if (kind === 'agentToday') return VIEWS.records.openWith({ period: 'day', day: today, types: [AGENT_TYPE] });
        if (kind === 'anomaly') return VIEWS.records.openWith({ period: 'day', day: today, location: 'anomaly' });
        if (kind === 'month') return VIEWS.records.openWith({ period: 'month' });
    }
};
