export const COMBINATIONS = 13_983_816;
export const UNIT_COST = 10;
// The original generator uses this many draws before its 32-bit counter wraps.
// Indices beyond it mix the upper counter words into the seed to avoid repeats.
export const MAX_UNIQUE_DRAWS = 0x1_0000_0000;

// Counter-based draws allow workers to calculate any index independently.
export const GENERATOR_VERSION = 3;

export function seedWords(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const next = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
  return [next(), next()];
}

function mix32(value) {
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

// 53 pseudo-random bits select one of C(49, 6) combinations.
export function rankAt(words, drawIndex) {
  let counter;
  let upper;
  if (typeof drawIndex === 'bigint') {
    if (drawIndex < 1n) throw new RangeError('Invalid draw index');
    counter = Number(drawIndex & 0xffff_ffffn);
    upper = drawIndex >> 32n;
  } else {
    if (!Number.isSafeInteger(drawIndex) || drawIndex < 1) throw new RangeError('Invalid draw index');
    counter = drawIndex >>> 0;
    upper = Math.floor(drawIndex / MAX_UNIQUE_DRAWS);
  }
  let word0 = words[0];
  let word1 = words[1];
  // Keep all existing results through draw 2^32 unchanged. Later draws
  // include every higher 32-bit counter word in a separate domain.
  if (typeof upper === 'bigint') {
    if (drawIndex === 0x1_0000_0000n) upper = 0n;
    while (upper > 0n) {
      const part = Number(upper & 0xffff_ffffn);
      word0 = mix32(word0 ^ part ^ 0x9e3779b9);
      word1 = mix32(word1 ^ Math.imul(part, 0x85ebca6b));
      upper >>= 32n;
    }
  } else {
    if (drawIndex === MAX_UNIQUE_DRAWS) upper = 0;
    while (upper > 0) {
      const part = upper >>> 0;
      word0 = mix32(word0 ^ part ^ 0x9e3779b9);
      word1 = mix32(word1 ^ Math.imul(part, 0x85ebca6b));
      upper = Math.floor(upper / MAX_UNIQUE_DRAWS);
    }
  }
  const high = mix32(counter ^ word0) & 0x1fffff;
  const low = mix32(Math.imul(counter, 0x9e3779b1) ^ word1);
  return Math.min(COMBINATIONS - 1, Math.floor((high * 0x1_0000_0000 + low) / 0x20_0000_0000_0000 * COMBINATIONS));
}

const choose = Array.from({ length: 50 }, () => Array(7).fill(0));
for (let n = 0; n <= 49; n++) {
  choose[n][0] = 1;
  for (let k = 1; k <= Math.min(n, 6); k++) {
    choose[n][k] = choose[n - 1][k - 1] + choose[n - 1][k];
  }
}

export function combinationRank(numbers) {
  let rank = 0;
  let candidate = 1;
  for (let position = 0; position < 6; position++) {
    while (candidate < numbers[position]) {
      rank += choose[49 - candidate][5 - position];
      candidate++;
    }
    candidate++;
  }
  return rank;
}

export function numbersAtRank(rank) {
  if (!Number.isInteger(rank) || rank < 0 || rank >= COMBINATIONS) throw new RangeError('Invalid combination rank');
  const numbers = [];
  let candidate = 1;
  for (let position = 0; position < 6; position++) {
    while (candidate <= 49) {
      const beforeNext = choose[49 - candidate][5 - position];
      if (rank < beforeNext) {
        numbers.push(candidate++);
        break;
      }
      rank -= beforeNext;
      candidate++;
    }
  }
  return numbers;
}

export function randomCombination(randomUint32 = () => crypto.getRandomValues(new Uint32Array(1))[0]) {
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / COMBINATIONS) * COMBINATIONS;
  let value;
  do { value = randomUint32(); } while (value >= limit);
  return numbersAtRank(value % COMBINATIONS);
}

export function drawAt(seed, drawIndex) {
  return numbersAtRank(rankAt(seedWords(seed), drawIndex));
}

export function firstMatchInRange(words, targetRank, start, end) {
  for (let index = start; index <= end; index++) {
    if (rankAt(words, index) === targetRank) return index;
  }
  return null;
}

export function parseNumbers(value) {
  const parts = String(value).trim().split(/[\s,，+、]+/).filter(Boolean);
  if (parts.length !== 6 || parts.some((part) => !/^\d{1,2}$/.test(part))) return null;
  const numbers = parts.map(Number);
  if (numbers.some((number) => number < 1 || number > 49) || new Set(numbers).size !== 6) return null;
  return numbers.sort((a, b) => a - b);
}

export function chanceWithin(draws) {
  return -Math.expm1(draws * Math.log1p(-1 / COMBINATIONS));
}
