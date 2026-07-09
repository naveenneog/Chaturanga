// Chaturanga rules layer — a thin, PURE wrapper over chess.js (modern chess moves)
// that adds authentic Chaturanga piece IDENTITIES and resolves the moral
// "teaching moments" a world attaches to selecting, capturing and promoting.
//
// No DOM here. Renderers use chess.js for state and this module for meaning.
import { Chess } from '../vendor/chess.js';

// chess.js piece type <-> Chaturanga identity key
export const TYPE_TO_KEY = { p: 'padati', n: 'ashva', b: 'gaja', r: 'ratha', q: 'mantri', k: 'raja' };
export const KEY_TO_TYPE = { padati: 'p', ashva: 'n', gaja: 'b', ratha: 'r', mantri: 'q', raja: 'k' };
export const PIECE_KEYS = ['raja', 'mantri', 'ratha', 'gaja', 'ashva', 'padati'];

export function newGame(fen) {
  return fen ? new Chess(fen) : new Chess();
}

export function identity(type) {
  return TYPE_TO_KEY[type] || type;
}

// The world's teaching entry for a chess piece type ('p','n','b','r','q','k').
export function pieceInfo(world, type) {
  const key = TYPE_TO_KEY[type];
  return (world && world.pieces && world.pieces[key]) || null;
}

function hash(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pick(arr, seed) {
  if (!arr || !arr.length) return null;
  return arr[seed % arr.length];
}

// A pawn's life/battlefield lesson, chosen deterministically from its position/seed.
export function pawnTeaching(world, seed) {
  return pick(world && world.pawnTeachings, hash(seed));
}

// The teaching shown when a piece is SELECTED: its identity + dharma.
export function selectMoment(world, type) {
  const key = TYPE_TO_KEY[type];
  const info = pieceInfo(world, type) || {};
  return {
    kind: 'select',
    pieceKey: key,
    name: info.name || key,
    en: info.en || '',
    glyph: info.glyph || '',
    moral: info.moral || '',
    teaching: info.teaching || '',
  };
}

// The single most meaningful teaching for a move that just happened.
// mv = chess.js verbose move: { color, piece, from, to, san, flags, captured?, promotion? }
export function moveMoment(world, mv, state = {}) {
  const key = TYPE_TO_KEY[mv.piece];
  const info = pieceInfo(world, mv.piece) || {};
  const base = { pieceKey: key, name: info.name || key, en: info.en || '', glyph: info.glyph || '' };

  if (mv.flags && mv.flags.includes('p')) {
    const mantri = (world.pieces && world.pieces.mantri) || {};
    return {
      ...base,
      kind: 'promotion',
      title: `${info.name || 'Padati'} → ${mantri.name || 'Mantri'}`,
      line: world.promotionLine || info.teaching || '',
    };
  }
  if (state.checkmate) {
    return { ...base, kind: 'checkmate', title: world.checkmateTitle || 'Vijaya — Victory', line: world.checkmateLine || '' };
  }
  if (mv.captured) {
    const capInfo = pieceInfo(world, mv.captured) || {};
    return {
      ...base,
      kind: 'capture',
      captured: capInfo.name || TYPE_TO_KEY[mv.captured],
      capturedGlyph: capInfo.glyph || '',
      title: `${base.name} takes ${capInfo.name || ''}`.trim(),
      line: pick(world.captureLines, hash(mv.san)) || capInfo.fall || info.teaching || '',
    };
  }
  if (state.check) {
    return { ...base, kind: 'check', title: `${world.sides ? '' : ''}Check`, line: world.checkLine || info.teaching || '' };
  }
  if (mv.piece === 'p') {
    return { ...base, kind: 'pawn', title: info.name || 'Padati', line: pawnTeaching(world, mv.to) || info.teaching || '' };
  }
  return { ...base, kind: 'move', title: info.name || key, line: info.teaching || info.moral || '' };
}

// Validate a world manifest has everything the renderers/teachings need.
export function validateWorld(world) {
  const errs = [];
  if (!world || typeof world !== 'object') return ['world is not an object'];
  if (!world.id) errs.push('missing id');
  if (!world.title) errs.push('missing title');
  if (!world.theme) errs.push('missing theme');
  if (!world.pieces) errs.push('missing pieces');
  else {
    for (const k of PIECE_KEYS) {
      const p = world.pieces[k];
      if (!p) { errs.push(`missing piece "${k}"`); continue; }
      if (!p.name) errs.push(`piece "${k}" missing name`);
      if (!p.teaching) errs.push(`piece "${k}" missing teaching`);
    }
  }
  if (!Array.isArray(world.pawnTeachings) || world.pawnTeachings.length === 0) {
    errs.push('missing pawnTeachings[] (the life/battlefield lessons for foot-soldiers)');
  }
  return errs;
}
