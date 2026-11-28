import 'server-only';
import { principalUow } from '@/server/core/authorized';
import { AppError } from '@/server/core/errors';
import { apiHandler } from '@/server/core/handler';
import { getSettings } from '@/server/core/settings';
import { idSchema } from '@/shared/schemas';
import { readProofReference, verifyStoredProof } from './proof-service';
import { SupabaseProofStore, type ProofStore } from './storage';

function configuredStore() {
  const settings = getSettings();
  return new SupabaseProofStore(settings.SUPABASE_INTERNAL_URL, settings.STORAGE_SERVICE_KEY, settings.PROOF_BUCKET);
}

export function createProofHandler(authorize: typeof principalUow = principalUow, providedStore?: ProofStore) {
  return apiHandler(async (request, { requestId }, { params }: { params: Promise<{ parcelId: string }> }) => {
    const parsed = idSchema.safeParse((await params).parcelId);
    const reference = await authorize(request, {}, async client => {
      if (!parsed.success) throw new AppError('NOT_FOUND');
      return readProofReference(client, parsed.data);
    });
    const bytes = await (providedStore ?? configuredStore()).open(reference.storageKey);
    verifyStoredProof(reference, bytes);
    await authorize(request, {}, async (client, principal) => {
      if (!parsed.success) throw new AppError('NOT_FOUND');
      const current = await readProofReference(client, parsed.data);
      if (current.storageKey !== reference.storageKey || current.sizeBytes !== reference.sizeBytes
        || current.mediaType !== reference.mediaType) throw new AppError('NOT_FOUND');
      await client.query(`
        INSERT INTO app.audit_event(actor_id, parcel_id, event_type, outcome, request_id)
        VALUES ($1, $2, 'PROOF_VIEWED', 'SUCCESS', $3)
      `, [principal.id, parsed.data, requestId]);
    });
    const extension = reference.mediaType === 'image/png' ? 'png' : 'jpg';
    return new Response(Buffer.from(bytes), { headers: {
      'Content-Type': reference.mediaType,
      'Content-Length': String(bytes.length),
      'Content-Disposition': `inline; filename="delivery-proof.${extension}"`,
    } });
  });
}
