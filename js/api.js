// js/api.js

// ---------- ความปลอดภัย: รหัสเครื่อง · บัตรเครื่องที่เชื่อถือได้ · ตรวจความปลอดภัย (proof-of-work) ----------
// ระบบหลังบ้านนับรหัสผิดต่อเครื่องและล็อกเมื่อผิดบ่อย (ดู "ป้องกันการสุ่มรหัส" ใน Code.gs)
// เข้าระบบสำเร็จ → ได้ trust มาเก็บไว้ เครื่องนี้ใช้งานได้ตามปกติแม้ระบบอยู่ในโหมดป้องกัน
const Guard = (() => {
    const DID = 'HRPM_DID', TRUST = 'HRPM_TRUST';
    const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
    function device() {
        let d = ls.get(DID);
        if (!d) { d = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12); ls.set(DID, d); }
        return d;
    }
    function trustFor(id) {
        try { const t = JSON.parse(ls.get(TRUST) || '{}'); return t[String(id || '').toUpperCase()] || ''; } catch (e) { return ''; }
    }
    function saveTrust(id, token) {
        if (!id || !token) return;
        let t = {};
        try { t = JSON.parse(ls.get(TRUST) || '{}') || {}; } catch (e) { t = {}; }
        t[String(id).toUpperCase()] = token;
        ls.set(TRUST, JSON.stringify(t));
    }

    // SHA-256 แบบเขียนเอง (เร็วกว่า crypto.subtle มากเมื่อต้องคำนวณหลายหมื่นครั้ง)
    const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
    const W = new Uint32Array(64);
    function sha256First32(bytes) { // คืนค่า 32 บิตแรกของ hash (พอสำหรับตรวจบิต 0 นำหน้า)
        const len = bytes.length, nBlocks = ((len + 9 + 63) >> 6);
        const buf = new Uint8Array(nBlocks * 64); buf.set(bytes); buf[len] = 0x80;
        const bitLen = len * 8; buf[buf.length - 4] = bitLen >>> 24; buf[buf.length - 3] = bitLen >>> 16; buf[buf.length - 2] = bitLen >>> 8; buf[buf.length - 1] = bitLen;
        let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
        for (let o = 0; o < buf.length; o += 64) {
            for (let i = 0; i < 16; i++) W[i] = (buf[o + i * 4] << 24) | (buf[o + i * 4 + 1] << 16) | (buf[o + i * 4 + 2] << 8) | buf[o + i * 4 + 3];
            for (let i = 16; i < 64; i++) {
                const a = W[i - 15], b = W[i - 2];
                const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3), s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
                W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
            }
            let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
            for (let i = 0; i < 64; i++) {
                const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)), ch = (e & f) ^ (~e & g);
                const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
                const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)), mj = (a & b) ^ (a & c) ^ (b & c);
                const t2 = (S0 + mj) | 0;
                h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
            }
            h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
        }
        return h0 >>> 0;
    }
    // หา counter ที่ SHA-256("nonce:counter") ขึ้นต้นด้วยบิต 0 อย่างน้อย bits ตัว — แบ่งทำเป็นช่วงๆ ไม่ให้หน้าเว็บค้าง
    async function solve(ch) {
        const enc = new TextEncoder(), mask = ch.bits >= 32 ? 0xffffffff : (0xffffffff << (32 - ch.bits)) >>> 0;
        let i = 0;
        for (;;) {
            const end = i + 4000;
            for (; i < end; i++) if ((sha256First32(enc.encode(ch.nonce + ':' + i)) & mask) === 0) return { nonce: ch.nonce, counter: String(i) };
            await new Promise(r => setTimeout(r, 0));
            if (i > 50000000) throw new Error('pow');
        }
    }
    return { device, trustFor, saveTrust, solve, sha256First32 };
})();

async function callApi(action, payload = {}) {
    // แนบรหัสเครื่องและบัตรเครื่องที่เชื่อถือได้ (ถ้ามี) ให้ทุกคำขอของผู้ใช้สิทธิ์
    payload = Object.assign({ device: Guard.device(), ua: String(navigator.userAgent || '').slice(0, 160) }, payload);
    if (payload.userId && !payload.trust) { const t = Guard.trustFor(payload.userId); if (t) payload.trust = t; }
    let res = await callApiRaw(action, payload);
    // ระบบขอให้ตรวจความปลอดภัย: คำนวณแล้วส่งใหม่ (ครั้งเดียว)
    if (res && res.code === 'CHALLENGE' && res.challenge && !payload.pow) {
        if (typeof window !== 'undefined' && window.onSecurityCheck) window.onSecurityCheck(true);
        try { payload.pow = await Guard.solve(res.challenge); } catch (e) { payload.pow = null; }
        if (typeof window !== 'undefined' && window.onSecurityCheck) window.onSecurityCheck(false);
        if (payload.pow) res = await callApiRaw(action, payload);
    }
    if (res && res.success && res.trust && (payload.userId || (res.data && res.data.id))) Guard.saveTrust(payload.userId || res.data.id, res.trust);
    return res;
}

async function callApiRaw(action, payload = {}) {
    if (!CONFIG.API_URL || !CONFIG.API_SECRET) {
        console.error("Config missing");
        return { success: false, message: "Configuration Error" };
    }

    try {
        const bodyData = JSON.stringify({
            action: action,
            secret: CONFIG.API_SECRET, // ส่ง Secret ไปด้วยทุกครั้ง
            ...payload
        });

        // ใช้ standard fetch (CORS Mode)
        // หมายเหตุ: Apps Script ต้อง Deploy เป็น "Anyone" เพื่อรองรับ CORS
        const response = await fetch(CONFIG.API_URL, {
            method: "POST",
            body: bodyData
        });

        const text = await response.text();
        try { return JSON.parse(text); } catch (e) {
            // ได้หน้าเว็บ (HTML) แทน JSON: Apps Script ขัดข้อง/ยังไม่ได้อนุญาตสิทธิ์/Deploy ไม่ถูกต้อง
            console.error('Apps Script ตอบกลับไม่ใช่ JSON:', text.slice(0, 300));
            return { success: false, networkError: true, serverError: true, message: 'ระบบหลังบ้านขัดข้อง กรุณาลองใหม่ภายหลัง หรือแจ้งเจ้าหน้าที่' };
        }

    } catch (error) {
        console.error("Connection Error:", error);
        // Fallback กรณี CORS มีปัญหา หรือ Network หลุด
        // ออนไลน์อยู่แต่เรียกไม่สำเร็จ = มักเป็นที่ระบบหลังบ้าน (Apps Script ล้มจะไม่ส่ง CORS กลับมา)
        const offline = navigator.onLine === false;
        return { success: false, networkError: true, message: offline ? "ไม่มีการเชื่อมต่ออินเทอร์เน็ต กรุณาตรวจสอบแล้วลองใหม่" : "เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง หากยังไม่ได้ แจ้งเจ้าหน้าที่" };
    }
}
