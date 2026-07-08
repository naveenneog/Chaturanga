import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { validateWorld, PIECE_KEYS } from '../web/js/rules.js';

const dir = fileURLToPath(new URL('../web/worlds/', import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

test('there is more than one world', () => {
  assert.ok(files.length >= 2, `expected >=2 worlds, found ${files.length}`);
});

for (const f of files) {
  test(`world ${f} is valid and fully taught`, () => {
    const world = JSON.parse(readFileSync(dir + f, 'utf8'));
    assert.deepEqual(validateWorld(world), [], `${f} failed validation`);
    for (const k of PIECE_KEYS) {
      assert.ok(world.pieces[k].name, `${f}: ${k} missing name`);
      assert.ok(world.pieces[k].teaching.length > 20, `${f}: ${k} teaching too short`);
    }
    assert.ok(world.sides && world.sides.white && world.sides.black, `${f}: missing sides`);
    assert.ok(world.checkmateLine, `${f}: missing checkmateLine`);
  });
}
