import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { selectMoment, moveMoment, pieceInfo, sidePieces } from '../web/js/rules.js';

const ram = JSON.parse(readFileSync(fileURLToPath(new URL('../web/worlds/ramayana.json', import.meta.url)), 'utf8'));
const kur = JSON.parse(readFileSync(fileURLToPath(new URL('../web/worlds/kurukshetra.json', import.meta.url)), 'utf8'));

test('Ramayana: white selects Rama, black selects Ravana (per-side identity)', () => {
  assert.equal(selectMoment(ram, 'k', 'w').name, 'Rama');
  assert.equal(selectMoment(ram, 'k', 'b').name, 'Ravana');
  assert.equal(selectMoment(ram, 'p', 'w').name, 'Vanara');
  assert.equal(selectMoment(ram, 'p', 'b').name, 'Rakshasa');
  assert.equal(selectMoment(ram, 'n', 'b').name, 'Rakshasa-Vira');
});

test('Ramayana: black teaching differs from white teaching', () => {
  assert.notEqual(selectMoment(ram, 'k', 'w').teaching, selectMoment(ram, 'k', 'b').teaching);
  assert.match(selectMoment(ram, 'k', 'b').teaching, /Ravana/);
});

test('pieceInfo + sidePieces resolve by color', () => {
  assert.equal(pieceInfo(ram, 'b', 'b').name, 'Kumbhakarna');   // gaja on the dark side
  assert.equal(pieceInfo(ram, 'b', 'w').name, 'Kumbha-Gaja');
  assert.equal(sidePieces(ram, 'b').raja.name, 'Ravana');
  assert.equal(sidePieces(ram, 'w').raja.name, 'Rama');
});

test('Ramayana: a vanara capturing a rakshasa is named correctly (not "Vanara takes Vanara")', () => {
  const mv = { color: 'w', piece: 'p', captured: 'p', flags: 'c', san: 'exd5', from: 'e4', to: 'd5' };
  const m = moveMoment(ram, mv, {});
  assert.equal(m.kind, 'capture');
  assert.equal(m.name, 'Vanara');
  assert.equal(m.captured, 'Rakshasa');
  assert.equal(m.title, 'Vanara takes Rakshasa');
});

test('Ramayana: a rakshasa capturing a vanara is named from the dark side', () => {
  const mv = { color: 'b', piece: 'n', captured: 'p', flags: 'c', san: 'Nxd4', from: 'b3', to: 'd4' };
  const m = moveMoment(ram, mv, {});
  assert.equal(m.name, 'Rakshasa-Vira');
  assert.equal(m.captured, 'Vanara');
});

test('Ramayana: checkmate + check narration follow the winning / threatened side', () => {
  const mateW = moveMoment(ram, { color: 'w', piece: 'q', from: 'd1', to: 'd8', san: 'Qd8#' }, { checkmate: true });
  assert.match(mateW.title, /Jaya Shri Rama/);
  const mateB = moveMoment(ram, { color: 'b', piece: 'q', from: 'd8', to: 'd1', san: 'Qd1#' }, { checkmate: true });
  assert.match(mateB.title, /Shadow of Lanka/);
  const checkB = moveMoment(ram, { color: 'b', piece: 'r', from: 'a1', to: 'e1', san: 'Re1+' }, { check: true });
  assert.match(checkB.line, /Rama is threatened/);   // black moved -> white (Rama) is in check
});

test('backward compatible: no color defaults to the primary side', () => {
  assert.equal(selectMoment(ram, 'k').name, 'Rama');
  assert.equal(selectMoment(kur, 'k').name, 'Raja');
  assert.equal(selectMoment(kur, 'k', 'b').name, 'Raja');   // Kurukshetra shares (no piecesDark)
});
