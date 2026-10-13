// ================================
// ชุดคำศัพท์เป้าหมายของโครงงาน (ตามขอบเขตที่กำหนดไว้)
// ใช้ร่วมกันทั้งหน้าเว็บหลัก (index.html) และตัวสร้างฐานข้อมูล (extract.html)
// ⚠️ ไม่ใช่รายการที่ "รองรับแล้ว" ทั้งหมด แต่เป็นรายการที่ "ตั้งเป้าให้รองรับ"
//    คำไหนมีอยู่จริงต้องดูจาก signs.js (สร้างจาก extract.html) หรือกฎใน translate.js
// ================================
const TARGET_WORDS = [
    // 1) ภาษามือในชีวิตประจำวัน 10 คำ
    { no: 1,  category: "daily", word: "สวัสดี",       note: "ใช้เริ่มต้นสนทนา" },
    { no: 2,  category: "daily", word: "ขอบคุณ",       note: "ใช้บ่อยในชีวิตประจำวัน" },
    { no: 3,  category: "daily", word: "ขอโทษ",        note: "ใช้เมื่อทำผิดหรือรบกวนผู้อื่น" },
    { no: 4,  category: "daily", word: "ใช่",          note: "ตอบรับ" },
    { no: 5,  category: "daily", word: "ไม่",          note: "ปฏิเสธ" },
    { no: 6,  category: "daily", word: "กิน",          note: "สื่อสารเรื่องอาหาร" },
    { no: 7,  category: "daily", word: "ดื่มน้ำ",       note: "บอกความต้องการดื่มน้ำ" },
    { no: 8,  category: "daily", word: "เข้าห้องน้ำ",   note: "ใช้ในสถานการณ์ทั่วไป" },
    { no: 9,  category: "daily", word: "ไปไหน",        note: "ใช้ถามเส้นทางหรือจุดหมาย" },
    { no: 10, category: "daily", word: "ไม่เข้าใจ",     note: "ใช้เมื่อต้องการให้อีกฝ่ายอธิบายใหม่" },

    // 2) ภาษามือสำหรับขอความช่วยเหลือ 20 คำ
    { no: 1,  category: "emergency", word: "ช่วยด้วย",      note: "ต้องการความช่วยเหลือ" },
    { no: 2,  category: "emergency", word: "เจ็บ",          note: "รู้สึกเจ็บปวด" },
    { no: 3,  category: "emergency", word: "ป่วย",          note: "แจ้งว่าตนเองไม่สบาย" },
    { no: 4,  category: "emergency", word: "หายใจไม่ออก",    note: "เหตุฉุกเฉินด้านการหายใจ" },
    { no: 5,  category: "emergency", word: "ล้ม",           note: "แจ้งว่าเกิดการล้ม" },
    { no: 6,  category: "emergency", word: "เลือดออก",      note: "แจ้งอาการบาดเจ็บ" },
    { no: 7,  category: "emergency", word: "อันตราย",       note: "เตือนภัย" },
    { no: 8,  category: "emergency", word: "หยุด",          note: "สั่งให้หยุดการกระทำ" },
    { no: 9,  category: "emergency", word: "หนี",           note: "ต้องออกจากพื้นที่อันตราย" },
    { no: 10, category: "emergency", word: "ไฟไหม้",        note: "แจ้งเหตุเพลิงไหม้" },
    { no: 11, category: "emergency", word: "ตำรวจ",         note: "ต้องการความช่วยเหลือจากตำรวจ" },
    { no: 12, category: "emergency", word: "หมอ",           note: "ต้องการพบแพทย์" },
    { no: 13, category: "emergency", word: "โรงพยาบาล",     note: "ต้องการไปโรงพยาบาล" },
    { no: 14, category: "emergency", word: "รถพยาบาล",      note: "ต้องการรถพยาบาล" },
    { no: 15, category: "emergency", word: "โทรศัพท์",      note: "ต้องการใช้โทรศัพท์" },
    { no: 16, category: "emergency", word: "โทรหาครอบครัว", note: "ติดต่อคนในครอบครัว" },
    { no: 17, category: "emergency", word: "หลงทาง",        note: "ไม่ทราบว่าตนเองอยู่ที่ไหน" },
    { no: 18, category: "emergency", word: "กลัว",          note: "แจ้งความรู้สึกไม่ปลอดภัย" },
    { no: 19, category: "emergency", word: "ช่วยโทร 1669",  note: "ขอความช่วยเหลือทางการแพทย์ฉุกเฉิน" },
    { no: 20, category: "emergency", word: "ช่วยโทร 191",   note: "ขอความช่วยเหลือจากตำรวจ" }
];