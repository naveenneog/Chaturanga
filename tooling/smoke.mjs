// Functional smoke test for the Chaturanga game (Playwright, swiftshader).
// Loads a vs-AI game, plays a human move, verifies the AI replies, checks the piece
// inspector + coach hint + eye view, and reports console errors. Screenshots at the end.
// Usage: node tooling/smoke.mjs [outPrefix] [world]
import { chromium } from 'playwright';

const prefix = process.argv[2] || 'tooling/hunyuan_out/smoke';
const world = process.argv[3] || 'kurukshetra';
const URL = `http://localhost:5174/play.html?world=${world}&mode=ai&side=w&level=2`;

const browser = await chromium.launch({
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-gl=angle',
         '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

const fail = (m) => { console.log('FAIL:', m); };
let ok = true;

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { const i = document.querySelector('#intro'); if (i) i.style.display = 'none'; });
try { await page.waitForFunction(() => window.__cReady === true, { timeout: 45000 }); console.log('__cReady OK'); }
catch { ok = false; fail('__cReady timeout (board did not init)'); }
await page.waitForTimeout(3500);

// mode / level wired?
const meta = await page.evaluate(() => ({ mode: window.__c.mode(), level: window.__c.level(), human: window.__c.human() }));
console.log('meta', JSON.stringify(meta));
if (meta.mode !== 'ai' || meta.level !== 2) { ok = false; fail('mode/level not read from URL'); }

// human plays 1.e4, AI (black) should reply within a few seconds -> turn returns to white
await page.evaluate(() => window.__c.move('e2', 'e4'));
let replied = false;
try {
  await page.waitForFunction(() => window.__c.turn() === 'w' && !window.__c.aiThinking(), { timeout: 15000 });
  replied = true;
} catch { }
const afterFen = await page.evaluate(() => window.__c.fen());
console.log('after AI reply, fen =', afterFen);
if (!replied) { ok = false; fail('AI did not reply to 1.e4'); } else console.log('AI replied OK');

// inspector: select a piece and confirm the panel shows a name
await page.evaluate(() => window.__c.tap('d2'));
await page.waitForTimeout(600);
const insp = await page.evaluate(() => window.__c.inspector());
console.log('inspector', JSON.stringify(insp));
if (!insp.shown || !insp.name) { ok = false; fail('inspector did not show for selected piece'); }

// hint button produces a coach message
await page.evaluate(() => document.querySelector('#hintBtn').click());
await page.waitForTimeout(1500);
const coachShown = await page.evaluate(() => document.querySelector('#coach').classList.contains('show'));
console.log('coach hint shown', coachShown);
if (!coachShown) { ok = false; fail('hint did not surface a coach message'); }

// eye view toggles
await page.evaluate(() => document.querySelector('#eyeBtn').click());
await page.waitForTimeout(400);
const view = await page.evaluate(() => window.__c.view());
console.log('view after eye toggle', view);

await page.screenshot({ path: `${prefix}.png`, animations: 'disabled' }).catch(() => {});
console.log('CONSOLE_ERRORS', errors.length);
errors.slice(0, 15).forEach((e) => console.log('  ', e));
console.log(ok && errors.length === 0 ? 'SMOKE_PASS' : 'SMOKE_FAIL');
await browser.close();
process.exit(ok && errors.length === 0 ? 0 : 1);
