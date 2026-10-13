// ================================
// ELEMENTS
// ================================
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const statusEl = document.getElementById("status");
const sign = document.getElementById("sign");
const captionBar = document.getElementById("captionBar");
const sentence = document.getElementById("sentence");
const wordHistory = document.getElementById("wordHistory");
const speakButton = document.getElementById("speakButton");
const clearButton = document.getElementById("clearButton");
const flipCamBtn = document.getElementById("flipCam");
const confidenceWrap = document.getElementById("confidenceWrap");
const confidenceText = document.getElementById("confidenceText");
const confidenceFill = document.getElementById("confidenceFill");

// ================================
// VARIABLES
// ================================
let stream = null;
let isRunning = false;
let isSending = false;
let handsReady = false;
let facingMode = "user";   // "user" = กล้องหน้า, "environment" = กล้องหลัง

let words = [];
let candidate = null;
let candidateCount = 0;
let lastAdded = null;
let cooldownUntil = 0;

const STABLE_FRAMES = 12;   // ต้องเห็นท่าเดิมกี่เฟรมถึงนับเป็นคำ
const COOLDOWN_MS = 1500;   // เว้นช่วงหลังเพิ่มคำ

// ================================
// MEDIAPIPE HANDS
// ================================
const hands = new Hands({
    locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
});

// ================================
// CONNECTIONS
// ================================
const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17]
];

// ================================
// SIGN CLASSIFIER (แบบกฎ ใช้เมื่อยังไม่มี signs.js จากวิดีโอ)
// ================================
function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function getFingers(lm) {
    const wrist = lm[0];
    const tips = [8, 12, 16, 20];
    const pips = [6, 10, 14, 18];
    const others = tips.map((t, i) =>
        dist(lm[t], wrist) > dist(lm[pips[i]], wrist) * 1.1
    );
    const thumb = dist(lm[4], lm[17]) > dist(lm[3], lm[17]) * 1.05;
    return [thumb, ...others];
}

// ชุดคำศัพท์ตัวอย่าง (placeholder) ตามขอบเขตของโครงงาน คือคำที่เกี่ยวข้องกับ
// การขอความช่วยเหลือฉุกเฉิน (บทที่ 1.3 ข้อ 3): การขอความช่วยเหลือ,
// การแจ้งอาการเจ็บป่วย, การระบุตำแหน่งที่มีอาการเจ็บปวด
//
// ⚠️ รูปแบบนิ้ว (pattern) ด้านล่างเป็นแค่ตัวอย่างสาธิตวิธีนับนิ้ว ไม่ใช่ท่าภาษามือไทย
// ที่ถูกต้องจริง ต้องแทนที่ด้วยท่าจากแหล่งอ้างอิงที่เชื่อถือได้ (ตามที่ย้ำในหัวข้อ 2.1.1)
// เช่นใช้ extract.html ดึงจากวิดีโอพจนานุกรมภาษามือไทยแทน ถ้าใช้ signs.js
// ระบบจะใช้ฐานข้อมูลนั้นแทนกฎนับนิ้วชุดนี้โดยอัตโนมัติอยู่แล้ว
// pattern: [โป้ง, ชี้, กลาง, นาง, ก้อย]
const SIGNS = [
    { name: "ช่วยด้วย", pattern: [1, 1, 1, 1, 1] },
    { name: "เจ็บ",     pattern: [0, 0, 0, 0, 0] },
    { name: "ป่วย",     pattern: [1, 0, 0, 0, 0] },
    { name: "ไม่สบาย",  pattern: [0, 1, 0, 0, 0] },
    { name: "ตรงนี้",   pattern: [0, 1, 1, 0, 0] }
];

function classify(lm) {
    const fingers = getFingers(lm).map(Number);
    for (const s of SIGNS) {
        if (s.pattern.every((v, i) => v === fingers[i])) {
            return s.name;
        }
    }
    return null;
}

