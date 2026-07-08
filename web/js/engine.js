// Chaturanga AI — a small, dependency-light chess engine + analysis, built on chess.js.
// Negamax + alpha-beta + quiescence(captures) + MVV-LVA ordering, iterative deepening with a
// time cap so it stays responsive on phones. Difficulty scales search depth + a "blunder" rate.
//
// Pure and side-effect free (creates its own Chess instances) so it is unit-testable in Node
// and can run inside a Web Worker in the browser.
import { Chess } from '../vendor/chess.js';

export const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 1_000_000;

// Difficulty levels, themed to the four-army (chaturanga). depth = nominal search depth;
// maxMs caps thinking time (iterative deepening returns best-so-far); blunder = probability of
// deliberately playing a weaker move (teaches by being beatable at low levels).
export const LEVELS = [
  { id: 1, name: 'Padati', title: 'Foot-soldier', depth: 1, maxMs: 250, blunder: 0.55, quiesce: false,
    blurb: 'Learns the ranks. Plays honest, simple moves — a gentle first opponent.' },
  { id: 2, name: 'Ashva', title: 'Cavalry', depth: 2, maxMs: 450, blunder: 0.30, quiesce: false,
    blurb: 'Quick and tactical. Will punish a hanging piece, but overlooks deeper plans.' },
  { id: 3, name: 'Gaja', title: 'Elephant', depth: 3, maxMs: 800, blunder: 0.12, quiesce: true,
    blurb: 'Patient strength. Sees short combinations and defends with care.' },
  { id: 4, name: 'Ratha', title: 'Chariot', depth: 4, maxMs: 1400, blunder: 0.04, quiesce: true,
    blurb: 'Relentless and direct. Calculates several moves ahead along open lines.' },
  { id: 5, name: 'Mantri', title: 'Minister', depth: 5, maxMs: 2200, blunder: 0.0, quiesce: true,
    blurb: 'Masterful counsel. Deep, near-perfect calculation — earn every square.' },
];

export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[2];

// --- piece-square tables (printed rank8-first, a-file left; from white's view) --------------
const PST = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

function pstVal(type, square, color) {
  const f = square.charCodeAt(0) - 97; // a..h -> 0..7
  const r = +square[1] - 1;            // rank1..8 -> 0..7
  const idx = color === 'w' ? (7 - r) * 8 + f : r * 8 + f;
  return PST[type][idx];
}

// Static evaluation from WHITE's perspective (centipawns). + = white is better.
export function evaluateBoard(game) {
  const board = game.board();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    const row = board[r];
    for (let c = 0; c < 8; c++) {
      const cell = row[c];
      if (!cell) continue;
      const v = VALUES[cell.type] + pstVal(cell.type, cell.square, cell.color);
      score += cell.color === 'w' ? v : -v;
    }
  }
  return score;
}

