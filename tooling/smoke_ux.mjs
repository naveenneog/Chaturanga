// UX regression smoke test for the fixes (Playwright, swiftshader). Verifies undo, captured
// tray, check highlight, promotion picker, game-over modal, inspector dismissal and overlay
// coordination. Usage: node tooling/smoke_ux.mjs
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let ok = true;
const fail = (m) => { ok = false; console.log('FAIL:', m); };
const pass = (m) => console.log('ok:', m);

async function game(url) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PE ' + e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { const i = document.querySelector('#intro'); if (i) i.style.display = 'none'; });
  await page.waitForFunction(() => window.__cReady === true, { timeout: 45000 });
  await page.waitForTimeout(2500);
  return { page, errs };
}

// 1) Undo + captured (hotseat, deterministic)
{
  const { page, errs } = await game(`${base}/play.html?world=kurukshetra&mode=hotseat`);
  await page.evaluate(() => window.__c.move('e2', 'e4'));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__c.move('d7', 'd5'));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__c.move('e4', 'd5')); // exd5 capture
  await page.waitForTimeout(600);
  const cap = await page.evaluate(() => window.__c.captured());
  if (!cap.w && !cap.b) fail('captured tray empty after a capture'); else pass('captured tray populated: ' + JSON.stringify(cap));
  const before = await page.evaluate(() => window.__c.moves());
  await page.evaluate(() => window.__c.undo());
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__c.moves());
  if (after >= before) fail(`undo did not reduce move count (${before}->${after})`); else pass(`undo ok (${before}->${after})`);
  if (errs.length) fail('undo/captured console errors: ' + errs[0]);
  await page.close();
}

// 2) Check highlight
{
  const { page, errs } = await game(`${base}/play.html?world=kurukshetra&mode=hotseat`);
  const loaded = await page.evaluate(() => window.__c.load('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'));
  await page.waitForTimeout(600);
  const inCheck = await page.evaluate(() => window.__c.inCheck());
  const shown = await page.evaluate(() => window.__c.checkShown());
  if (!loaded) fail('load(fen) failed');
  if (!inCheck) fail('position should be check (Qh4+)'); else if (!shown) fail('check ring not shown'); else pass('check highlight shown');
  if (errs.length) fail('check console errors: ' + errs[0]);
  await page.close();
}

// 3) Promotion picker
{
  const { page, errs } = await game(`${base}/play.html?world=kurukshetra&mode=hotseat`);
  await page.evaluate(() => window.__c.load('8/P6k/8/8/8/8/7K/8 w - - 0 1')); // white pawn a7, promote a8
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__c.tap('a7'));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__c.tap('a8'));
  await page.waitForTimeout(500);
  const promoShown = await page.evaluate(() => document.querySelector('#promo').classList.contains('show'));
  if (!promoShown) fail('promotion picker did not appear'); else pass('promotion picker shown');
  // choose a knight (Ashva)
  await page.evaluate(() => document.querySelector('#promoRow button[data-p="n"]').click());
  await page.waitForTimeout(500);
  const promoGone = await page.evaluate(() => !document.querySelector('#promo').classList.contains('show'));
  const fen = await page.evaluate(() => window.__c.fen());
  if (!promoGone) fail('promo modal did not close'); else if (!/N/.test(fen.split(' ')[0])) fail('under-promotion to knight not applied: ' + fen); else pass('under-promotion applied');
  if (errs.length) fail('promotion console errors: ' + errs[0]);
  await page.close();
}

// 4) Game-over modal (mate in 1 -> deliver it)
{
  const { page, errs } = await game(`${base}/play.html?world=kurukshetra&mode=hotseat`);
  await page.evaluate(() => window.__c.load('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__c.move('a1', 'a8')); // Ra8#
  await page.waitForTimeout(700);
  const over = await page.evaluate(() => window.__c.gameOver());
  if (!over.shown) fail('game-over modal not shown on checkmate'); else pass('game-over modal shown: ' + over.title);
  if (errs.length) fail('game-over console errors: ' + errs[0]);
  await page.close();
}

// 5) Inspector dismissal + overlay coordination
{
  const { page, errs } = await game(`${base}/play.html?world=kurukshetra&mode=ai&side=w&level=1`);
  await page.evaluate(() => window.__c.tap('g1'));
  await page.waitForTimeout(400);
  const inspShown = await page.evaluate(() => window.__c.inspector().shown);
  await page.evaluate(() => window.__c.tap('a5')); // deselect
  await page.waitForTimeout(400);
  const inspGone = await page.evaluate(() => !window.__c.inspector().shown);
  if (!inspShown) fail('inspector did not show on select'); else if (!inspGone) fail('inspector did not dismiss on deselect'); else pass('inspector shows then dismisses');
  if (errs.length) fail('inspector console errors: ' + errs[0]);
  await page.close();
}

console.log(ok ? 'SMOKE_UX_PASS' : 'SMOKE_UX_FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
