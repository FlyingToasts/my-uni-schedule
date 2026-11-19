/**
 * ============================================================================
 * Smart Schedule - Firebase Configuration & Setup
 * ============================================================================
 * การเชื่อมต่อ Firebase Web SDK (Auth + Cloud Firestore)
 * ภายใต้โควตาฟรี 100% (Firebase Spark Plan)
 * Project: premium-odyssey-456314-p7 (256116049348)
 * ============================================================================
 */

window.DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyCDEUFnOTi-WHSeVZCpSPhzQprnrlJuoXw",
    authDomain: "premium-odyssey-456314-p7.firebaseapp.com",
    projectId: "premium-odyssey-456314-p7",
    storageBucket: "premium-odyssey-456314-p7.firebasestorage.app",
    messagingSenderId: "256116049348",
    appId: "1:256116049348:web:df2b65f0e02b3bd5a71091"
};

/**
 * ดึง Firebase Config ปัจจุบัน (อ่านจาก localStorage ก่อน ถ้าไม่มีให้ใช้ค่าเริ่มต้น)
 */
function getActiveFirebaseConfig() {
    try {
        const stored = localStorage.getItem('smart_schedule_custom_firebase_config');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && parsed.apiKey && parsed.projectId) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Cannot read custom Firebase config from localStorage:', e);
    }
    return window.DEFAULT_FIREBASE_CONFIG;
}

/**
 * บันทึก Firebase Config ลง localStorage
 */
function saveCustomFirebaseConfig(configObj) {
    if (!configObj) {
        localStorage.removeItem('smart_schedule_custom_firebase_config');
    } else {
        localStorage.setItem('smart_schedule_custom_firebase_config', JSON.stringify(configObj));
    }
}