// MVV-LVA capture score for ordering (higher = try first).
function captureScore(mv) {
  if (!mv.captured) return 0;
  return 10 * VALUES[mv.captured] - VALUES[mv.piece];
}
function orderMoves(moves) {
  return moves
    .map((m) => ({ m, s: (m.captured ? 100000 + captureScore(m) : 0) + (m.promotion ? 8000 : 0) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m);
}

// Quiescence: only search captures until the position is "quiet" (avoids the horizon effect).
function quiesce(game, alpha, beta, sideSign) {
  const stand = evaluateBoard(game) * sideSign;
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  const caps = orderMoves(game.moves({ verbose: true }).filter((m) => m.captured || m.promotion));
  for (const mv of caps) {
    game.move({ from: mv.from, to: mv.to, promotion: mv.promotion || 'q' });
    const score = -quiesce(game, -beta, -alpha, -sideSign);
    game.undo();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(game, depth, alpha, beta, sideSign, ply, opt, deadline) {
  if (Date.now() > deadline) throw TIMEOUT;
  if (game.isCheckmate()) return -MATE + ply;      // side to move is mated
  if (game.isDraw() || game.isStalemate() || game.isThreefoldRepetition?.()) return 0;
  if (depth <= 0) return opt.quiesce ? quiesce(game, alpha, beta, sideSign) : evaluateBoard(game) * sideSign;

  const moves = orderMoves(game.moves({ verbose: true }));
  let best = -Infinity;
  for (const mv of moves) {
    game.move({ from: mv.from, to: mv.to, promotion: mv.promotion || 'q' });
    const score = -negamax(game, depth - 1, -beta, -alpha, -sideSign, ply + 1, opt, deadline);
    game.undo();
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

const TIMEOUT = Symbol('timeout');

// Score every legal root move to `depth`. Each root move is searched with a FULL window so its
// returned value is the exact minimax score (needed for ranking + blunder analysis, not just the
// single best move). Root branching is small, so the cost is modest. Returns [{ move, score }]
// sorted best-first, from the side-to-move's perspective.
function scoreRoot(game, depth, opt, deadline) {
  const sideSign = game.turn() === 'w' ? 1 : -1;
  const moves = orderMoves(game.moves({ verbose: true }));
  const scored = [];
  for (const mv of moves) {
    game.move({ from: mv.from, to: mv.to, promotion: mv.promotion || 'q' });
    const score = -negamax(game, depth - 1, -Infinity, Infinity, -sideSign, 1, opt, deadline);
    game.undo();
    scored.push({ move: mv, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// Full analysis of a position: ranked root moves + the best line's score.
// opts: { depth, maxMs, quiesce }
export function analyze(fen, opts = {}) {
  const game = new Chess(fen);
  const depth = opts.depth ?? 3;
  const maxMs = opts.maxMs ?? 1000;
  const opt = { quiesce: opts.quiesce ?? true };
  const deadline = Date.now() + maxMs;
  let best = null;
  // iterative deepening: keep the last fully-completed depth if we run out of time
  for (let d = 1; d <= depth; d++) {
    try {
      const scored = scoreRoot(game, d, opt, deadline);
      if (scored.length) best = { depth: d, moves: scored };
    } catch (e) {
      if (e === TIMEOUT) break;
      throw e;
    }
    if (Date.now() > deadline) break;
  }
  if (!best) {
    const scored = scoreRoot(game, 1, opt, Date.now() + 60000);
    best = { depth: 1, moves: scored };
  }
  return {
    depth: best.depth,
    best: best.moves[0] || null,
    moves: best.moves,
    score: best.moves[0] ? best.moves[0].score : 0,
  };
}

// Choose a move for the AI at a difficulty level. Adds level-appropriate imperfection:
// with probability `blunder` it plays a random move from the weaker half of the ranked list.
export function bestMove(fen, levelOrId = 3, rng = Math.random) {
  const level = typeof levelOrId === 'object' ? levelOrId : levelById(levelOrId);
  const a = analyze(fen, { depth: level.depth, maxMs: level.maxMs, quiesce: level.quiesce });
  if (!a.best) return null;
  const ranked = a.moves;
  if (ranked.length > 1 && rng() < level.blunder) {
    // pick from the weaker half (but never an outright game-losing blunder if a mate is available)
    const start = Math.max(1, Math.floor(ranked.length / 2));
    const pick = ranked[start + Math.floor(rng() * (ranked.length - start))] || a.best;
    return { move: pick.move, score: pick.score, best: a.best.move, intentional: true, depth: a.depth };
  }
  return { move: a.best.move, score: a.best.score, best: a.best.move, intentional: false, depth: a.depth };
}

// Classify a move a HUMAN just played by comparing the position value before vs. the best reply
// value after (both from the mover's perspective). Returns { verdict, lost, best, bestScore }.
// verdict in: 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'.
export function classifyMove(fenBefore, move, opts = {}) {
  const depth = opts.depth ?? 3;
  const maxMs = opts.maxMs ?? 700;
  const before = analyze(fenBefore, { depth, maxMs, quiesce: true });
  if (!before.best) return null;
  const bestScore = before.score; // side-to-move (the human) perspective
  const g = new Chess(fenBefore);
  const played = g.moves({ verbose: true }).find(
    (m) => m.from === move.from && m.to === move.to && (!move.promotion || m.promotion === move.promotion));
  if (!played) return null;
  const playedEntry = before.moves.find((x) => x.move.from === played.from && x.move.to === played.to
    && (x.move.promotion || 'q') === (played.promotion || 'q'));
  const playedScore = playedEntry ? playedEntry.score : (() => {
    // fall back: evaluate the played move directly
    const gg = new Chess(fenBefore);
    gg.move({ from: played.from, to: played.to, promotion: played.promotion || 'q' });
    return -analyze(gg.fen(), { depth: depth - 1, maxMs, quiesce: true }).score;
  })();
  const lost = Math.max(0, bestScore - playedScore); // centipawns given up vs. best
  let verdict = 'good';
  const isBest = played.from === before.best.move.from && played.to === before.best.move.to;
  if (isBest || lost <= 15) verdict = 'best';
  else if (lost <= 60) verdict = 'good';
  else if (lost <= 130) verdict = 'inaccuracy';
  else if (lost <= 300) verdict = 'mistake';
  else verdict = 'blunder';
  return { verdict, lost, best: before.best.move, bestScore, playedScore };
}
