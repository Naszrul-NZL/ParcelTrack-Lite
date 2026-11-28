import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { LIMITS } from '@/shared/constants';
import { prepareProof, readStatusMultipart, withRiderUploadSlot } from '@/server/modules/delivery/proof-pipeline';

function request(form: FormData) {
  return new Request('http://localhost/api/v1/rider/parcels/1/status', { method: 'POST', body: form });
}

function baseForm() {
  const form = new FormData();
  form.set('status', 'DELIVERED');
  form.set('expectedVersion', '3');
  return form;
}

describe('M3-PH3 proof multipart pipeline', () => {
  it('parses one bounded proof without trusting its declared media type and sanitizes staged bytes', async () => {
    const jpeg = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#152e48' } }).jpeg().toBuffer();
    const form = baseForm();
    form.set('proof', new File([jpeg], 'proof.jpg', { type: 'application/octet-stream' }));
    const parsed = await readStatusMultipart(request(form));
    expect(parsed.fields).toEqual({ status: 'DELIVERED', expectedVersion: 3 });
    expect(parsed.proofs[0]).toMatchObject({ filename: 'proof.jpg', declaredType: 'application/octet-stream' });
    const prepared = await prepareProof(parsed.proofs[0]);
    expect(prepared.mediaType).toBe('image/jpeg');
    expect((await sharp(prepared.bytes).metadata()).format).toBe('jpeg');
  });

  it('rejects duplicate proof, repeated fields, unknown parts and excessive part counts', async () => {
    const duplicate = baseForm();
    duplicate.append('proof', new File(['a'], 'one.jpg'));
    duplicate.append('proof', new File(['b'], 'two.jpg'));
    await expect(readStatusMultipart(request(duplicate))).rejects.toMatchObject({ code: 'PROOF_COUNT' });

    const repeated = baseForm();
    repeated.append('status', 'FAILED');
    await expect(readStatusMultipart(request(repeated))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const unknown = baseForm();
    unknown.set('actorId', '1');
    await expect(readStatusMultipart(request(unknown))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const many = baseForm();
    for (let index = 0; index < 11; index++) many.append('unknown' + index, 'x');
    await expect(readStatusMultipart(request(many))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects unsafe filenames, invalid boundaries and declared or streamed body overflow', async () => {
    const longName = baseForm();
    longName.set('proof', new File(['x'], 'a'.repeat(201) + '.jpg'));
    await expect(readStatusMultipart(request(longName))).rejects.toMatchObject({ code: 'PROOF_INVALID' });

    const invalidBoundary = new Request('http://localhost/upload', {
      method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=' + 'a'.repeat(71) }, body: 'x',
    });
    await expect(readStatusMultipart(invalidBoundary)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const declared = request(baseForm());
    declared.headers.set('content-length', String(LIMITS.multipartBytes + 1));
    await expect(readStatusMultipart(declared)).rejects.toMatchObject({ code: 'PROOF_TOO_LARGE' });

    const streamed = baseForm();
    streamed.set('expectedVersion', '3' + 'x'.repeat(LIMITS.multipartBytes));
    await expect(readStatusMultipart(request(streamed))).rejects.toMatchObject({ code: 'PROOF_TOO_LARGE' });
  });

  it('sheds concurrent image work for the same Rider and releases the slot afterwards', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const first = withRiderUploadSlot('7', async () => {
      entered.resolve();
      await release.promise;
      return 'done';
    });
    await entered.promise;
    await expect(withRiderUploadSlot('7', async () => 'second')).rejects.toMatchObject({ code: 'BUSY' });
    expect(await withRiderUploadSlot('8', async () => 'other')).toBe('other');
    release.resolve();
    expect(await first).toBe('done');
    expect(await withRiderUploadSlot('7', async () => 'again')).toBe('again');
  });
});
