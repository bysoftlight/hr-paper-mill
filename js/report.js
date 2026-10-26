// js/report.js — ส่งออกรายงานประจำเดือนเป็น PDF (A4)
// วาดแต่ละหน้าเป็น HTML ด้วยฟอนต์ของเว็บ (ภาษาไทยแสดงถูกต้อง) แล้วแปลงเป็นภาพด้วย html2canvas และรวมเป็น PDF ด้วย jsPDF
// ไลบรารีอยู่ใน js/vendor และโหลดเมื่อกดส่งออกครั้งแรกเท่านั้น

const PDF_VENDOR = ['js/vendor/html2canvas.min.js', 'js/vendor/jspdf.umd.min.js'];
const PAGE_W = 794, PAGE_H = 1123;            // A4 ที่ 96dpi (px)
const MM_PER_PX = 210 / PAGE_W;
const ROWS_FIRST_PAGE = 18, ROWS_PER_PAGE = 27, PHOTOS_PER_PAGE = 6;

let vendorReady = null;
function loadVendor() {
    if (!vendorReady) {
        vendorReady = PDF_VENDOR.reduce((p, src) => p.then(() => new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src + '?v=2.5.2';
            s.onload = resolve;
            s.onerror = () => reject(new Error('โหลดไลบรารีสร้าง PDF ไม่สำเร็จ'));
            document.head.appendChild(s);
        })), Promise.resolve());
        vendorReady.catch(() => { vendorReady = null; });
    }
    return vendorReady;
}

// --- Export dialog ---
function initExport() {
    $('exportMonth').innerHTML = MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join('');
    $('exportOpen').addEventListener('click', openExport);
    $('exportMonth').addEventListener('change', updateExportInfo);
    $('exportYear').addEventListener('change', updateExportInfo);
    $('exportPhotos').addEventListener('change', updateExportInfo);
    $('exportGo').addEventListener('click', runExport);
}

function openExport() {
    const now = new Date();
    const useFilter = CURRENT_FILTER === 'month';
    $('exportYear').innerHTML = $('yearSelect').innerHTML;
    $('exportMonth').value = useFilter ? FILTER_MONTH_IDX : now.getMonth();
    $('exportYear').value = useFilter ? FILTER_YEAR_VAL : now.getFullYear();
    if (!$('exportYear').value) $('exportYear').value = now.getFullYear();
    updateExportInfo();
    showModal('exportModal');
}

function monthItems(year, month) {
    return ALL_HISTORY
        .filter(h => { const d = new Date(h.timestamp); return d.getFullYear() === year && d.getMonth() === month; })
        .sort((a, b) => a.timestamp - b.timestamp);
}

function updateExportInfo() {
    const items = monthItems(Number($('exportYear').value), Number($('exportMonth').value));
    const photos = items.filter(i => i.fileId || i.image).length;
    $('exportInfo').textContent = items.length
        ? `พบ ${items.length} รายการ` + ($('exportPhotos').checked ? ` · แนบรูป ${photos} รูป` : '')
        : 'ไม่มีรายการในเดือนนี้ — ยังส่งออกได้ (รายงานจะแสดงว่าไม่มีการส่ง)';
}

async function runExport() {
    const year = Number($('exportYear').value), month = Number($('exportMonth').value);
    const withPhotos = $('exportPhotos').checked;
    const items = monthItems(year, month);
    $('exportModal').close();
    showLoading(true, 'กำลังเตรียมรายงาน…');
    try {
        await loadVendor();
        const photos = withPhotos ? await collectPhotos(items) : [];
        showLoading(true, 'กำลังสร้างไฟล์ PDF…');
        const pages = buildReportPages(year, month, items, photos);
        const stage = $('pdfStage');
        stage.replaceChildren(...pages);
        await waitForRender(stage);

        const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
        for (let i = 0; i < pages.length; i++) {
            showLoading(true, `กำลังสร้างไฟล์ PDF… หน้า ${i + 1}/${pages.length}`);
            const canvas = await window.html2canvas(pages[i], { scale: 2, backgroundColor: '#FFFFFF', logging: false });
            if (i > 0) pdf.addPage();
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', 0, 0, 210, 297);
            addLinks(pdf, pages[i]);
        }
        pdf.setProperties({ title: `รายงานการขาย ${MONTHS[month]} ${year + 543} — ${CURRENT_USER.name}`, author: 'HR Paper Mill' });
        pdf.save(`HR-PaperMill_${CURRENT_USER.id}_${year + 543}-${String(month + 1).padStart(2, '0')}.pdf`);
        stage.replaceChildren();
    } catch (err) {
        showMessage({ title: 'ส่งออก PDF ไม่สำเร็จ', text: String(err && err.message || err), tone: 'bad' });
    } finally {
        showLoading(false);
    }
}

