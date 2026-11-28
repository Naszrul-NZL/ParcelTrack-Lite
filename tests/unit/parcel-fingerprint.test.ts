import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { creationFingerprint } from '@/server/modules/parcels/tokens';
import { parcelInputSchema } from '@/shared/schemas';

const KEY = 'k'.repeat(40);
const canonical = (raw: Record<string, string>) => parcelInputSchema.parse({ clientRequestId: randomUUID(), ...raw });
const base = { recipientName: 'Aina Rahman', recipientPhone: '012-345 6789', recipientAddress: '1 Jalan Contoh', weightKg: '1.5' };

describe('M2-PH3-TC02 creation fingerprint', () => {
  it('is equal for inputs that normalize to the same request', () => {
    const expected = creationFingerprint(canonical(base), KEY);
    for (const variant of [
      { ...base, recipientName: '  Aina Rahman  ', recipientAddress: ' 1 Jalan Contoh\n' },
      { ...base, recipientPhone: '+60 12-345 6789' },
      { ...base, recipientPhone: '(012) 345-6789' },
      { ...base, weightKg: '1.500' },
      { ...base, weightKg: '1.50' },
    ]) expect(creationFingerprint(canonical(variant), KEY), JSON.stringify(variant)).toBe(expected);
  });

  it('ignores the client request ID, which is the key rather than the data', () => {
    expect(creationFingerprint(canonical(base), KEY)).toBe(creationFingerprint(canonical(base), KEY));
  });

  it('differs whenever any field differs', () => {
    const expected = creationFingerprint(canonical(base), KEY);
    for (const change of [
      { recipientName: 'Aina Rahmah' }, { recipientName: 'aina rahman' }, { recipientPhone: '012-345 6788' },
      { recipientAddress: '2 Jalan Contoh' }, { weightKg: '1.501' },
      // Moving text between fields must not produce the same value.
      { recipientName: 'Aina', recipientAddress: 'Rahman 1 Jalan Contoh' },
    ]) expect(creationFingerprint(canonical({ ...base, ...change }), KEY), JSON.stringify(change)).not.toBe(expected);
  });

  it('is a keyed HMAC, not a plain hash of the personal data', () => {
    const input = canonical(base);
    const value = creationFingerprint(input, KEY);
    expect(value).toMatch(/^[0-9a-f]{64}$/);
    const fields = [input.recipientName, input.recipientPhone, input.recipientAddress, input.weightKg];
    for (const plain of [JSON.stringify(fields), fields.join(''), fields.join('|')]) {
      expect(value).not.toBe(createHash('sha256').update(plain).digest('hex'));
    }
    expect(creationFingerprint(input, 'x'.repeat(40))).not.toBe(value);
  });
});
