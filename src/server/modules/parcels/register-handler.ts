import 'server-only';
import type { PoolClient } from 'pg';
import { principalUow } from '@/server/core/authorized';
import { AppError } from '@/server/core/errors';
import { apiHandler } from '@/server/core/handler';
import { equalSecret } from '@/server/core/request';
import { getSettings } from '@/server/core/settings';
import type { AuthContext } from '@/server/modules/auth/principal';
import { LIMITS } from '@/shared/constants';
import { parcelDetailSchema, parcelInputSchema, type ParcelDetail, type ParcelInput } from '@/shared/schemas';
import { readParcelDetail } from './read-service';
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
const sqlState = (error: unknown) => error instanceof Error && 'code' in error ? String(error.code) : '';
const isTrackingCollision = (error: unknown) => sqlState(error) === '23505'
  && error instanceof Error && 'constraint' in error && error.constraint === 'parcel_tracking_number_key';
// create_parcel raises PT009 when this Seller already used the client request ID (the unique constraint decided it).
const isRequestReused = (error: unknown) => sqlState(error) === 'PT009';

/**
 * M2-PH3-T01: a repeated client request ID. The same canonical data returns the original parcel (a lost response
 * is retried safely), different data is 409 IDEMPOTENCY_CONFLICT, and a key whose fingerprint was cleared by
 * anonymization is 409 REQUEST_EXPIRED, so recipient data is never recreated. RLS limits the read to the Seller's
 * own parcels; a simultaneous identical request waited on the unique constraint, so the winner's row is committed.
 */
async function replayParcel(client: PoolClient, principal: AuthContext, input: ParcelInput, fingerprint: string, requestId: string) {
  const { rows: [existing] } = await client.query<{ id: string; fingerprint: string | null }>(`
    SELECT id::text AS id, creation_fingerprint AS fingerprint
    FROM app.parcel WHERE seller_id = $1 AND client_request_id = $2
  `, [principal.id, input.clientRequestId]);
  if (!existing) throw new Error('A reused client request ID has no visible parcel.');
  if (existing.fingerprint === null) throw new AppError('REQUEST_EXPIRED');
  if (!equalSecret(existing.fingerprint, fingerprint)) throw new AppError('IDEMPOTENCY_CONFLICT');
  return readParcelDetail(client, principal, existing.id, requestId);
}

async function registerParcel(
  client: PoolClient, principal: AuthContext, input: ParcelInput, requestId: string, fingerprintKey: string, tracking: () => string,
): Promise<{ parcel: ParcelDetail; created: boolean }> {
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
      return { created: true, parcel: parcelDetailSchema.parse({
        ...parcel, createdAt,
        recipient: { name: input.recipientName, phone: input.recipientPhone, address: input.recipientAddress },
        assignedRider: null, history: [{ status: parcel.currentStatus, changedAt: createdAt }],
        hasProof: false, anonymized: false, terminalAt: null,
      }) };
    } catch (error) {
      if (!isTrackingCollision(error) && !isRequestReused(error)) throw error;
      await client.query('ROLLBACK TO SAVEPOINT parcel_token');
      await client.query('RELEASE SAVEPOINT parcel_token');
      if (isRequestReused(error)) return { created: false, parcel: await replayParcel(client, principal, input, fingerprint, requestId) };
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
    const { parcel, created } = await authorize(request, { roles: ['SELLER'] }, async (client, principal) =>
      registerParcel(client, principal, await readRegistration(request), requestId, fingerprintKey(), tracking));
    return Response.json(parcel, { status: created ? 201 : 200 });
  });
}
