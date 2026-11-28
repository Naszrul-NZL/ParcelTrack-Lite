import 'server-only';
import type { PoolClient } from 'pg';
import { AppError } from '@/server/core/errors';
import { LIMITS } from '@/shared/constants';

export type ProofReference = { storageKey: string; mediaType: 'image/jpeg' | 'image/png'; sizeBytes: number };

export async function readProofReference(client: PoolClient, parcelId: string): Promise<ProofReference> {
  const { rows: [row] } = await client.query<{
    storage_key: string; media_type: 'image/jpeg' | 'image/png'; size_bytes: number;
  }>(`
    SELECT proof.storage_key, proof.media_type, proof.size_bytes
    FROM app.parcel parcel
    JOIN app.delivery_proof proof ON proof.parcel_id = parcel.id
    WHERE parcel.id = $1 AND parcel.anonymized_at IS NULL
  `, [parcelId]);
  if (!row) throw new AppError('NOT_FOUND');
  return { storageKey: row.storage_key, mediaType: row.media_type, sizeBytes: row.size_bytes };
}

export function verifyStoredProof(reference: ProofReference, bytes: Uint8Array) {
  if (!bytes.length || bytes.length > LIMITS.proofBytes || bytes.length !== reference.sizeBytes) {
    throw new AppError('STORAGE_UNAVAILABLE');
  }
  const buffer = Buffer.from(bytes);
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if ((reference.mediaType === 'image/jpeg' && !jpeg) || (reference.mediaType === 'image/png' && !png)) {
    throw new AppError('STORAGE_UNAVAILABLE');
  }
}
