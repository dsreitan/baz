/**
 * Seeded, deterministic RNG for CLAWBOUND core logic.
 *
 * Implements the `Rng` contract from `types.ts` using the mulberry32
 * algorithm. No `Math.random`, no `Date` — every stream is fully
 * reproducible from its 32-bit seed.
 */
import type { Rng } from './types';

/**
 * mulberry32: a fast, small, high-quality 32-bit PRNG.
 * Returns a function that produces floats in [0, 1) and advances state.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic string hash (FNV-1a, 32-bit) used to fold a fork label
 * together with the parent seed into a new child seed.
 */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Combine a parent seed with a label into a new deterministic seed. */
function deriveSeed(parentSeed: number, label: string): number {
  const labelHash = fnv1a(label);
  // Mix parent seed and label hash; run through one more avalanche step
  // so similar labels/seeds don't produce correlated child seeds.
  let h = (parentSeed ^ labelHash) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

class Mulberry32Rng implements Rng {
  private readonly seed: number;
  private readonly next32: () => number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.next32 = mulberry32(this.seed);
  }

  next(): number {
    return this.next32();
  }

  int(min: number, max: number): number {
    if (max < min) {
      throw new Error(`Rng.int: max (${max}) must be >= min (${min})`);
    }
    const span = max - min + 1;
    return min + Math.floor(this.next() * span);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) {
      throw new Error('Rng.pick: cannot pick from an empty array');
    }
    const idx = this.int(0, arr.length - 1);
    // Non-null assertion is safe: idx is always within [0, arr.length - 1].
    return arr[idx] as T;
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const result = arr.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = result[i] as T;
      result[i] = result[j] as T;
      result[j] = tmp;
    }
    return result;
  }

  fork(label: string): Rng {
    return new Mulberry32Rng(deriveSeed(this.seed, label));
  }
}

/** Create a new deterministic RNG stream from a 32-bit integer seed. */
export function createRng(seed: number): Rng {
  return new Mulberry32Rng(seed);
}
