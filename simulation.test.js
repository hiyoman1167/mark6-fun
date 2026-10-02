import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chanceWithin, COMBINATIONS, combinationRank, drawAt, firstMatchInRange, MAX_UNIQUE_DRAWS,
  numbersAtRank, parseNumbers, rankAt, seedWords,
} from './simulation.js';

test('accepts exactly six unique Mark Six numbers', () => {
  assert.deepEqual(parseNumbers('48, 4 28+31、44，47'), [4, 28, 31, 44, 47, 48]);
  assert.equal(parseNumbers('1,2,3,4,5,5'), null);
  assert.equal(parseNumbers('1,2,3,4,5,50'), null);
  assert.equal(parseNumbers('1,2,3,4,5'), null);
});

test('every combination has a reversible rank', () => {
  assert.deepEqual(numbersAtRank(0), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(numbersAtRank(COMBINATIONS - 1), [44, 45, 46, 47, 48, 49]);
  for (let rank = 0; rank < COMBINATIONS; rank += 997) {
    assert.equal(combinationRank(numbersAtRank(rank)), rank);
  }
});

test('a seed and draw index reproduce the same six numbers directly', () => {
  const words = seedWords('research-seed');
  for (const index of [1, 2, 100_000, 50_000_000]) {
    const balls = drawAt('research-seed', index);
    assert.equal(balls.length, 6);
    assert.ok(balls.every((number) => number >= 1 && number <= 49));
    assert.equal(combinationRank(balls), rankAt(words, index));
    assert.deepEqual(drawAt('research-seed', index), balls);
  }
  assert.equal(rankAt(words, MAX_UNIQUE_DRAWS), rankAt(words, BigInt(MAX_UNIQUE_DRAWS)));
  assert.notEqual(rankAt(words, 1), rankAt(words, MAX_UNIQUE_DRAWS + 1));
  assert.equal(rankAt(words, MAX_UNIQUE_DRAWS + 1), rankAt(words, BigInt(MAX_UNIQUE_DRAWS) + 1n));
  const hugeIndex = 10n ** 35n + 12345n;
  assert.deepEqual(drawAt('research-seed', hugeIndex), drawAt('research-seed', hugeIndex));
  assert.equal(combinationRank(drawAt('research-seed', hugeIndex)), rankAt(words, hugeIndex));
  assert.throws(() => drawAt('research-seed', 0n), RangeError);
});

test('separate ranges find the same earliest result as one serial search', () => {
  const words = seedWords('research-seed');
  const targetRank = rankAt(words, 1250);
  const serial = firstMatchInRange(words, targetRank, 1, 3000);
  const parts = [
    firstMatchInRange(words, targetRank, 1, 1000),
    firstMatchInRange(words, targetRank, 1001, 2000),
    firstMatchInRange(words, targetRank, 2001, 3000),
  ].filter((value) => value !== null);
  assert.equal(Math.min(...parts), serial);
  assert.ok(serial <= 1250);
});

test('theoretical chance is one combination for a single draw', () => {
  assert.ok(Math.abs(chanceWithin(1) - 1 / COMBINATIONS) < 1e-15);
  assert.ok(chanceWithin(COMBINATIONS) > 0.63);
});
