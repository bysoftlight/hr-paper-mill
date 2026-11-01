// js/feedback.js — แจ้งปัญหาการใช้งาน + แบบสอบถาม (ใช้ร่วมกันทั้งหน้าผู้ใช้สิทธิ์และหน้าเจ้าหน้าที่)
//   Feedback.openProblem({ who: 'participant'|'guest'|'staff', page, send(payload) → Promise<res>, urgent })
//   Feedback.openSurvey(survey, { send(answers) → Promise<res>, preview, context }) → Promise<'done'|'later'>
//   ต้องมี utils.js (icon, compressImage, showMessage, ErrorLog) โหลดก่อน
const Feedback = (() => {
    const CATS = [
        ['login', 'เข้าสู่ระบบไม่ได้', 'lock'], ['gps', 'GPS / ตำแหน่ง', 'pin'], ['camera', 'กล้อง / รูปภาพ', 'camera'],
        ['submit', 'ส่งรายงานไม่ได้', 'send'], ['data', 'ข้อมูลไม่ถูกต้อง', 'file'], ['slow', 'ช้า / ค้าง', 'refresh'],
        ['display', 'หน้าจอแสดงผลผิด', 'image'], ['notify', 'การแจ้งเตือน', 'bell'], ['other', 'อื่นๆ', 'help']
    ];
    const STAFF_CATS = ['login', 'data', 'slow', 'display', 'notify', 'other'];
    const FACES = ['😞', '🙁', '😐', '🙂', '😄'];
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const el = id => document.getElementById(id);
    const ic = (n, c) => (typeof icon === 'function' ? icon(n, c || '') : '');

    // ข้อมูลประกอบ (ช่วยหาสาเหตุ) — ไม่มีรหัสผ่าน/รูปหลักฐาน
    function env() {
        let tz = '';
        try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
        return {
            online: navigator.onLine !== false,
            screen: innerWidth + '×' + innerHeight + ' @' + (Math.round((devicePixelRatio || 1) * 10) / 10) + 'x',
            standalone: !!((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true),
            lang: [navigator.language, tz].filter(Boolean).join(' · '),
            lastError: (window.ErrorLog && ErrorLog.last) || ''
        };
    }
    const version = () => ((document.querySelector('script[src*="feedback.js"]') || {}).src || '').split('v=')[1] || '';

    // ---------------- แจ้งปัญหา ----------------
    let P = null; // { opts, image }
    function problemDialog() {
        let d = el('problemModal');
        if (d) return d;
        d = document.createElement('dialog');
        d.id = 'problemModal';
        d.className = 'sheet fb-sheet';
        d.setAttribute('aria-labelledby', 'problemTitle');
        d.innerHTML = `
            <div class="sheet-head">
                <div><h2 id="problemTitle">แจ้งปัญหาการใช้งาน</h2><p>ส่งถึงอีเมลผู้ดูแลระบบทันที</p></div>
                <button type="button" class="icon-btn" data-close aria-label="ปิด">${ic('x')}</button>
            </div>
            <form class="sheet-body fb-form" id="problemForm" novalidate>
                <div class="banner banner-info fb-urgent" id="problemUrgent" hidden></div>
                <fieldset class="fb-field">
                    <legend class="label">ปัญหาเกี่ยวกับ</legend>
                    <div class="fb-cats" id="problemCats"></div>
                </fieldset>
                <label class="fb-field" for="problemDetail">
                    <span class="label">เล่าปัญหาที่พบ <b class="fb-req" aria-hidden="true">*</b></span>
                    <textarea id="problemDetail" class="input fb-textarea" rows="4" maxlength="3000" required
                        placeholder="เช่น กดส่งรายงานแล้วขึ้นข้อความว่า… / เกิดตอนไหน กำลังทำอะไรอยู่"></textarea>
                    <small class="fb-count" id="problemCount">0/3000</small>
                </label>
                <div class="fb-field">
                    <span class="label">ภาพหน้าจอ (ถ้ามี)</span>
                    <div class="fb-shot" id="problemShot">
                        <label class="btn btn-outline fb-attach">${ic('image', 'ic-16')} แนบภาพหน้าจอ<input type="file" id="problemImage" accept="image/*" hidden></label>
                        <div class="fb-thumb" id="problemThumb" hidden><img alt="ภาพหน้าจอที่แนบ"><button type="button" class="icon-btn" id="problemImageRemove" aria-label="เอาภาพออก">${ic('x')}</button></div>
                    </div>
                </div>
                <div class="fb-guest" id="problemGuest" hidden>
                    <label class="fb-field"><span class="label">ชื่อ-นามสกุล</span><input id="problemName" class="input" autocomplete="name" maxlength="80"></label>
                    <label class="fb-field" id="problemUidWrap"><span class="label">รหัสผู้ใช้สิทธิ์ (ถ้าทราบ)</span><input id="problemUid" class="input mono" maxlength="6" autocapitalize="characters" spellcheck="false" autocomplete="off"></label>
                </div>
                <label class="fb-field" id="problemContactWrap">
                    <span class="label" id="problemContactLabel">เบอร์โทรติดต่อกลับ</span>
                    <input id="problemContact" class="input" inputmode="tel" autocomplete="tel" maxlength="120">
                </label>
                <p class="fb-note">${ic('info', 'ic-16')}<span>ระบบแนบข้อมูลอุปกรณ์ (ชนิดเครื่อง เบราว์เซอร์ ขนาดหน้าจอ) ไปด้วยเพื่อช่วยหาสาเหตุ · ดู<a href="privacy.html" target="_blank" rel="noopener">นโยบายความเป็นส่วนตัว</a></span></p>
            </form>
            <div class="sheet-foot">
                <button type="submit" form="problemForm" class="btn btn-primary" id="problemSend">${ic('send')} ส่งเรื่อง</button>
            </div>`;
        document.body.appendChild(d);
        const form = el('problemForm');
        form.addEventListener('submit', e => { e.preventDefault(); sendProblem(); });
        el('problemDetail').addEventListener('input', () => { el('problemCount').textContent = el('problemDetail').value.length + '/3000'; el('problemDetail').removeAttribute('aria-invalid'); });
        el('problemContact').addEventListener('input', () => el('problemContact').removeAttribute('aria-invalid'));
        el('problemUid').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
        el('problemImage').addEventListener('change', pickImage);
        el('problemImageRemove').addEventListener('click', () => setImage(null));
        return d;
    }

    async function pickImage(e) {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        if (!/^image\//.test(f.type)) return showMessage({ title: 'ไฟล์นี้ไม่ใช่รูปภาพ', text: 'กรุณาเลือกภาพหน้าจอ (JPG หรือ PNG)', tone: 'warn' });
        try {
            const r = await compressImage(f, 1440, 0.72);
            setImage({ data: r.base64, mimeType: 'image/jpeg', bytes: r.bytes });
        } catch (err) {
            showMessage({ title: 'เปิดรูปนี้ไม่ได้', text: 'ลองถ่ายภาพหน้าจอใหม่ หรือส่งเรื่องโดยไม่แนบรูป', tone: 'warn' });
        }
    }
    function setImage(img) {
        P.image = img;
        el('problemThumb').hidden = !img;
        el('problemShot').querySelector('.fb-attach').hidden = !!img;
        if (img) el('problemThumb').querySelector('img').src = 'data:image/jpeg;base64,' + img.data;
    }

    function openProblem(opts) {
        const d = problemDialog();
        P = { opts: opts || {}, image: null };
        const who = P.opts.who || 'participant';
        const keys = who === 'staff' ? STAFF_CATS : CATS.map(c => c[0]);
        const first = P.opts.category && keys.indexOf(P.opts.category) !== -1 ? P.opts.category : who === 'guest' ? 'login' : '';
        el('problemCats').innerHTML = CATS.filter(c => keys.indexOf(c[0]) !== -1).map(c =>
            `<label class="fb-chip"><input type="radio" name="problemCat" value="${c[0]}"${c[0] === first ? ' checked' : ''}><span>${ic(c[2], 'ic-16')}${esc(c[1])}</span></label>`).join('');
        el('problemForm').reset();
        if (first) el('problemCats').querySelector(`input[value="${first}"]`).checked = true;
        el('problemCount').textContent = '0/3000';
        el('problemGuest').hidden = who !== 'guest';
        el('problemContactWrap').hidden = who === 'staff';
        const staffGuest = who === 'guest' && P.opts.staffGuest; // เจ้าหน้าที่ที่ยังเข้าสู่ระบบไม่ได้
        el('problemUidWrap').hidden = !!staffGuest;
        el('problemContact').setAttribute('inputmode', staffGuest ? 'email' : 'tel');
        el('problemContact').setAttribute('autocomplete', staffGuest ? 'email' : 'tel');
        el('problemContactLabel').innerHTML = who === 'guest' ? (staffGuest ? 'อีเมลหรือเบอร์โทรติดต่อกลับ' : 'เบอร์โทรติดต่อกลับ') + ' <b class="fb-req" aria-hidden="true">*</b>' : 'เบอร์โทรติดต่อกลับ (ถ้าต่างจากที่ให้ไว้)';
        if (who === 'guest' && P.opts.userId) el('problemUid').value = String(P.opts.userId).toUpperCase().slice(0, 6);
        el('problemUrgent').hidden = !P.opts.urgent;
        el('problemUrgent').innerHTML = P.opts.urgent ? ic('phone') + '<div>' + P.opts.urgent + '</div>' : '';
        ['problemDetail', 'problemContact'].forEach(id => el(id).removeAttribute('aria-invalid'));
        setImage(null);
        el('problemSend').disabled = false;
        if (!d.open) d.showModal();
        el('problemForm').scrollTop = 0;
    }

    async function sendProblem() {
        const who = P.opts.who || 'participant';
        const detail = el('problemDetail').value.trim();
        const contact = el('problemContact').value.trim();
        if (detail.replace(/\s/g, '').length < 5) {
            el('problemDetail').setAttribute('aria-invalid', 'true'); el('problemDetail').focus();
            return showMessage({ title: 'เล่าปัญหาอีกนิด', text: 'กรุณาเล่าว่าเกิดอะไรขึ้นอย่างน้อย 1 ประโยค เพื่อให้ผู้ดูแลระบบช่วยได้ตรงจุด', tone: 'warn' });
        }
        if (who === 'guest' && !contact) {
            el('problemContact').setAttribute('aria-invalid', 'true'); el('problemContact').focus();
            return showMessage({ title: 'ใส่ช่องทางติดต่อกลับ', text: 'ยังไม่ได้เข้าสู่ระบบ ผู้ดูแลจึงต้องใช้ช่องทางนี้ติดต่อกลับ', tone: 'warn' });
        }
        if (navigator.onLine === false) return showMessage({ title: 'ไม่มีสัญญาณอินเทอร์เน็ต', text: 'ต่ออินเทอร์เน็ตแล้วกดส่งอีกครั้ง หากเร่งด่วนกรุณาโทรหาเจ้าหน้าที่', tone: 'warn' });
        const cat = (document.querySelector('input[name="problemCat"]:checked') || {}).value || 'other';
        const payload = {
            category: cat, detail: detail, contact: contact, page: P.opts.page || '', version: version(), env: env(),
            image: P.image ? { data: P.image.data, mimeType: P.image.mimeType } : null
        };
        if (who === 'guest') { payload.name = el('problemName').value.trim(); if (!P.opts.staffGuest) payload.userId = el('problemUid').value.trim(); }
        el('problemSend').disabled = true;
        if (typeof showLoading === 'function') showLoading(true, 'กำลังส่งเรื่อง…');
        let res;
        try { res = await P.opts.send(payload); } catch (e) { res = { success: false, message: String(e && e.message || e) }; }
        if (typeof showLoading === 'function') showLoading(false);
        el('problemSend').disabled = false;
        if (res && res.success) {
            el('problemModal').close();
            try { if (window.Analytics) Analytics.track('problem_report', { l: cat }); } catch (e) {}
            showMessage({ title: 'ส่งเรื่องแล้ว', text: `เลขที่เรื่อง ${res.id || '-'} · ผู้ดูแลระบบได้รับอีเมลแล้ว จะตรวจสอบและติดต่อกลับโดยเร็ว`, tone: 'ok' });
        } else {
            showMessage({ title: 'ส่งเรื่องไม่สำเร็จ', text: (res && res.message) || 'กรุณาลองใหม่อีกครั้ง หรือโทรหาเจ้าหน้าที่', tone: 'bad' });
        }
    }

    // ---------------- แบบสอบถาม (ทีละข้อ) ----------------
    // มือถือ: หนึ่งคำถามต่อหนึ่งหน้า แถบความคืบหน้าด้านบน · เลือกคะแนนแล้วไปข้อถัดไปเอง · ย้อนกลับได้
    let S = null; // { survey, opts, resolve, step, done }
    function surveyDialog() {
        let d = el('surveyModal');
        if (d) return d;
        d = document.createElement('dialog');
        d.id = 'surveyModal';
        d.className = 'sheet fb-sheet fb-survey';
        d.setAttribute('aria-labelledby', 'surveyTitle');
        d.innerHTML = `
            <div class="sheet-head fb-survey-head">
                <div class="fb-survey-meta">
                    <span class="fb-tag">${ic('help', 'ic-16')} <span id="surveyTag">แบบสอบถาม</span></span>
                    <h2 id="surveyTitle"></h2>
                </div>
                <button type="button" class="icon-btn" data-close aria-label="ปิด">${ic('x')}</button>
            </div>
            <div class="fb-steps" aria-hidden="true"><div class="fb-progress"><span id="surveyBar"></span></div><span class="fb-step-n" id="surveyStepN"></span></div>
            <form class="sheet-body fb-form fb-survey-body" id="surveyForm" novalidate></form>
            <div class="sheet-foot fb-survey-foot">
                <p class="fb-hint" id="surveyHint" role="status" aria-live="polite"></p>
                <div class="fb-nav">
                    <button type="button" class="btn btn-outline" id="surveyBack">ย้อนกลับ</button>
                    <button type="submit" form="surveyForm" class="btn btn-primary" id="surveySend">ถัดไป</button>
                </div>
                <button type="button" class="btn-text fb-later" id="surveyLater">ทำภายหลัง</button>
            </div>`;
        document.body.appendChild(d);
        el('surveyForm').addEventListener('submit', e => { e.preventDefault(); next(); });
        el('surveyForm').addEventListener('change', e => {
            progress();
            // เลือกคะแนน/ตัวเลือกแล้วไปข้อถัดไปเอง (ไม่ใช่ข้อสุดท้าย)
            if (e.target.type === 'radio' && S && S.step < S.survey.questions.length - 1) {
                clearTimeout(S.auto); S.auto = setTimeout(() => { if (S && el('surveyModal').open) go(S.step + 1); }, 380);
            }
        });
        el('surveyForm').addEventListener('input', progress);
        el('surveyBack').addEventListener('click', () => { if (S && S.step > 0) go(S.step - 1); });
        el('surveyLater').addEventListener('click', () => d.close());
        d.addEventListener('close', () => { if (S) clearTimeout(S.auto); if (S && S.resolve) { const r = S.resolve; S.resolve = null; r(S.done ? 'done' : 'later'); } });
        return d;
    }

    function questionHtml(q, i, n) {
        const name = 'sq_' + q.id;
        let body = '';
        if (q.type === 'rating') {
            const k = q.scale || 5;
            body = `<div class="fb-rate" role="radiogroup" aria-label="${esc(q.text)}">` + Array.from({ length: k }, (_, j) => {
                const v = j + 1, face = k === 5 ? FACES[j] : '';
                return `<label class="fb-rate-opt"><input type="radio" name="${name}" value="${v}"><span><i aria-hidden="true">${face}</i><b>${v}</b></span></label>`;
            }).join('') + `</div><div class="fb-rate-ends"><span>${esc(q.low || 'น้อยที่สุด')}</span><span>${esc(q.high || 'มากที่สุด')}</span></div>`;
        } else if (q.type === 'choice') {
            body = '<div class="fb-choices">' + (q.options || []).map(o => `<label class="fb-choice"><input type="radio" name="${name}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('') + '</div>';
        } else {
            body = `<textarea class="input fb-textarea" name="${name}" rows="4" maxlength="1500" placeholder="พิมพ์ความคิดเห็น${q.required ? '' : ' (ไม่บังคับ)'}"></textarea>`;
        }
        return `<fieldset class="fb-q" data-q="${esc(q.id)}" data-i="${i}" data-required="${q.required ? 1 : 0}" ${i ? 'hidden' : ''}>
            <legend><span class="fb-qn">ข้อ ${i + 1}/${n}${q.required ? '' : ' · ไม่บังคับ'}</span><span class="fb-qt">${esc(q.text)}${q.required ? ' <b class="fb-req" aria-hidden="true">*</b>' : ''}</span></legend>${body}</fieldset>`;
    }

    function answers() {
        const out = {};
        (S.survey.questions || []).forEach(q => {
            const name = 'sq_' + q.id;
            if (q.type === 'text') { const v = (el('surveyForm').querySelector(`[name="${name}"]`) || {}).value; if (v && v.trim()) out[q.id] = v.trim(); }
            else { const c = el('surveyForm').querySelector(`input[name="${name}"]:checked`); if (c) out[q.id] = q.type === 'rating' ? Number(c.value) : c.value; }
        });
        return out;
    }
    function progress() {
        if (!S) return;
        const qs = S.survey.questions || [], a = answers(), n = qs.length, q = qs[S.step];
        el('surveyBar').style.width = (n ? (S.step + (q && a[q.id] !== undefined ? 1 : 0.35)) / n * 100 : 0) + '%';
        el('surveyStepN').textContent = n ? `ข้อ ${S.step + 1} จาก ${n}` : '';
        el('surveyForm').querySelectorAll('.fb-q.is-missing').forEach(f => { if (a[f.dataset.q] !== undefined) f.classList.remove('is-missing'); });
        if (q && a[q.id] !== undefined) el('surveyHint').textContent = '';
        const last = S.step >= n - 1;
        el('surveySend').textContent = last ? (S.opts.preview ? 'ส่งคำตอบ (ตัวอย่าง)' : 'ส่งคำตอบ') : (q && !q.required && a[q.id] === undefined ? 'ข้าม' : 'ถัดไป');
        el('surveyBack').disabled = S.step === 0;
    }
    function go(i, back) {
        const qs = S.survey.questions || [];
        i = Math.max(0, Math.min(qs.length - 1, i));
        const dir = i < S.step || back ? 'is-back' : 'is-fwd';
        S.step = i;
        el('surveyForm').querySelectorAll('.fb-q').forEach(f => {
            const on = Number(f.dataset.i) === i;
            f.hidden = !on;
            f.classList.remove('is-fwd', 'is-back');
            if (on) { void f.offsetWidth; f.classList.add(dir); }
        });
        el('surveyHint').textContent = '';
        el('surveyForm').scrollTop = 0;
        progress();
        const cur = el('surveyForm').querySelector(`.fb-q[data-i="${i}"]`);
        const t = cur && cur.querySelector('textarea');
        if (t && matchMedia('(pointer: fine)').matches) setTimeout(() => t.focus(), 50);
    }
    function missingAt(i) {
        const q = S.survey.questions[i];
        return q && q.required && answers()[q.id] === undefined;
    }
    function next() {
        clearTimeout(S.auto);
        if (missingAt(S.step)) {
            const f = el('surveyForm').querySelector(`.fb-q[data-i="${S.step}"]`);
            f.classList.remove('is-missing'); void f.offsetWidth; f.classList.add('is-missing');
            el('surveyHint').textContent = 'กรุณาเลือกคำตอบข้อนี้ก่อน';
            return;
        }
        if (S.step < S.survey.questions.length - 1) return go(S.step + 1);
        sendSurvey();
    }

    function openSurvey(survey, opts) {
        const d = surveyDialog();
        if (S && S.resolve) { const r = S.resolve; S.resolve = null; r('later'); }
        S = { survey: survey, opts: opts || {}, done: false, resolve: null, step: 0 };
        const n = (survey.questions || []).length;
        el('surveyTitle').textContent = survey.title || 'แบบสอบถาม';
        el('surveyTag').textContent = S.opts.preview ? 'ตัวอย่างที่ผู้ใช้สิทธิ์จะเห็น' : `แบบสอบถาม · ${n} ข้อ · ไม่ถึง 1 นาที`;
        el('surveyForm').innerHTML = (survey.intro ? `<p class="fb-intro">${esc(survey.intro)}</p>` : '') +
            (survey.questions || []).map((q, i) => questionHtml(q, i, n)).join('') +
            (survey.endAt ? `<p class="fb-note fb-end">${ic('calendar', 'ic-16')}<span>ตอบได้ถึง ${new Date(survey.endAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })} น.</span></p>` : '');
        el('surveyLater').textContent = S.opts.preview ? 'ปิดตัวอย่าง' : 'ทำภายหลัง';
        el('surveySend').disabled = false;
        el('surveyHint').textContent = '';
        if (!d.open) d.showModal();
        go(0);
        return new Promise(resolve => { S.resolve = resolve; });
    }

    async function sendSurvey() {
        const a = answers();
        const miss = (S.survey.questions || []).findIndex((q, i) => missingAt(i));
        if (miss !== -1) { go(miss, true); return next(); }
        if (S.opts.preview) { S.done = true; el('surveyModal').close(); return; }
        if (navigator.onLine === false) { el('surveyHint').textContent = 'ไม่มีสัญญาณอินเทอร์เน็ต — คำตอบยังอยู่ครบ ต่อเน็ตแล้วกดส่งอีกครั้ง'; return; }
        el('surveySend').disabled = true;
        if (typeof showLoading === 'function') showLoading(true, 'กำลังส่งคำตอบ…');
        let res;
        try { res = await S.opts.send(a); } catch (e) { res = { success: false, message: String(e && e.message || e) }; }
        if (typeof showLoading === 'function') showLoading(false);
        el('surveySend').disabled = false;
        if (res && res.success) {
            S.done = true;
            el('surveyModal').close();
        } else if (res && (res.code === 'CLOSED' || res.code === 'NOT_FOUND')) {
            S.done = true; // ไม่ต้องเตือนอีก
            el('surveyModal').close();
            showMessage({ title: 'แบบสอบถามปิดแล้ว', text: res.message || 'แบบสอบถามนี้ปิดรับคำตอบแล้ว', tone: 'info' });
        } else {
            showMessage({ title: 'ส่งคำตอบไม่สำเร็จ', text: ((res && res.message) || 'กรุณาลองใหม่อีกครั้ง') + ' · คำตอบยังอยู่ครบ', tone: 'bad' });
        }
    }

    return { openProblem, openSurvey, env, CATS };
})();
