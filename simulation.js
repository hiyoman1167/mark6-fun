export const COMBINATIONS = 13_983_816;
export const UNIT_COST = 10;
// rankAt repeats after this many indices because its counter is 32-bit.
export const MAX_UNIQUE_DRAWS = 0x1_0000_0000;

// Counter-based draws allow workers to calculate any index independently.
export const GENERATOR_VERSION = 2;

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
  const high = mix32(drawIndex ^ words[0]) & 0x1fffff;
  const low = mix32(Math.imul(drawIndex, 0x9e3779b1) ^ words[1]);
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

export function drawAt(seed, drawIndex) {
  if (!Number.isSafeInteger(drawIndex) || drawIndex < 1) throw new RangeError('Invalid draw index');
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
