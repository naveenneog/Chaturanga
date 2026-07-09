// Coach — the teaching brain. Turns engine analysis + the openings book into short, themed
// guidance: hints (what to play and why), move reviews (was that a blunder?), and opening
// recognition. Pure/no-DOM so it is testable; the renderer decides how to present it.
import { Chess } from '../vendor/chess.js';
import { analyze, classifyMove, levelById } from './engine.js';
import { detectOpening, openingById } from './openings.js';

const CENTER = new Set(['d4', 'e4', 'd5', 'e5']);
const NAMES = { p: 'Padati', n: 'Ashva', b: 'Gaja', r: 'Ratha', q: 'Mantri', k: 'Raja' };

const givesCheck = (fen, move) => {
  const g = new Chess(fen);
  const m = g.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
  return !!m && g.inCheck();
};

// A short, themed reason a move is worth playing.
export function describeMove(fen, move) {
  if (!move) return '';
  const flags = move.flags || '';
  if (flags.includes('k') || flags.includes('q')) return 'Castle — lead the Raja to safety behind the wall of foot-soldiers.';
  if (givesCheck(fen, move)) return `Check with the ${NAMES[move.piece] || 'piece'} — force the enemy Raja to answer.`;
  if (move.captured) return `Capture the ${NAMES[move.captured] || 'piece'} — win material when it costs you nothing.`;
  if (move.promotion) return 'Promote — the steadfast Padati crosses the field and is reborn a Mantri.';
  if ((move.piece === 'n' || move.piece === 'b') && /[18]/.test(move.from[1])) return `Develop the ${NAMES[move.piece]} — call every division to the field before you attack.`;
  if (CENTER.has(move.to)) return 'Fight for the centre — hold the centre of your being and the board obeys you.';
  if (move.piece === 'r' || move.piece === 'q') return `Activate the ${NAMES[move.piece]} toward open lines.`;
  return 'A solid, purposeful move.';
}

// Best move for the position + a themed rationale. `level` scales the search depth.
export function hint(fen, levelOrId = 3) {
  const level = typeof levelOrId === 'object' ? levelOrId : levelById(levelOrId);
  const a = analyze(fen, { depth: Math.min(level.depth, 3), maxMs: 700, quiesce: true });
  if (!a.best) return null;
  const mv = a.best.move;
  return { from: mv.from, to: mv.to, san: mv.san, why: describeMove(fen, mv), score: a.score };
}

const VERDICT = {
  best: { title: 'Well played', tone: 'praise' },
  good: { title: 'Good move', tone: 'praise' },
  inaccuracy: { title: 'A small slip', tone: 'nudge' },
  mistake: { title: 'A mistake', tone: 'warn' },
  blunder: { title: 'Careful — blunder!', tone: 'warn' },
};

// Review a move the human just played. Returns null for fine moves (to avoid nagging) unless
// `always` is set. For mistakes/blunders it names the stronger move and why.
export function reviewMove(fenBefore, move, opts = {}) {
  const c = classifyMove(fenBefore, move, { depth: opts.depth ?? 3, maxMs: opts.maxMs ?? 700 });
  if (!c) return null;
  const meta = VERDICT[c.verdict] || VERDICT.good;
  const notable = c.verdict === 'inaccuracy' || c.verdict === 'mistake' || c.verdict === 'blunder';
  if (!notable && !opts.always) return null;
  let message;
  if (notable) {
    const bestSan = c.best.san;
    const why = describeMove(fenBefore, c.best);
    message = `${bestSan} was stronger — ${why.charAt(0).toLowerCase()}${why.slice(1)}`;
  } else {
    message = describeMove(fenBefore, move);
  }
  return { verdict: c.verdict, tone: meta.tone, title: meta.title, message, bestSan: c.best.san, lost: c.lost };
}

// Which opening is being played (if any), with a teaching note for the current depth.
export function openingNote(sanHistory) {
  const d = detectOpening(sanHistory);
  if (!d) return null;
  const o = d.opening;
  const ply = Math.min(d.plies, o.line.length) - 1;
  return { id: o.id, name: o.name, sub: o.sub, idea: o.idea, note: o.line[ply] ? o.line[ply].note : o.idea, plies: d.plies };
}

// Trainer helper: the next booked move + its note for an opening line at a given ply.
export function openingStep(openingId, ply) {
  const o = openingById(openingId);
  if (!o || ply >= o.line.length) return null;
  const step = o.line[ply];
  return { ...step, index: ply, total: o.line.length, name: o.name };
}
