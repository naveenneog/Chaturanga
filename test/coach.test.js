import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OPENINGS, detectOpening, openingById } from '../web/js/openings.js';
import { hint, reviewMove, describeMove, openingNote, openingStep } from '../web/js/coach.js';

test('every opening line is legal and self-consistent', async () => {
  const { Chess } = await import('../web/vendor/chess.js');
  for (const o of OPENINGS) {
    const g = new Chess();
    for (const step of o.line) {
      const m = g.move(step.san);
      assert.ok(m, `${o.name}: illegal booked move ${step.san}`);
      assert.equal(m.color, step.by, `${o.name}: ${step.san} wrong side`);
      assert.ok(step.note && step.note.length > 0, `${o.name}: ${step.san} missing note`);
    }
  }
});

test('detectOpening recognises the Italian Game', () => {
  const d = detectOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
  assert.ok(d);
  assert.equal(d.opening.id, 'italian');
  assert.equal(d.plies, 5);
});

test('openingNote returns a themed teaching', () => {
  const n = openingNote(['e4', 'c5']);
  assert.equal(n.id, 'sicilian');
  assert.ok(n.note.length > 0);
});

test('openingStep walks a booked line', () => {
  const s = openingStep('ruylopez', 4);
  assert.equal(s.san, 'Bb5');
  assert.equal(s.index, 4);
  assert.ok(s.total >= 6);
});

test('hint points at the free queen with a capture rationale', () => {
  const fen = '4k3/8/8/8/3q4/8/P7/3QK3 w - - 0 1';
  const h = hint(fen, 3);
  assert.equal(h.to, 'd4');
  assert.match(h.why, /Capture/);
});

test('reviewMove flags a blunder and names the stronger move', () => {
  const fen = '4k3/8/8/8/3q4/8/P7/3QK3 w - - 0 1';
  const r = reviewMove(fen, { from: 'a2', to: 'a3' }, { depth: 3, maxMs: 600 });
  assert.equal(r.verdict, 'blunder');
  assert.equal(r.tone, 'warn');
  assert.match(r.message, /Qxd4/);
});

test('reviewMove stays quiet on a fine move unless asked', () => {
  const fen = '4k3/8/8/8/3q4/8/P7/3QK3 w - - 0 1';
  assert.equal(reviewMove(fen, { from: 'd1', to: 'd4' }, { depth: 3, maxMs: 600 }), null);
});

test('describeMove recognises castling and development', async () => {
  const { Chess } = await import('../web/vendor/chess.js');
  const castleFen = 'rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1';
  assert.match(describeMove(castleFen, { from: 'e1', to: 'g1', flags: 'k', piece: 'k' }), /Castle/);
  assert.match(describeMove(new Chess().fen(), { from: 'g1', to: 'f3', piece: 'n' }), /Develop/);
});
