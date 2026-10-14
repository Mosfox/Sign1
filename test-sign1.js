const { chromium } = require('playwright');
const { spawn } = require('child_process');

const HANDS_STUB = `
window.Hands = class { constructor(){window.__hands=this;} setOptions(){} onResults(cb){this.cb=cb;} async initialize(){} async send(){} };
`;
const PEER_STUB = `
window.Peer = class {
  constructor(){ this.open=false; this.id='ROOM-'+Math.random().toString(36).slice(2,8).toUpperCase(); this.h={}; this.destroyed=false;
    setTimeout(()=>{this.open=true; (this.h.open||[]).forEach(f=>f(this.id));},60); }
  on(e,f){(this.h[e]=this.h[e]||[]).push(f);}
  once(e,f){const w=(...a)=>{this.h[e]=this.h[e].filter(x=>x!==w); f(...a);}; this.on(e,w);}
  call(){ return {on(){}, close(){}}; }
  destroy(){this.destroyed=true;}
};
`;
const MATCHER_STUB = `
window.__emit=null;
function feedRecorder(all){ return (all.length===0) ? window.__emit : null; }
function resetRecorder(){}
function nearestFrameMatch(){ return null; }
function frameFeature(){ return []; }
`;
const SIGNS_STUB = `const SIGN_DB={signs:[{word:'ช่วยด้วย'}]};`;

function serve(dir, port) {
  return spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: dir, stdio: 'ignore' });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function newPage(browser, url, { withMatcher = false, withSigns = false } = {}) {
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const page = await ctx.newPage();
  page.errors = []; page.setDefaultTimeout(4000);
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('dialog', d => { page.lastDialog = d.message(); d.dismiss(); });
  await page.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: HANDS_STUB }));
  await page.route('**/unpkg.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PEER_STUB }));
  if (withMatcher) {
    await page.route('**/matcher.js', r => r.fulfill({ contentType: 'application/javascript', body: MATCHER_STUB }));
  }
  if (withSigns) await page.route('**/signs.js', r => r.fulfill({ contentType: 'application/javascript', body: SIGNS_STUB }));
  await page.goto(url);
  return page;
}

const gotoMode = (page, m) => page.evaluate(m => document.querySelector(`.menu-item[data-mode="${m}"]`).click(), m);

