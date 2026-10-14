// ================================
// โหมด 3: คู่สนทนา (วิดีโอคอลผ่าน PeerJS)
// เชื่อมผ่านเซิร์ฟเวอร์กลางฟรีของ PeerJS (ภายนอก ไม่ใช่ของเรา)
// ไม่เหมาะกับงานฉุกเฉินจริงจัง เพราะความเสถียรขึ้นกับบริการฟรีภายนอก
// ================================
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const remotePlaceholder = document.getElementById("remotePlaceholder");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const joinRoomInput = document.getElementById("joinRoomInput");
const roomInfo = document.getElementById("roomInfo");
const callStartCamBtn = document.getElementById("callStartCam");
const callEndBtn = document.getElementById("callEndBtn");

let localStream = null;
let peer = null;
let currentCall = null;

function setRoomInfo(html) {
    roomInfo.innerHTML = html;
}

async function startLocalCam() {
    if (localStream) return localStream;
    localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });
    localVideo.srcObject = localStream;
    callStartCamBtn.textContent = "✅ กล้องพร้อมแล้ว";
    callStartCamBtn.disabled = true;
    return localStream;
}

callStartCamBtn.addEventListener("click", async () => {
    try {
        await startLocalCam();
    } catch (err) {
        console.error(err);
        alert("เปิดกล้องไม่สำเร็จ กรุณาอนุญาตการใช้กล้อง/ไมค์");
    }
});

function attachCallEvents(call) {
    currentCall = call;
    call.on("stream", (remoteStream) => {
        remoteVideo.srcObject = remoteStream;
        remotePlaceholder.style.display = "none";
    });
    call.on("close", handleRemoteClosed);
    call.on("error", (err) => {
        console.error("call error", err);
        setRoomInfo(`<span style="color:#c62828">การเชื่อมต่อขาดหาย: ${err.message || err}</span>`);
    });
    callEndBtn.disabled = false;
}

function ensurePeer() {
    if (peer && !peer.destroyed) return peer;
    peer = new Peer();   // ใช้เซิร์ฟเวอร์ broker สาธารณะของ PeerJS โดยอัตโนมัติ

    peer.on("call", (call) => {
        if (!localStream) {
            setRoomInfo(`<span style="color:#c62828">มีคนโทรเข้ามา แต่ยังไม่ได้เปิดกล้องของฉัน</span>`);
            return;
        }
        call.answer(localStream);
        attachCallEvents(call);
        setRoomInfo(`เชื่อมต่อกับคู่สนทนาแล้ว`);
    });

    peer.on("error", (err) => {
        console.error("peer error", err);
        setRoomInfo(`<span style="color:#c62828">เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ: ${err.type || err.message}</span>`);
    });

    return peer;
}

createRoomBtn.addEventListener("click", async () => {
    try {
        await startLocalCam();
    } catch (err) {
        alert("ต้องเปิดกล้องของฉันก่อนสร้างห้อง");
        return;
    }
    setRoomInfo("กำลังสร้างห้อง...");
    const p = ensurePeer();

    const showRoomCode = (id) => {
        setRoomInfo(`
            ส่งรหัสนี้ให้อีกฝั่ง แล้วรอให้เขาเข้าร่วมห้อง<br>
            <span class="room-code">${id}</span>
        `);
    };

    // ถ้า peer เปิดอยู่แล้ว (เช่น กดสร้างห้องซ้ำ) event "open" จะไม่เกิดอีก
    // ต้องแสดงรหัสเดิมทันที ไม่ใช่รอ event ที่ไม่มีวันมา
    if (p.open && p.id) showRoomCode(p.id);
    else p.once("open", showRoomCode);   // once = ไม่สะสม listener ซ้ำ
});

joinRoomBtn.addEventListener("click", async () => {
    const roomId = joinRoomInput.value.trim();
    if (!roomId) {
        alert("กรุณาใส่รหัสห้องก่อน");
        return;
    }
    try {
        await startLocalCam();
    } catch (err) {
        alert("ต้องเปิดกล้องของฉันก่อนเข้าร่วมห้อง");
        return;
    }

    setRoomInfo("กำลังเชื่อมต่อ...");
    const p = ensurePeer();

    const tryCall = () => {
        const call = p.call(roomId, localStream);
        if (!call) {
            setRoomInfo(`<span style="color:#c62828">เชื่อมต่อไม่สำเร็จ ตรวจสอบรหัสห้องอีกครั้ง</span>`);
            return;
        }
        attachCallEvents(call);
        setRoomInfo("เชื่อมต่อกับคู่สนทนาแล้ว");
    };

    if (p.open) tryCall();
    else p.once("open", tryCall);
});

// ล้างวิดีโอให้ภาพหายจริง ไม่ใช่แค่ตั้ง srcObject = null
// (บางเบราว์เซอร์จะค้างเฟรมสุดท้ายไว้ถ้าไม่ pause/load ด้วย)
function clearVideo(videoEl) {
    videoEl.pause();
    videoEl.srcObject = null;
    videoEl.removeAttribute("src");
    videoEl.load();
}

// ตัดเฉพาะฝั่งคู่สนทนา (ใช้ตอนอีกฝั่งวางสาย) กล้องของเรายังเปิดอยู่
function clearRemote() {
    if (currentCall) {
        currentCall.close();
        currentCall = null;
    }
    clearVideo(remoteVideo);
    remotePlaceholder.style.display = "flex";
    callEndBtn.disabled = true;
    setRoomInfo("");
}

// จบการเชื่อมต่อทั้งหมด: ตัดสาย + ปิดกล้องตัวเอง + ตัดการเชื่อมต่อเซิร์ฟเวอร์
// ใช้ตอนกดปุ่ม "จบการเชื่อมต่อ" และตอนออกจากโหมดนี้
function hangUp() {
    clearRemote();

    if (peer) {
        peer.destroy();
        peer = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    clearVideo(localVideo);

    callStartCamBtn.textContent = "📷 เปิดกล้องของฉัน";
    callStartCamBtn.disabled = false;
    joinRoomInput.value = "";
}

// เมื่ออีกฝั่งวางสาย ให้ตัดเฉพาะภาพฝั่งเขา ไม่ปิดกล้องของเรา
function handleRemoteClosed() {
    clearRemote();
}

callEndBtn.addEventListener("click", hangUp);

// ออกจากโหมดนี้แล้วตัดการเชื่อมต่อทั้งหมด เพื่อไม่ให้กล้อง/เน็ตทำงานค้างอยู่เบื้องหลัง
document.addEventListener("mode:leave", (e) => {
    if (e.detail === "call") hangUp();
});