// ใช้เมื่อยังไม่มี signs.js: ให้คะแนนเป็น % จากจำนวนนิ้วที่ตรงกับท่าที่ใกล้ที่สุด
function classifyScore(lm) {
    if (!SIGNS.length) return null;
    const fingers = getFingers(lm).map(Number);
    let best = null;
    for (const s of SIGNS) {
        const matched = s.pattern.filter((v, i) => v === fingers[i]).length;
        const percent = Math.round((matched / s.pattern.length) * 100);
        if (!best || percent > best.percent) best = { name: s.name, percent };
    }
    return best;
}

// ================================
// WORD BUILDING (กันสั่น)
// ================================
function handleSign(name) {
    if (!name) {
        candidate = null;
        candidateCount = 0;
        return;
    }

    if (name === candidate) {
        candidateCount++;
    } else {
        candidate = name;
        candidateCount = 1;
    }

    const now = Date.now();
    if (
        candidateCount >= STABLE_FRAMES &&
        now > cooldownUntil &&
        name !== lastAdded
    ) {
        words.push(name);
        lastAdded = name;
        cooldownUntil = now + COOLDOWN_MS;
        renderWords();
    }
}

function renderWords() {
    sentence.textContent = words.length ? words.join(" ") : "-";
    wordHistory.textContent = words.length
        ? words.map((w, i) => `${i + 1}. ${w}`).join("  |  ")
        : "ยังไม่มีคำ";
}

// ================================
// DRAW HAND
// ================================
function drawHand(landmarks, handColor, labelText, percent) {
    if (percent !== null && percent !== undefined) {
        labelText = `${labelText} ${percent}%`;
    }
    const w = canvas.width;
    const h = canvas.height;
    const mirrored = facingMode === "user";
    const px = (p) => (mirrored ? (1 - p.x) : p.x) * w;
    const py = (p) => p.y * h;

    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    landmarks.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    });
    const pad = 30;
    const boxX = (mirrored ? (1 - maxX) : minX) * w - pad;
    const boxY = minY * h - pad;
    const boxW = (maxX - minX) * w + pad * 2;
    const boxH = (maxY - minY) * h + pad * 2;

    ctx.beginPath();
    ctx.rect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = handColor;
    ctx.lineWidth = 4;
    ctx.stroke();

    connections.forEach(([s, e]) => {
        ctx.beginPath();
        ctx.moveTo(px(landmarks[s]), py(landmarks[s]));
        ctx.lineTo(px(landmarks[e]), py(landmarks[e]));
        ctx.strokeStyle = handColor;
        ctx.lineWidth = 4;
        ctx.stroke();
    });

    landmarks.forEach((p, i) => {
        const x = px(p);
        const y = py(p);

        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fillStyle = "#000";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = handColor;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = handColor;
        ctx.font = "bold 14px Arial";
        ctx.fillText(String(i), x + 10, y - 8);
    });

    ctx.font = "bold 20px Arial";
    const tw = ctx.measureText(labelText).width;
    const lx = Math.max(0, boxX);
    const ly = Math.max(35, boxY);
    ctx.fillStyle = handColor;
    ctx.fillRect(lx, ly - 35, tw + 25, 35);
    ctx.fillStyle = "#000";
    ctx.fillText(labelText, lx + 10, ly - 10);
}

// ================================
// ตัวติดตามมือ: จำว่ามือแต่ละข้างอยู่ตรงไหน เพื่อให้ป้ายซ้าย/ขวาไม่สลับ
// ================================
const MAX_JUMP = 0.3;
const MAX_MISS = 20;
const tracks = { Left: null, Right: null };

function resetTracks() {
    tracks.Left = null;
    tracks.Right = null;
}

