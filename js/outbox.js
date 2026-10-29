// js/outbox.js — คิวรายงานที่รอส่ง (เก็บใน IndexedDB ของเครื่อง) ใช้ร่วมกันระหว่างหน้าเว็บและ service worker
// สัญญาณหลุดตอนกดบันทึก → เก็บรายงาน (รวมรูปที่ย่อแล้ว) ไว้ แล้วส่งเองเมื่อเน็ตกลับมา
// ใช้ CONFIG (js/config.js) สำหรับที่อยู่ระบบหลังบ้าน

const Outbox = (() => {
    const DB = 'hrpm-outbox', STORE = 'reports';
    let dbp = null;
    function db() {
        if (!dbp) {
            dbp = new Promise((resolve, reject) => {
                const req = indexedDB.open(DB, 1);
                req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        return dbp;
    }
    async function tx(mode, fn) {
        const d = await db();
        return new Promise((resolve, reject) => {
            const t = d.transaction(STORE, mode);
            const out = fn(t.objectStore(STORE));
            t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
            t.onerror = () => reject(t.error);
        });
    }
    const all = () => tx('readonly', s => s.getAll()).then(r => (r || []).sort((a, b) => a.createdAt - b.createdAt));
    const put = item => tx('readwrite', s => s.put(item));
    const remove = id => tx('readwrite', s => s.delete(id));

    // ส่งคิวทั้งหมด: สำเร็จ/ถูกปฏิเสธถาวร → ลบออก, เน็ตยังไม่มา → เก็บไว้ลองใหม่
    let flushing = null;
    function flush() {
        if (flushing) return flushing;
        flushing = (async () => {
            const results = [];
            for (const item of await all()) {
                let res;
                try {
                    const r = await fetch(CONFIG.API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({ action: 'submit', secret: CONFIG.API_SECRET, userId: item.userId, formData: item.formData, device: item.device, trust: item.trust })
                    });
                    res = await r.json();
                } catch (e) {
                    item.tries = (item.tries || 0) + 1;
                    item.lastError = 'ยังไม่มีสัญญาณ';
                    await put(item);
                    results.push({ item, pending: true });
                    break; // เน็ตยังไม่มา ไม่ต้องลองรายการถัดไป
                }
                if (res && res.success) {
                    await remove(item.id);
                    results.push({ item, sent: true, res });
                } else if (res && /วันนี้ไปแล้ว|ไม่พบรหัส|ปิดใช้งาน|ไฟล์ภาพใหญ่/.test(res.message || '')) {
                    await remove(item.id); // ส่งซ้ำไม่ได้แน่นอน: เอาออกจากคิว แล้วแจ้งผู้ใช้
                    results.push({ item, rejected: true, res });
                } else {
                    item.tries = (item.tries || 0) + 1;
                    item.lastError = (res && res.message) || 'ระบบขัดข้องชั่วคราว';
                    await put(item);
                    results.push({ item, pending: true, res });
                }
            }
            return results;
        })().finally(() => { flushing = null; });
        return flushing;
    }

    return { all, put, remove, flush, count: () => all().then(a => a.length) };
})();