// ---------- ทดสอบ XSS / ผู้ติดต่อฉุกเฉิน ----------
async function testEmergency(browser, url, label) {
  const out = [];
  const page = await newPage(browser, url);
  await gotoMode(page, 'emergency');
  await page.fill('#contactName', '<img src=x onerror="window.__xss=1">');
  await page.fill('#contactPhone', '0812345678" onmouseover="window.__xss=2');
  await page.click('#contactForm button[type=submit]');
  await sleep(200);
  const injected = await page.evaluate(() => ({
    imgCount: document.querySelectorAll('#customContacts img').length,
    xss: window.__xss || 0,
    attrs: [...document.querySelectorAll('#customContacts a')].map(a => a.getAttributeNames().join(',')),
    href: [...document.querySelectorAll('#customContacts a')].map(a => a.getAttribute('href')),
  }));
  out.push(['แทรก <img onerror> ผ่านชื่อ → ไม่มี element แทรก/ไม่รันสคริปต์', injected.imgCount === 0 && injected.xss === 0, JSON.stringify(injected)]);
  out.push(['หลุดออกจาก attribute href ไม่ได้ (a มีแค่ href)', injected.attrs.every(a => a === 'href'), '']);

  // ข้อมูลอันตรายที่ค้างอยู่ใน localStorage จากเวอร์ชันเก่า
  await page.evaluate(() => localStorage.setItem('thsl_emergency_contacts',
    JSON.stringify([{ name: '<img src=x onerror="window.__xss=3">', phone: '1" onfocus="x' }, { name: 'แม่', phone: '081-234-5678' }, 'junk', null])));
  await page.reload(); await gotoMode(page, 'emergency'); await sleep(200);
  const loaded = await page.evaluate(() => ({
    xss: window.__xss || 0,
    imgs: document.querySelectorAll('#customContacts img').length,
    rows: [...document.querySelectorAll('.contact-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()),
    href: [...document.querySelectorAll('.contact-row a')].map(a => a.getAttribute('href')),
  }));
  out.push(['ข้อมูลอันตรายเก่าใน localStorage ถูกกรองตอนโหลด', loaded.xss === 0 && loaded.imgs === 0, JSON.stringify(loaded)]);
  out.push(['ผู้ติดต่อปกติ "แม่" ยังแสดงและโทรได้ (tel:0812345678)', loaded.href.includes('tel:0812345678'), '']);

  // เบอร์ไม่ถูกต้อง
  await page.fill('#contactName', 'ทดสอบ'); await page.fill('#contactPhone', 'abc');
  await page.click('#contactForm button[type=submit]'); await sleep(200);
  const n1 = await page.evaluate(() => document.querySelectorAll('.contact-row').length);
  out.push(['เบอร์ "abc" ถูกปฏิเสธ + แจ้งเตือน', n1 === 1 && !!page.lastDialog, page.lastDialog || '']);

  // ลบ + คงอยู่หลังรีโหลด
  await page.click('.delContact'); await sleep(100);
  await page.reload(); await gotoMode(page, 'emergency'); await sleep(200);
  const n2 = await page.evaluate(() => document.querySelectorAll('.contact-row').length);
  out.push(['ลบแล้วหลังรีโหลดไม่กลับมา', n2 === 0, '']);
  await page.context().close();
  return out;
}

// ---------- ทดสอบห้องคู่สนทนา ----------
async function testCall(browser, url) {
  const out = [];
  const page = await newPage(browser, url);
  await gotoMode(page, 'call');
  await page.click('#createRoomBtn'); await sleep(500);
  const first = await page.textContent('#roomInfo');
  await page.click('#createRoomBtn'); await sleep(500);
  const second = await page.textContent('#roomInfo');
  out.push(['กด "สร้างห้อง" ครั้งแรกได้รหัส', /ROOM-/.test(first), first.trim().replace(/\s+/g, ' ')]);
  out.push(['กด "สร้างห้อง" ซ้ำ ยังได้รหัส (ไม่ค้าง)', /ROOM-/.test(second), second.trim().replace(/\s+/g, ' ')]);
  // เข้าร่วมห้อง
  await page.fill('#joinRoomInput', 'ROOM-XYZ'); await page.click('#joinRoomBtn'); await sleep(400);
  out.push(['เข้าร่วมห้องแสดงสถานะเชื่อมต่อ', /เชื่อมต่อกับคู่สนทนาแล้ว/.test(await page.textContent('#roomInfo')), '']);
  await page.click('#callEndBtn'); await sleep(200);
  out.push(['จบการเชื่อมต่อแล้วปุ่มกลับสถานะปกติ', await page.isEnabled('#callStartCam'), '']);
  out.push(['ไม่มี JS error', page.errors.length === 0, page.errors.join(' | ')]);
  await page.context().close();
  return out;
}

// ---------- ทดสอบโหมดแปลภาษามือ ----------
const LM_GEN = `
window.mk = (p) => { const pts = Array.from({length:21},()=>({x:0.5,y:0.6,z:0}));
  pts[0]={x:0.5,y:0.9,z:0}; pts[9]={x:0.5,y:0.7,z:0}; pts[17]={x:0.58,y:0.85,z:0}; pts[3]={x:0.4,y:0.85,z:0};
  pts[4]= p[0] ? {x:0.2,y:0.8,z:0} : {x:0.45,y:0.84,z:0};
  [[8,6],[12,10],[16,14],[20,18]].forEach(([t,pip],k)=>{ const x=0.4+0.05*k;
    pts[pip]={x,y:0.7,z:0}; pts[t]= p[k+1] ? {x,y:0.4,z:0} : {x,y:0.8,z:0}; });
  return pts; };
window.feed = (pattern, n) => { for (let i=0;i<n;i++) window.__hands.cb({multiHandLandmarks: pattern ? [window.mk(pattern)] : []}); };
`;

async function testTranslate(browser, url, { withMatcher, withSigns = false }) {
  const out = [];
  const page = await newPage(browser, url, { withMatcher, withSigns });
  await page.evaluate(LM_GEN);
  await page.click('#startButton'); await sleep(1500);
  out.push(['เปิดกล้องได้ (ON)', /ON/.test(await page.textContent('#status')), '']);
  const words = () => page.evaluate(() => document.getElementById('sentence').textContent);
  const feed = async (pat, n) => { try { await page.evaluate(([p, n]) => window.feed(p, n), [pat, n]); } catch (e) { return e.message.split('\n')[0]; } return null; };
  const OPEN = [1,1,1,1,1], FIST = [0,0,0,0,0];

  if (!withSigns) {
  let err = await feed(OPEN, 15);
  out.push(['แบมือ 15 เฟรม → ได้คำ "ช่วยด้วย"', (await words()) === 'ช่วยด้วย', `sentence="${await words()}" ${err || ''}`]);
  if (!err) {
    await feed(OPEN, 40);
    out.push(['ค้างท่าต่อ ไม่เพิ่มคำซ้ำ', (await words()) === 'ช่วยด้วย', `sentence="${await words()}"`]);
    await feed(null, 3); await sleep(1600); await feed(OPEN, 15);
    out.push(['มือแว้บหาย 3 เฟรมแล้วกลับมา → ไม่นับเป็นคำใหม่', (await words()) === 'ช่วยด้วย', `sentence="${await words()}"`]);
    await feed(null, 10); await sleep(1600); await feed(OPEN, 15);
    out.push(['ปล่อยท่าจริง (10 เฟรม) แล้วทำซ้ำ → "ช่วยด้วย ช่วยด้วย"', (await words()) === 'ช่วยด้วย ช่วยด้วย', `sentence="${await words()}"`]);
    await feed(null, 10); await sleep(1600); await feed(FIST, 15);
    out.push(['เปลี่ยนท่าเป็นกำมือ → ต่อท้าย "เจ็บ"', (await words()) === 'ช่วยด้วย ช่วยด้วย เจ็บ', `sentence="${await words()}"`]);
    await page.click('#clearButton');
    await feed(null, 10); await sleep(1600); await feed(OPEN, 15);
    out.push(['กดล้างแล้วเริ่มใหม่ได้', (await words()) === 'ช่วยด้วย', `sentence="${await words()}"`]);
  }
  }
  await page.click('#stopButton'); await sleep(200);
  out.push(['กดหยุดได้ (OFF)', /OFF/.test(await page.textContent('#status')), '']);

  if (withSigns) {
    // โหมดฐานข้อมูลวิดีโอ: onRecognized ต้องไม่เพิ่มคำเดิมรัว ๆ
    await page.click('#clearButton');
    await page.click('#startButton'); await sleep(1200);
    await page.evaluate(() => { window.__emit = { word: 'ช่วยด้วย', dist: 0.1 }; });
    await feed(null, 8);
    out.push(['[ฐานข้อมูล] ผลจับคู่เด้งรัว 8 ครั้ง → ได้ 1 คำ', (await words()) === 'ช่วยด้วย', `sentence="${await words()}"`]);
    await page.evaluate(() => { window.__emit = null; });
    await feed(null, 3); await sleep(2700);
    await page.evaluate(() => { window.__emit = { word: 'ช่วยด้วย', dist: 0.1 }; });
    await feed(null, 3);
    out.push(['[ฐานข้อมูล] ทำท่าเดิมอีกครั้งหลังพัก >2.5 วินาที → นับเป็นคำใหม่', (await words()) === 'ช่วยด้วย ช่วยด้วย', `sentence="${await words()}"`]);
  }
  out.push(['ไม่มี JS error ในหน้า', page.errors.length === 0, page.errors.slice(0, 2).join(' | ')]);
  await page.context().close();
  return out;
}

(async () => {
  const servers = [serve('/home/claude/Sign1-main', 8765), serve('/home/claude/Sign1-orig', 8766)];
  await sleep(800);
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const suites = [
    ['แก้แล้ว', 'http://127.0.0.1:8765/index.html'],
    ['โค้ดเดิม', 'http://127.0.0.1:8766/index.html'],
  ];
  const safe = async (fn) => { try { return await fn(); } catch (e) { return [['(ทดสอบรันไม่จบ: ' + e.message.split('\n')[0] + ')', false, '']]; } };
  const show = (title, rows) => { console.log('\n' + title); rows.forEach(([n, ok, d]) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d && !ok ? '\n        ↳ ' + d : ''}`)); };
  for (const [name, url] of suites) {
    console.log('\n================ ' + name + ' ================');
    show('[ผู้ติดต่อฉุกเฉิน / XSS]', await safe(() => testEmergency(browser, url)));
    show('[คู่สนทนา]', await safe(() => testCall(browser, url)));
    show('[แปลภาษามือ — ไม่มี matcher.js/signs.js (เหมือนใน zip)]', await safe(() => testTranslate(browser, url, { withMatcher: false })));
    if (name === 'แก้แล้ว') {
      show('[แปลภาษามือ — มี matcher.js แต่ไม่มี signs.js (กฎนับนิ้ว + recorder)]', await safe(() => testTranslate(browser, url, { withMatcher: true })));
      show('[แปลภาษามือ — มี matcher.js + signs.js (โหมดฐานข้อมูลวิดีโอ)]', await safe(() => testTranslate(browser, url, { withMatcher: true, withSigns: true })));
    }
  }
  await browser.close(); servers.forEach(s => s.kill());
})();