function assignSides(all) {
    const centers = all.map(lm => ({ x: lm[9].x, y: lm[9].y }));
    const sides = new Array(all.length).fill(null);
    const used = { Left: false, Right: false };

    const pairs = [];
    centers.forEach((c, i) => {
        ["Left", "Right"].forEach(s => {
            const t = tracks[s];
            if (t) pairs.push({ i, s, d: Math.hypot(c.x - t.x, c.y - t.y) });
        });
    });
    pairs.sort((a, b) => a.d - b.d);
    for (const p of pairs) {
        if (sides[p.i] || used[p.s] || p.d > MAX_JUMP) continue;
        sides[p.i] = p.s;
        used[p.s] = true;
    }

    const unmatched = sides.map((s, i) => (s ? -1 : i)).filter(i => i >= 0);
    const freeSides = ["Left", "Right"].filter(s => !used[s]);
    const mirrored = facingMode === "user";

    // x มากในภาพดิบ = ซ้ายของจอ (กล้องมิเรอร์) / ขวาของจอ (กล้องไม่มิเรอร์)
    const isLeftOnScreen = (xa, xb) => mirrored ? xa > xb : xa < xb;

    if (unmatched.length === 2 && freeSides.length === 2) {
        const [a, b] = unmatched;
        if (isLeftOnScreen(centers[a].x, centers[b].x)) {
            sides[a] = "Left"; sides[b] = "Right";
        } else {
            sides[a] = "Right"; sides[b] = "Left";
        }
    } else {
        unmatched.forEach(i => {
            if (freeSides.length === 0) return;
            if (freeSides.length === 1) {
                sides[i] = freeSides.pop();
            } else {
                const onLeftHalf = mirrored ? centers[i].x > 0.5 : centers[i].x < 0.5;
                sides[i] = onLeftHalf ? "Left" : "Right";
                freeSides.splice(freeSides.indexOf(sides[i]), 1);
            }
        });
    }

    const seen = { Left: false, Right: false };
    sides.forEach((s, i) => {
        if (!s) return;
        tracks[s] = { x: centers[i].x, y: centers[i].y, miss: 0 };
        seen[s] = true;
    });
    ["Left", "Right"].forEach(s => {
        if (!seen[s] && tracks[s]) {
            tracks[s].miss++;
            if (tracks[s].miss > MAX_MISS) tracks[s] = null;
        }
    });

    return sides;
}

// ================================
// ผลจากฐานข้อมูลวิดีโอ (ถ้ามี signs.js)
// ================================
const dbLoaded = typeof SIGN_DB !== "undefined" && SIGN_DB.signs.length > 0;
const DB_THRESHOLD = 0.35;     // ใช้ตอนจบท่า (ลำดับเฟรมทั้งหมด) ยิ่งน้อยยิ่งเข้มงวด
const FRAME_THRESHOLD = 0.4;   // ใช้ตอนโชว์ % สดบนกรอบมือ (เฟรมเดียว) ปรับตามค่าจริงใน Console
let recogText = "";
let recogUntil = 0;
let lastConfidence = null;   // 0-100 หรือ null

function distToPercent(d) {
    // แปลงระยะ DTW เป็นเปอร์เซ็นต์ความมั่นใจแบบคร่าว ๆ (ไม่ใช่ค่าทางสถิติจริง)
    const p = (1 - d / (DB_THRESHOLD * 2)) * 100;
    return Math.max(0, Math.min(100, Math.round(p)));
}

function onRecognized(r) {
    if (!r) return;
    console.log("DB match:", r.word, r.dist.toFixed(3));
    const percent = distToPercent(r.dist);
    lastConfidence = percent;

    if (r.dist <= DB_THRESHOLD) {
        words.push(r.word);
        renderWords();
        recogText = `🔎 ${r.word}`;
    } else {
        recogText = `🔎 ไม่แน่ใจ ใกล้เคียง "${r.word}"`;
    }
    recogUntil = Date.now() + 3000;
}

function updateConfidenceUI() {
    if (lastConfidence === null || Date.now() > recogUntil) {
        confidenceWrap.hidden = true;
        return;
    }
    confidenceWrap.hidden = false;
    confidenceText.textContent = `${lastConfidence}%`;
    confidenceFill.style.width = `${lastConfidence}%`;
}

