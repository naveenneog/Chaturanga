import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Chess } from '../web/vendor/chess.js';
import {
  evaluateBoard, analyze, bestMove, classifyMove, levelById, LEVELS,
} from '../web/js/engine.js';

test('evaluateBoard is symmetric (0) at the start', () => {
  const g = new Chess();
  assert.equal(evaluateBoard(g), 0);
});

test('analyze returns a legal best move from the start', () => {
  const a = analyze(new Chess().fen(), { depth: 2, maxMs: 500 });
  assert.ok(a.best, 'has a best move');
  const legal = new Chess().moves({ verbose: true })
    .some((m) => m.from === a.best.move.from && m.to === a.best.move.to);
  assert.ok(legal, 'best move is legal');
});

test('engine grabs a free hanging queen', () => {
  // White Qd1, Black Qd4 undefended on the same file -> Qxd4 wins a queen.
  const fen = '4k3/8/8/8/3q4/8/P7/3QK3 w - - 0 1';
  const r = bestMove(fen, 3, () => 0.99); // rng high so no blunder branch
  assert.equal(r.move.from, 'd1');
  assert.equal(r.move.to, 'd4');
});

test('engine finds mate in one (back-rank)', () => {
  // Ra1-a8 is checkmate (black king boxed in by its own pawns).
  const fen = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
  const r = bestMove(fen, 4, () => 0.99);
  assert.equal(r.move.to, 'a8');
  const g = new Chess(fen);
  g.move({ from: r.move.from, to: r.move.to });
  assert.ok(g.isCheckmate(), 'the chosen move is mate');
});

test('classifyMove: taking the free queen is best; a quiet pawn push is a blunder', () => {
  const fen = '4k3/8/8/8/3q4/8/P7/3QK3 w - - 0 1';
  const good = classifyMove(fen, { from: 'd1', to: 'd4' }, { depth: 3, maxMs: 600 });
  assert.equal(good.verdict, 'best');
  const bad = classifyMove(fen, { from: 'a2', to: 'a3' }, { depth: 3, maxMs: 600 });
  assert.ok(bad.lost > 300, `expected big loss, got ${bad.lost}`);
  assert.equal(bad.verdict, 'blunder');
  assert.equal(bad.best.to, 'd4');
});

test('levels are ordered and resolvable', () => {
  assert.equal(LEVELS.length, 5);
  assert.equal(levelById(1).name, 'Padati');
  assert.equal(levelById(5).name, 'Mantri');
  for (let i = 1; i < LEVELS.length; i++) {
    assert.ok(LEVELS[i].depth >= LEVELS[i - 1].depth, 'depth non-decreasing');
    assert.ok(LEVELS[i].blunder <= LEVELS[i - 1].blunder, 'blunder non-increasing');
  }
});

test('a strong level plays a legal, non-null move in a middlegame', () => {
  const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 3';
  const r = bestMove(fen, 4, () => 0.99);
  assert.ok(r && r.move, 'returns a move');
  const legal = new Chess(fen).moves({ verbose: true })
    .some((m) => m.from === r.move.from && m.to === r.move.to);
  assert.ok(legal, 'move is legal');
});

// Regression: a search that TIMES OUT before the first depth completes must not corrupt the shared
// board and leak an opponent's reply as the "best" root move. (Previously halted AI auto-play.)
test('analyze under an impossibly tight time budget still returns a LEGAL root move', () => {
  const fens = [
    'r2q1rk1/pppb1ppp/2nb1n2/3pp3/3P4/2NBPN2/PPP2PPP/R1BQ1RK1 w - - 0 9', // the exact failing position
    'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 4',
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
  ];
  for (const fen of fens) {
    const legal = new Chess(fen).moves({ verbose: true });
    for (let i = 0; i < 8; i++) {
      const a = analyze(fen, { depth: 5, maxMs: 1, quiesce: true }); // maxMs:1 forces the fallback
      assert.ok(a.best, `has a best move for ${fen}`);
      const ok = legal.some((m) => m.from === a.best.move.from && m.to === a.best.move.to);
      assert.ok(ok, `fallback move ${a.best.move.from}${a.best.move.to} is legal for ${fen}`);
    }
  }
});

// Regression: every level must produce a legal move for the mover across a full self-played game.
test('self-play at level 4 never yields an illegal move', () => {
  const g = new Chess();
  for (let i = 0; i < 40 && !g.isGameOver(); i++) {
    const r = bestMove(g.fen(), 4);
    assert.ok(r && r.move, `move ${i} is non-null`);
    const legal = g.moves({ verbose: true }).some((m) => m.from === r.move.from && m.to === r.move.to);
    assert.ok(legal, `move ${i} (${r.move.from}${r.move.to}) is legal for ${g.fen()}`);
    const mv = { from: r.move.from, to: r.move.to };
    if (r.move.promotion) mv.promotion = r.move.promotion;
    g.move(mv);
  }
});
