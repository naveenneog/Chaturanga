// Playwright board screenshot QA. Renders play.html, dismisses the intro, waits for
// models, captures console errors, and shoots a few angles.
// Usage: node tooling/shot.mjs [outPrefix] [world]
import { chromium } from 'playwright';

const prefix = process.argv[2] || 'tooling/TripoSR/out256/board';
const world = process.argv[3] || 'kurukshetra';
const URL = `http://localhost:5174/play.html?world=${world}`;

const browser = await chromium.launch({
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-gl=angle',
         '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
// force-hide the cinematic intro so the board is visible in headless
await page.evaluate(() => { const i = document.querySelector('#intro'); if (i) i.style.display = 'none'; });
const gl = await page.evaluate(() => {
  try { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl');
    return g ? g.getParameter(g.VERSION) : 'no-webgl'; } catch (e) { return 'err ' + e.message; }
});
console.log('WEBGL', gl);
try { await page.waitForFunction(() => window.__cReady === true, { timeout: 45000 }); console.log('__cReady OK'); }
catch { console.log('WARN __cReady timeout'); }
await page.waitForTimeout(4000); // let glTF models + env map settle

async function shot(name) {
  try {
    await page.screenshot({ path: `${prefix}.${name}.png`, timeout: 90000, animations: 'disabled' });
    console.log('shot', `${prefix}.${name}.png`);
  } catch (e) { console.log('SHOT FAIL', name, e.message); }
}
await shot('start');

// orbit a bit via the debug hook if present, else just re-shoot
try {
  await page.evaluate(() => { if (window.__c && window.__c.view) window.__c.view({ theta: Math.PI / 2, phi: 1.05, r: 12 }); });
  await page.waitForTimeout(1200); await shot('near');
} catch {}

console.log('CONSOLE_ERRORS', errors.length);
errors.slice(0, 15).forEach((e) => console.log('  ', e));
await browser.close();
