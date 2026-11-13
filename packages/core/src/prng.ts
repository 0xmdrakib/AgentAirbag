import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/** Deterministic 32-bit PRNG. Same seed always yields the same stream. */
export class Prng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  hex(chars: number): string {
    let out = '';
    while (out.length < chars) out += this.int(16).toString(16);
    return out.slice(0, chars);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Cannot pick from an empty array');
    return items[this.int(items.length)]!;
  }
}

export function seedFrom(...parts: string[]): number {
  const digest = sha256(utf8ToBytes(parts.join('|')));
  return (
    ((digest[0]! << 24) | (digest[1]! << 16) | (digest[2]! << 8) | digest[3]!) >>> 0
  );
}

export function prngFor(...parts: string[]): Prng {
  return new Prng(seedFrom(...parts));
}

export function sha256Hex(input: string): string {
  return bytesToHex(sha256(utf8ToBytes(input)));
}

export function deterministicId(prng: Prng, prefix: string): string {
  return `${prefix}_${prng.hex(24)}`;
}
