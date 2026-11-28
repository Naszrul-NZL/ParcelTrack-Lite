import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { makeTracking } from '@/server/modules/parcels/tokens';

describe('M2-05 tracking numbers come from a cryptographic source', () => {
  it('uses node:crypto randomBytes by default and asks for exactly 16 bytes', () => {
    const source = readFileSync('src/server/modules/parcels/tokens.ts', 'utf8');
    expect(source).toMatch(/import \{[^}]*\brandomBytes\b[^}]*\} from 'node:crypto'/);
    expect(source).toMatch(/random: \(size:\s*number\) => Uint8Array = randomBytes/);
    expect(source).not.toMatch(/Math\.random|Date\.now|performance\.now|sequence|counter/);
    const random = vi.fn((size: number) => new Uint8Array(size).fill(0xab));
    expect(makeTracking(random)).toBe('PTL-' + 'AB'.repeat(16));
    expect(random).toHaveBeenCalledWith(16);
  });

  it('formats 128 random bits as PTL- and 32 uppercase hex digits, with no repeats or ordering in a sample', () => {
    const tokens = Array.from({ length: 2000 }, () => makeTracking());
    for (const token of tokens) expect(token).toMatch(/^PTL-[0-9A-F]{32}$/);
    expect(new Set(tokens).size).toBe(tokens.length);
    // Consecutive values are not increments of each other (a sample supports, but does not prove, unpredictability).
    const increments = tokens.slice(1).filter((token, index) => BigInt('0x' + token.slice(4)) - BigInt('0x' + tokens[index].slice(4)) === 1n);
    expect(increments).toEqual([]);
  });
});