// ลิงก์ในหน้า (เช่น Google Maps) ให้กดได้ใน PDF
function addLinks(pdf, page) {
    const base = page.getBoundingClientRect();
    page.querySelectorAll('a[href]').forEach(a => {
        const r = a.getBoundingClientRect();
        pdf.link((r.left - base.left) * MM_PER_PX, (r.top - base.top) * MM_PER_PX, r.width * MM_PER_PX, r.height * MM_PER_PX, { url: a.href });
    });
}

async function collectPhotos(items) {
    const withImg = items.filter(i => i.fileId || i.image);
    const out = new Array(withImg.length);
    let done = 0, next = 0;
    const worker = async () => {
        while (next < withImg.length) {
            const idx = next++;
            const item = withImg[idx];
            out[idx] = { item, src: await fetchImageData(item).catch(() => null) };
            showLoading(true, `กำลังโหลดรูปหลักฐาน… ${++done}/${withImg.length}`);
        }
    };
    await Promise.all([worker(), worker(), worker()]);
    return out;
}

function waitForRender(root) {
    const imgs = [...root.querySelectorAll('img')].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; }));
    return Promise.all([document.fonts ? document.fonts.ready : null, ...imgs]);
}

// --- Page builders ---
function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
}

function pageShell(title, pageNo, total) {
    const page = el('section', 'pdf-page');
    const head = el('header', 'pdf-head');
    head.innerHTML = `<div class="pdf-brand"><span class="logo"><span class="pdf-lift">H</span></span><span><b>HR Paper Mill</b><small>โครงการใช้สิทธิ์สัมปทานผู้พิการตามมาตรา 35</small></span></div>`;
    head.appendChild(el('div', 'pdf-title', title));
    const body = el('div', 'pdf-body');
    const foot = el('footer', 'pdf-foot');
    foot.append(
        el('span', '', `${CURRENT_USER.name} · ${CURRENT_USER.id} · สร้างเมื่อ ${new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })} น.`),
        el('span', 'mono', `หน้า ${pageNo}/${total}`)
    );
    page.append(head, body, foot);
    return { page, body };
}

function chunk(arr, first, rest) {
    const out = [arr.slice(0, first)];
    for (let i = first; i < arr.length; i += rest) out.push(arr.slice(i, i + rest));
    return out;
}

function buildReportPages(year, month, items, photos) {
    const monthLabel = `${MONTHS[month]} ${year + 543}`;
    const title = `รายงานการขายประจำเดือน ${monthLabel}`;
    const rowChunks = chunk(items, ROWS_FIRST_PAGE, ROWS_PER_PAGE);
    const photoChunks = photos.length ? chunk(photos, PHOTOS_PER_PAGE, PHOTOS_PER_PAGE) : [];
    const total = rowChunks.length + photoChunks.length;
    const pages = [];
    let rowNo = 0;

    rowChunks.forEach((rows, i) => {
        const { page, body } = pageShell(title, pages.length + 1, total);
        if (i === 0) body.append(summaryBlock(year, month, items));
        body.append(recordsTable(rows, rowNo, i === 0 ? 'รายการส่งรายงาน' : 'รายการส่งรายงาน (ต่อ)'));
        rowNo += rows.length;
        pages.push(page);
    });

    photoChunks.forEach((group, i) => {
        const { page, body } = pageShell(title, pages.length + 1, total);
        body.append(el('h3', 'pdf-h3', i === 0 ? 'ภาพหลักฐาน' : 'ภาพหลักฐาน (ต่อ)'));
        const grid = el('div', 'pdf-photos');
        group.forEach(({ item, src }) => {
            const cell = el('figure', 'pdf-photo');
            if (src) {
                const img = el('img');
                img.src = src;
                cell.appendChild(img);
            } else {
                cell.appendChild(el('div', 'pdf-photo-missing', 'โหลดรูปไม่ได้'));
            }
            const cap = el('figcaption');
            cap.append(el('b', '', `${formatThaiDate(item.timestamp)} · ${item.time} น.`), el('span', '', item.type));
            cell.appendChild(cap);
            grid.appendChild(cell);
        });
        body.appendChild(grid);
        pages.push(page);
    });
    return pages;
}

