import { describe, expect, it } from 'vitest';
import { canonicalize, sha256Hex } from '../src/index';

describe('canonical hashing', () => {
  it('sorts keys recursively and ignores undefined values', () => {
    const a = { b: 2, a: { d: 4, c: 3 }, list: [{ z: 1, y: 2 }] };
    const b = { list: [{ y: 2, z: 1 }], a: { c: 3, d: 4 }, b: 2 };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(canonicalize({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it('produces a stable sha256', () => {
    expect(sha256Hex(canonicalize({ hello: 'world' }))).toBe(
      '93a23971a914e5eacbf0a8d25154cda309c3c1c72fbb9914d47c60f3cb681588',
    );
  });
});