// แสดงผลทั้งในกล่อง #sign และคำอธิบายซ้อนในจอกล้อง (caption)
function showSigns(info) {
    const rows = [];
    if (info.Left !== undefined) {
        rows.push(`<div style="color:#00a152">🖐 มือซ้าย: ${info.Left}</div>`);
    }
    if (info.Right !== undefined) {
        rows.push(`<div style="color:#1565c0">🖐 มือขวา: ${info.Right}</div>`);
    }
    if (Date.now() < recogUntil) {
        rows.push(`<div style="color:#6a1b9a">${recogText}</div>`);
    }

    sign.style.flexDirection = "column";
    sign.innerHTML = rows.length ? rows.join("") : "-";

    captionBar.textContent = rows.length
        ? rows.map(r => r.replace(/<[^>]+>/g, "")).join(" · ")
        : "ยกมือขึ้นหน้ากล้องเพื่อเริ่มตรวจจับ";

    updateConfidenceUI();
}

hands.onResults((results) => {
    if (!isRunning) return;
    if (!video.videoWidth) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const all = results.multiHandLandmarks;

    if (!all || all.length === 0) {
        assignSides([]);
        onRecognized(feedRecorder([]));
        showSigns({});
        handleSign(null);
        return;
    }

    const sides = assignSides(all);
    const info = {};
    const rawName = {};   // ชื่อท่าดิบ (ไม่มี %) ใช้สร้างประโยคเท่านั้น

    // % สดของทั้งเฟรม (ใช้เมื่อมีฐานข้อมูลวิดีโอ signs.js)
    let liveWord = null;
    let livePercent = null;
    if (dbLoaded) {
        const live = nearestFrameMatch(frameFeature(all));
        if (live) {
            liveWord = live.word;
            livePercent = Math.max(0, Math.min(100,
                Math.round((1 - live.dist / FRAME_THRESHOLD) * 100)
            ));
        }
    }

    all.forEach((landmarks, i) => {
        const side = sides[i];
        if (!side) return;

        const isRight = side === "Right";
        const color = isRight ? "#2196f3" : "#00e676";
        const label = isRight ? "มือขวา" : "มือซ้าย";

        if (dbLoaded) {
            // การจับคู่กับฐานข้อมูลเทียบทั้งเฟรม (รวมทุกมือ) จึงใช้ % เดียวกันทุกมือ
            drawHand(landmarks, color, label, livePercent);
            info[side] = livePercent !== null
                ? `${liveWord} (${livePercent}%)`
                : "กำลังตรวจจับ...";
        } else {
            const score = classifyScore(landmarks);
            drawHand(landmarks, color, label, score ? score.percent : null);

            if (score && score.percent === 100) {
                // ตรงท่าแบบเป๊ะเท่านั้นถึงนับเป็นคำในประโยค (เหมือนเดิม)
                info[side] = `${score.name} (100%)`;
                rawName[side] = score.name;
            } else {
                info[side] = score ? `ไม่รู้จักท่านี้ (${score.percent}%)` : "ไม่รู้จักท่านี้";
            }
        }
    });

    feedRecorder(all);
    showSigns(info);

    if (dbLoaded) return;

    handleSign(rawName.Right || rawName.Left || null);
});

// ================================
// LOOP
// ================================
async function loop() {
    if (!isRunning) return;

    if (!isSending && video.readyState >= 2) {
        isSending = true;
        try {
            await hands.send({ image: video });
        } catch (err) {
            console.error("hands.send error", err);
        }
        isSending = false;
    }
    requestAnimationFrame(loop);
}

// ================================
// เปิดกล้อง (ใช้ซ้ำได้ทั้งตอนเริ่มและตอนสลับหน้า/หลัง)
// ================================
async function openCamera() {
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
    }
    stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
    });
    video.srcObject = stream;
    video.classList.toggle("mirror", facingMode === "user");
    await video.play();
}

