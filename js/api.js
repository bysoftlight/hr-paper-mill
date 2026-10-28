// js/api.js

async function callApi(action, payload = {}) {
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
