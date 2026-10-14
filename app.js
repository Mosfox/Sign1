// ================================
// เมนู 3 ขีด + สลับโหมด + ขยายเต็มจอ
// ================================
const menuBtn = document.getElementById("menuBtn");
const menuClose = document.getElementById("menuClose");
const sideMenu = document.getElementById("sideMenu");
const overlay = document.getElementById("overlay");
const menuItems = document.querySelectorAll(".menu-item");
const modes = document.querySelectorAll(".mode");

function openMenu() {
    sideMenu.classList.add("open");
    overlay.classList.add("show");
}

function closeMenu() {
    sideMenu.classList.remove("open");
    overlay.classList.remove("show");
}

menuBtn.addEventListener("click", openMenu);
menuClose.addEventListener("click", closeMenu);
overlay.addEventListener("click", closeMenu);

// เหตุการณ์ที่สคริปต์ของแต่ละโหมดฟังได้ เพื่อหยุดกล้อง/การเชื่อมต่อเมื่อออกจากโหมด
function dispatchModeLeave(modeName) {
    document.dispatchEvent(new CustomEvent("mode:leave", { detail: modeName }));
}
function dispatchModeEnter(modeName) {
    document.dispatchEvent(new CustomEvent("mode:enter", { detail: modeName }));
}

let currentMode = "translate";

function switchMode(name) {
    if (name === currentMode) {
        closeMenu();
        return;
    }
    dispatchModeLeave(currentMode);

    modes.forEach(sec => sec.classList.toggle("active", sec.id === `mode-${name}`));
    menuItems.forEach(btn => btn.classList.toggle("active", btn.dataset.mode === name));

    currentMode = name;
    dispatchModeEnter(name);
    closeMenu();
}

menuItems.forEach(btn => {
    btn.addEventListener("click", () => switchMode(btn.dataset.mode));
});

// ================================
// ปุ่มขยายเต็มจอ (ใช้ได้ทั้ง PC / iPad / มือถือ)
// ================================
const expandBtn = document.getElementById("expandBtn");
const cameraContainer = document.getElementById("cameraContainer");

expandBtn.addEventListener("click", async () => {
    try {
        if (!document.fullscreenElement) {
            await (cameraContainer.requestFullscreen
                ? cameraContainer.requestFullscreen()
                : cameraContainer.webkitRequestFullscreen());
            expandBtn.textContent = "⛶";
        } else {
            await (document.exitFullscreen
                ? document.exitFullscreen()
                : document.webkitExitFullscreen());
            expandBtn.textContent = "⛶";
        }
    } catch (err) {
        console.warn("เบราว์เซอร์นี้อาจไม่รองรับโหมดเต็มจอ", err);
    }
});