// ================================
// START / STOP
// ================================
startButton.addEventListener("click", async () => {
    if (isRunning) return;

    try {
        startButton.disabled = true;
        startButton.textContent = "⏳ กำลังโหลดโมเดล...";
        captionBar.textContent = "กำลังโหลดโมเดล (ครั้งแรกอาจใช้เวลา 5-10 วินาที)";

        if (!handsReady) {
            await hands.initialize();
            handsReady = true;
        }

        await openCamera();

        isRunning = true;
        statusEl.textContent = "● ON";
        statusEl.className = "status on";
        startButton.textContent = "✅ กำลังทำงาน";
        stopButton.disabled = false;
        captionBar.textContent = "ยกมือขึ้นหน้ากล้อง";

        loop();
    } catch (err) {
        console.error(err);
        alert(
            "เริ่มระบบไม่สำเร็จ\n\n" +
            "ตรวจสอบว่าเปิดผ่าน http://localhost หรือ https\n" +
            "และอนุญาตการใช้กล้อง\n\n" +
            String(err)
        );
        startButton.disabled = false;
        startButton.textContent = "📷 เปิดกล้อง";
        captionBar.textContent = "เปิดกล้องแล้วแสดงท่าภาษามือเพื่อขอความช่วยเหลือ";
    }
});

function stopCamera() {
    isRunning = false;

    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }
    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    statusEl.textContent = "● OFF";
    statusEl.className = "status off";
    sign.textContent = "-";
    captionBar.textContent = "เปิดกล้องแล้วแสดงท่าภาษามือเพื่อขอความช่วยเหลือ";
    startButton.textContent = "📷 เปิดกล้อง";
    startButton.disabled = false;
    stopButton.disabled = true;
    confidenceWrap.hidden = true;

    candidate = null;
    candidateCount = 0;
    resetTracks();
    resetRecorder();
}

stopButton.addEventListener("click", stopCamera);

// หยุดกล้องอัตโนมัติเมื่อสลับออกจากโหมดนี้ (ประหยัดแบตและกล้อง)
document.addEventListener("mode:leave", (e) => {
    if (e.detail === "translate" && isRunning) stopCamera();
});

// ================================
// สลับกล้องหน้า/หลัง (เหมือนกล้องมือถือ)
// ================================
flipCamBtn.addEventListener("click", async () => {
    facingMode = facingMode === "user" ? "environment" : "user";
    if (!isRunning) {
        video.classList.toggle("mirror", facingMode === "user");
        return;
    }
    try {
        await openCamera();
    } catch (err) {
        console.error(err);
        alert("สลับกล้องไม่สำเร็จ อุปกรณ์นี้อาจไม่มีกล้องอีกตัว");
        facingMode = facingMode === "user" ? "environment" : "user";
    }
});

// ================================
// SPEAK / CLEAR
// ================================
speakButton.addEventListener("click", () => {
    const text = sentence.textContent;
    if (!text || text === "-") return;

    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "th-TH";
    u.rate = 0.9;
    speechSynthesis.speak(u);
});

clearButton.addEventListener("click", () => {
    words = [];
    lastAdded = null;
    renderWords();
});

// ================================
// แสดงรายการคำศัพท์เป้าหมาย 30 คำ พร้อมสถานะว่ามีท่าให้ตรวจจับแล้วหรือยัง
// ================================
function isCovered(word) {
    if (SIGNS.some(s => s.name === word)) return "กฎนับนิ้ว";
    if (dbLoaded && SIGN_DB.signs.some(s => s.word === word)) return "ฐานข้อมูลวิดีโอ";
    return null;
}

function renderVocabList(listEl, category) {
    if (!listEl || typeof TARGET_WORDS === "undefined") return;
    listEl.innerHTML = TARGET_WORDS
        .filter(w => w.category === category)
        .map(w => {
            const via = isCovered(w.word);
            return `
                <li class="${via ? "covered" : ""}">
                    <span class="vocab-word">${via ? "✅" : "▫️"} ${w.no}. ${w.word}</span>
                    <span class="vocab-note">${via ? `(${via})` : w.note}</span>
                </li>
            `;
        }).join("");
}

renderVocabList(document.getElementById("vocabDaily"), "daily");
renderVocabList(document.getElementById("vocabEmergency"), "emergency");

// ================================
// INIT
// ================================
stopButton.disabled = true;
renderWords();