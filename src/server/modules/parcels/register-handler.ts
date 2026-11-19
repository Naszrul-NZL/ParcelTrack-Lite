import 'server-only';
import type { PoolClient } from 'pg';
import { principalUow } from '@/server/core/authorized';
import { AppError } from '@/server/core/errors';
import { apiHandler } from '@/server/core/handler';
import { getSettings } from '@/server/core/settings';
import { LIMITS } from '@/shared/constants';
import { parcelDetailSchema, parcelInputSchema, type ParcelInput } from '@/shared/schemas';
import { creationFingerprint, makeTracking } from './tokens';

async function readRegistration(request: Request) {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > LIMITS.jsonBytes)) {
    throw new AppError('VALIDATION_ERROR', { body: 'The request is too large.' });
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '') || !request.body) {
    throw new AppError('VALIDATION_ERROR', { body: 'Send the request as JSON.' });
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // Do not hold the authorized transaction until its database idle timeout while awaiting the body.
  const deadline = Promise.withResolvers<never>();
  const timer = setTimeout(() => deadline.reject(new AppError('BUSY')), 5000);
  try {
    for (;;) {
      const chunk = await Promise.race([reader.read(), deadline.promise]);
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > LIMITS.jsonBytes) throw new AppError('VALIDATION_ERROR', { body: 'The request is too large.' });
      chunks.push(chunk.value);
    }
    return parcelInputSchema.parse(JSON.parse(Buffer.concat(chunks, total).toString('utf8')));
  } catch (error) {
    if (error instanceof SyntaxError) throw new AppError('VALIDATION_ERROR', { body: 'Send the request as JSON.' });
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

type CreatedRow = { id: string; trackingNumber: string; currentStatus: string; weightKg: string; createdAt: Date; version: number };
const isTrackingCollision = (error: unknown) => error instanceof Error
  && 'code' in error && error.code === '23505'
  && 'constraint' in error && error.constraint === 'parcel_tracking_number_key';

async function registerParcel(
  client: PoolClient, input: ParcelInput, requestId: string, fingerprintKey: string, tracking: () => string,
) {
  const fingerprint = creationFingerprint(input, fingerprintKey);
  for (let attempt = 0; attempt <= 3; attempt++) {
    await client.query('SAVEPOINT parcel_token');
    try {
      const { rows: [parcel] } = await client.query<CreatedRow>(`
        SELECT id, tracking_number AS "trackingNumber", current_status AS "currentStatus",
          weight_kg AS "weightKg", created_at AS "createdAt", version
        FROM app.create_parcel($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        input.recipientName, input.recipientPhone, input.recipientAddress, input.weightKg,
        input.clientRequestId, fingerprint, tracking(), requestId,
      ]);
      await client.query('RELEASE SAVEPOINT parcel_token');
      const createdAt = parcel.createdAt.toISOString();
      return parcelDetailSchema.parse({
        ...parcel, createdAt,
        recipient: { name: input.recipientName, phone: input.recipientPhone, address: input.recipientAddress },
        assignedRider: null, history: [{ status: parcel.currentStatus, changedAt: createdAt }],
        hasProof: false, anonymized: false, terminalAt: null,
      });
    } catch (error) {
      if (!isTrackingCollision(error)) throw error;
      await client.query('ROLLBACK TO SAVEPOINT parcel_token');
      await client.query('RELEASE SAVEPOINT parcel_token');
    }
  }
  throw new AppError('BUSY');
}

export function createRegistrationHandler(
  authorize: typeof principalUow = principalUow,
  fingerprintKey = () => getSettings().FINGERPRINT_KEY,
  tracking = makeTracking,
) {
  return apiHandler(async (request, { requestId }) => {
    const parcel = await authorize(request, { roles: ['SELLER'] }, async client =>
      registerParcel(client, await readRegistration(request), requestId, fingerprintKey(), tracking));
    return Response.json(parcel, { status: 201 });
  });
}
