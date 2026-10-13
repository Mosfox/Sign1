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

function loadContacts() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
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

function renderContacts() {
    customContactsEl.innerHTML = contacts.length
        ? contacts.map((c, i) => `
            <div class="contact-row">
                <span>${c.name}</span>
                <a href="tel:${c.phone}">📞 ${c.phone}</a>
                <button data-i="${i}" class="delContact">ลบ</button>
            </div>
        `).join("")
        : `<p style="color:#777">ยังไม่มีผู้ติดต่อ เพิ่มได้ด้านล่าง</p>`;

    customContactsEl.querySelectorAll(".delContact").forEach(btn => {
        btn.addEventListener("click", () => {
            contacts.splice(Number(btn.dataset.i), 1);
            saveContacts(contacts);
            renderContacts();
        });
    });
}
renderContacts();

contactForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = contactNameInput.value.trim();
    const phone = contactPhoneInput.value.trim();
    if (!name || !phone) return;

    contacts.push({ name, phone });
    saveContacts(contacts);
    renderContacts();

    contactForm.reset();
});