function summaryBlock(year, month, items) {
    const wrap = el('div', 'pdf-summary');
    const now = new Date();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const isCurrent = year === now.getFullYear() && month === now.getMonth();
    const isFuture = new Date(year, month, 1) > now;
    const dueDays = isFuture ? 0 : isCurrent ? now.getDate() : daysInMonth;
    const reportedDays = new Set(items.map(h => new Date(h.timestamp).getDate()));
    const missing = [];
    for (let d = 1; d <= dueDays; d++) if (!reportedDays.has(d)) missing.push(d);
    const agent = items.filter(h => h.type === AGENT_TYPE).length;
    const self = items.length - agent;

    const user = el('div', 'pdf-user');
    user.innerHTML = `<div><small>ชื่อผู้ใช้สิทธิ์</small><b></b></div><div><small>รหัสผู้ใช้สิทธิ์</small><b class="mono"></b></div><div><small>การใช้สิทธิ์</small><b></b></div>`;
    const [n, id, st] = user.querySelectorAll('b');
    n.textContent = CURRENT_USER.name; id.textContent = CURRENT_USER.id; st.textContent = CURRENT_USER.status || '-';

    const tiles = el('div', 'pdf-tiles');
    const tile = (label, value, sub, tone) => {
        const t = el('div', 'pdf-tile' + (tone ? ` is-${tone}` : ''));
        t.append(el('small', '', label), el('b', '', value), el('span', '', sub));
        return t;
    };
    const agentTone = agent / AGENT_LIMIT >= 0.8 ? 'bad' : agent / AGENT_LIMIT >= 0.5 ? 'warn' : '';
    tiles.append(
        tile('ส่งรายงาน', String(items.length), 'รายการ'),
        tile('วันที่ส่งแล้ว', `${reportedDays.size}/${dueDays || daysInMonth}`, isCurrent ? 'วัน (ถึงวันนี้)' : 'วัน'),
        tile('ขายด้วยตัวเอง', String(self), 'ครั้ง'),
        tile('ขายโดยตัวแทน', `${agent}/${AGENT_LIMIT}`, 'ครั้ง (ข้อ 1.3)', agentTone)
    );

    const miss = el('p', 'pdf-note');
    miss.textContent = dueDays === 0 ? 'ยังไม่ถึงเดือนนี้'
        : missing.length ? `วันที่ยังไม่มีรายงาน (${missing.length} วัน): ${missing.join(', ')} ${MONTHS[month]}`
        : 'ส่งรายงานครบทุกวัน';
    if (missing.length) miss.classList.add('is-warn');

    wrap.append(user, tiles, miss);
    return wrap;
}

function recordsTable(rows, startNo, heading) {
    const wrap = el('div');
    wrap.appendChild(el('h3', 'pdf-h3', heading));
    if (!rows.length) {
        wrap.appendChild(el('p', 'pdf-empty', 'ไม่มีการส่งรายงานในเดือนนี้'));
        return wrap;
    }
    const table = el('table', 'pdf-table');
    table.innerHTML = '<thead><tr><th>#</th><th>วันที่</th><th>เวลา</th><th>ประเภท</th><th>ตำแหน่ง (กดเปิดแผนที่)</th></tr></thead>';
    const tbody = el('tbody');
    rows.forEach((h, i) => {
        const tr = el('tr');
        const isAgent = h.type === AGENT_TYPE;
        tr.append(
            el('td', 'mono', String(startNo + i + 1)),
            el('td', '', formatThaiDate(h.timestamp)),
            el('td', 'mono', `${h.time} น.`)
        );
        const typeTd = el('td');
        const chip = el('span', 'pdf-chip' + (isAgent ? ' is-agent' : ''));
        chip.appendChild(el('span', 'pdf-lift', isAgent ? 'โดยตัวแทน' : 'ขายเอง'));
        typeTd.appendChild(chip);
        const locTd = el('td');
        const url = mapUrlOf(h);
        if (url) {
            const a = el('a', 'mono', `${Number(h.lat).toFixed(5)}, ${Number(h.lng).toFixed(5)}`);
            a.href = url;
            locTd.appendChild(a);
        } else {
            locTd.appendChild(el('span', 'pdf-muted', '-'));
        }
        tr.append(typeTd, locTd);
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
}

document.addEventListener('DOMContentLoaded', initExport);
