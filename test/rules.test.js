import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  newGame, identity, TYPE_TO_KEY, PIECE_KEYS,
  selectMoment, moveMoment, pawnTeaching, validateWorld,
} from '../web/js/rules.js';

const world = JSON.parse(
  readFileSync(fileURLToPath(new URL('../web/worlds/kurukshetra.json', import.meta.url)), 'utf8'),
);

test('chess.js engine: legal moves from the start', () => {
  const g = newGame();
  assert.equal(g.turn(), 'w');
  assert.equal(g.moves().length, 20);
});

test('identity maps chess types to Chaturanga keys', () => {
  assert.equal(identity('p'), 'padati');
  assert.equal(identity('q'), 'mantri');
  assert.equal(identity('k'), 'raja');
  assert.equal(identity('n'), 'ashva');
  assert.equal(identity('b'), 'gaja');
  assert.equal(identity('r'), 'ratha');
});

test('selectMoment surfaces the piece dharma', () => {
  const m = selectMoment(world, 'p');
  assert.equal(m.kind, 'select');
  assert.equal(m.name, 'Padati');
  assert.match(m.teaching, /never steps backward/);
});

test('moveMoment: a capture yields a battlefield lesson', () => {
  // 1.e4 d5 2.exd5 — white pawn captures
  const g = newGame();
  g.move('e4'); g.move('d5');
  const mv = g.move('exd5');
  assert.ok(mv.captured, 'move should be a capture');
  const m = moveMoment(world, mv, { check: g.inCheck(), checkmate: g.isCheckmate() });
  assert.equal(m.kind, 'capture');
  assert.ok(m.line.length > 0, 'capture should carry a teaching line');
});

test('moveMoment: promotion is reborn as Mantri', () => {
  // white pawn one step from promotion on b7, empty b8
  const g = newGame('8/1P6/8/8/8/8/8/K6k w - - 0 1');
  const mv = g.move({ from: 'b7', to: 'b8', promotion: 'q' });
  const m = moveMoment(world, mv, {});
  assert.equal(m.kind, 'promotion');
  assert.match(m.title, /Padati.*Mantri/);
  assert.ok(m.line.length > 0);
});

test('moveMoment: a plain pawn push gives a life lesson', () => {
  const g = newGame();
  const mv = g.move('e4');
  const m = moveMoment(world, mv, {});
  assert.equal(m.kind, 'pawn');
  assert.ok(m.line.length > 0);
});

test('pawnTeaching is deterministic for a given seed', () => {
  assert.equal(pawnTeaching(world, 'e4'), pawnTeaching(world, 'e4'));
  assert.ok(world.pawnTeachings.includes(pawnTeaching(world, 'e4')));
});

test('kurukshetra world is valid', () => {
  assert.deepEqual(validateWorld(world), []);
});

test('every world piece key is present and taught', () => {
  for (const k of PIECE_KEYS) {
    assert.ok(world.pieces[k], `missing ${k}`);
    assert.ok(world.pieces[k].teaching, `${k} missing teaching`);
  }
  // all 6 chess types map to a defined piece
  for (const t of Object.keys(TYPE_TO_KEY)) {
    assert.ok(world.pieces[TYPE_TO_KEY[t]], `no world piece for type ${t}`);
  }
});
