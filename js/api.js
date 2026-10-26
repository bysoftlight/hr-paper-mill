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

        const data = await response.json();
        return data;

    } catch (error) {
        console.error("Connection Error:", error);
        // Fallback กรณี CORS มีปัญหา หรือ Network หลุด
        return { success: false, networkError: true, message: "การเชื่อมต่อขัดข้อง กรุณาตรวจสอบอินเทอร์เน็ต" };
    }
}
