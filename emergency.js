// ================================
// โหมด 2: ปุ่มฉุกเฉิน
// ================================

// เบอร์กลางที่ตรวจสอบแล้ว ใช้ได้ทั่วประเทศไทย
// 1330 คือสายด่วน สปสช. ซึ่งร่วมกับ TTRS มีบริการล่ามภาษามือทางไกลสำหรับคนหูหนวก
const OFFICIAL_NUMBERS = [
    { label: "การแพทย์ฉุกเฉิน", num: "1669" },
    { label: "ตำรวจ", num: "191" },
    { label: "ดับเพลิง/กู้ภัย", num: "199" },
    { label: "สายด่วน สปสช. (มีล่ามภาษามือ)", num: "1330", alt: true }
];

const officialEmergencyEl = document.getElementById("officialEmergency");

function renderOfficialNumbers() {
    officialEmergencyEl.innerHTML = OFFICIAL_NUMBERS.map(item => `
        <a class="emergency-btn ${item.alt ? "alt" : ""}" href="tel:${item.num}">
            <span class="num">${item.num}</span>
            <span class="label">${item.label}</span>
        </a>
    `).join("");
}
renderOfficialNumbers();

// ================================
// ผู้ติดต่อฉุกเฉินของผู้ใช้เอง (เก็บไว้ในเครื่องนี้เท่านั้น)
// ================================
const STORAGE_KEY = "thsl_emergency_contacts";
const customContactsEl = document.getElementById("customContacts");
const contactForm = document.getElementById("contactForm");
const contactNameInput = document.getElementById("contactName");
const contactPhoneInput = document.getElementById("contactPhone");

// ทำความสะอาดข้อมูลก่อนใช้/เก็บ กัน HTML และอักขระแปลกปลอม (XSS)
const MAX_NAME_LEN = 40;

function sanitizeName(v) {
    return String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_NAME_LEN);
}

// เบอร์โทรอนุญาตเฉพาะ ตัวเลข + * # ช่องว่าง และ - (ต้องมีตัวเลขอย่างน้อย 3 หลัก)
function sanitizePhone(v) {
    const cleaned = String(v ?? "").replace(/[^0-9+*#\-\s]/g, "").trim().slice(0, 20);
    return (cleaned.match(/\d/g) || []).length >= 3 ? cleaned : "";
}

function loadContacts() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!Array.isArray(raw)) return [];
        // ข้อมูลเก่าใน localStorage อาจเคยถูกบันทึกแบบไม่ปลอดภัย จึงกรองซ้ำตอนโหลด
        return raw
            .map(c => ({ name: sanitizeName(c && c.name), phone: sanitizePhone(c && c.phone) }))
            .filter(c => c.name && c.phone);
    } catch {
        return [];
    }
}

function saveContacts(list) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (err) {
        console.warn("บันทึกผู้ติดต่อไม่สำเร็จ", err);
    }
}

let contacts = loadContacts();

// สร้าง element ด้วย DOM API (textContent / setAttribute) แทนการต่อสตริง innerHTML
function renderContacts() {
    customContactsEl.textContent = "";

    if (!contacts.length) {
        const empty = document.createElement("p");
        empty.style.color = "#777";
        empty.textContent = "ยังไม่มีผู้ติดต่อ เพิ่มได้ด้านล่าง";
        customContactsEl.appendChild(empty);
        return;
    }

    contacts.forEach((c, i) => {
        const row = document.createElement("div");
        row.className = "contact-row";

        const nameEl = document.createElement("span");
        nameEl.textContent = c.name;

        const callEl = document.createElement("a");
        callEl.href = "tel:" + c.phone.replace(/[\s-]/g, "");
        callEl.textContent = "📞 " + c.phone;

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "delContact";
        delBtn.textContent = "ลบ";
        delBtn.addEventListener("click", () => {
            contacts.splice(i, 1);
            saveContacts(contacts);
            renderContacts();
        });

        row.append(nameEl, callEl, delBtn);
        customContactsEl.appendChild(row);
    });
}
renderContacts();

contactForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = sanitizeName(contactNameInput.value);
    const phone = sanitizePhone(contactPhoneInput.value);
    if (!name) return;
    if (!phone) {
        alert("เบอร์โทรไม่ถูกต้อง ใส่ได้เฉพาะตัวเลข + - * # และต้องมีอย่างน้อย 3 หลัก");
        return;
    }

    contacts.push({ name, phone });
    saveContacts(contacts);
    renderContacts();

    contactForm.reset();
});