// Smoke test for the lobby, the openings trainer, and a second world (Playwright, swiftshader).
// Usage: node tooling/smoke2.mjs
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const browser = await chromium.launch({
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let ok = true;
const fail = (m) => { ok = false; console.log('FAIL:', m); };

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  return { page, errors };
}

// 1) Lobby renders worlds, levels, openings
{
  const { page, errors } = await newPage();
  await page.goto(`${base}/setup.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const counts = await page.evaluate(() => ({
    worlds: document.querySelectorAll('#worlds .world').length,
    levels: document.querySelectorAll('#levels .lvl').length,
    openings: document.querySelectorAll('#openings .op').length,
  }));
  console.log('lobby counts', JSON.stringify(counts));
  if (counts.worlds < 2) fail('lobby: fewer than 2 worlds');
  if (counts.levels !== 5) fail('lobby: expected 5 levels');
  if (counts.openings < 6) fail('lobby: expected >=6 openings');
  if (errors.length) fail('lobby console errors: ' + errors[0]);
  await page.close();
}

// 2) Openings trainer auto-plays a booked line
{
  const { page, errors } = await newPage();
  await page.goto(`${base}/play.html?world=kurukshetra&mode=ai&side=w&level=1&train=italian`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { const i = document.querySelector('#intro'); if (i) i.style.display = 'none'; });
  await page.waitForFunction(() => window.__cReady === true, { timeout: 45000 }).catch(() => fail('trainer: __cReady timeout'));
  // trainer should push several booked moves automatically
  const grew = await page.waitForFunction(() => {
    const f = window.__c.fen();
    return f && f !== 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' && !f.startsWith('rnbqkbnr/pppppppp');
  }, { timeout: 20000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(1000);
  const openingShown = await page.evaluate(() => document.querySelector('#opening').classList.contains('show'));
  console.log('trainer moved:', grew, 'opening badge:', openingShown);
  if (!grew) fail('trainer: no booked moves were played');
  if (errors.length) fail('trainer console errors: ' + errors[0]);
  await page.close();
}

// 3) Second world (Ramayana) loads and renders
{
  const { page, errors } = await newPage();
  await page.goto(`${base}/play.html?world=ramayana&mode=hotseat`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { const i = document.querySelector('#intro'); if (i) i.style.display = 'none'; });
  await page.waitForFunction(() => window.__cReady === true, { timeout: 45000 }).catch(() => fail('ramayana: __cReady timeout'));
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => ({ title: document.title, mode: window.__c.mode(), tris: window.__c.info().tris }));
  console.log('ramayana', JSON.stringify(info));
  if (!/Lanka|Ramayana/i.test(info.title)) fail('ramayana: title not set');
  if (info.mode !== 'hotseat') fail('ramayana: hotseat mode not applied');
  if (errors.length) fail('ramayana console errors: ' + errors[0]);
  await page.close();
}

console.log(ok ? 'SMOKE2_PASS' : 'SMOKE2_FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
