import 'server-only';
import { apiHandler } from '@/server/core/handler';
import { principalUow } from '@/server/core/authorized';
import { CommitUncertainError } from '@/server/core/db';
import { AppError } from '@/server/core/errors';
import { logEvent } from '@/server/core/logging';
import { getSettings } from '@/server/core/settings';
import { idSchema } from '@/shared/schemas';
import { riderListQuerySchema } from '@/features/delivery/rider-contract';
import { canTransition } from './rules';
import { prepareProof, readStatusMultipart, withRiderUploadSlot } from './proof-pipeline';
import { finalizeRiderStatus, listRiderParcels, precheckRiderStatus, updateRiderStatus } from './rider-service';
import { SupabaseProofStore, type ProofStore } from './storage';

function configuredStore() {
  const settings = getSettings();
  return new SupabaseProofStore(settings.SUPABASE_INTERNAL_URL, settings.STORAGE_SERVICE_KEY, settings.PROOF_BUCKET);
}

// Route mounting follows the registered migration and service handoffs.
export function createRiderHandlers(authorize: typeof principalUow = principalUow, providedStore?: ProofStore) {
  return {
    list: apiHandler((request) => authorize(request, { roles: ['RIDER'] }, async (client, principal) => {
      const params = new URL(request.url).searchParams;
      const entries = Array.from(params.entries());
      if (entries.length !== new Set(params.keys()).size) throw new AppError('VALIDATION_ERROR');
      return Response.json(await listRiderParcels(client, principal, riderListQuerySchema.parse(Object.fromEntries(entries))));
    })),
    updateStatus: apiHandler(async (request, { requestId }, context: { params: Promise<{ parcelId: string }> }) => {
      const { parcelId } = await context.params;
      const precheck = await authorize(request, { roles: ['RIDER'] }, async (client, principal) => {
        if (!idSchema.safeParse(parcelId).success) throw new AppError('NOT_FOUND');
        return { principal, target: await precheckRiderStatus(client, principal, parcelId) };
      });
      const multipart = await readStatusMultipart(request);
      const decision = canTransition(
        { role: 'RIDER', assigned: true, active: true },
        precheck.target.currentStatus,
        multipart.fields.status,
        multipart.proofs.length === 1,
      );
      if (!decision.allowed) throw new AppError(decision.code);

      let publishedKey: string | undefined;
      let store: ProofStore | undefined;
      try {
        const detail = multipart.proofs.length === 1
          ? await withRiderUploadSlot(precheck.principal.id, async () => {
              const proofStore = providedStore ?? configuredStore();
              store = proofStore;
              const proof = await prepareProof(multipart.proofs[0]);
              return authorize(request, { roles: ['RIDER'] }, (client, principal) => finalizeRiderStatus(
                client, principal, parcelId, multipart.fields, proof, proofStore, requestId,
                key => { publishedKey = key; },
              ));
            })
          : await authorize(request, { roles: ['RIDER'] }, (client, principal) =>
              updateRiderStatus(client, principal, parcelId, multipart.fields, requestId));
        const current = detail.history.at(-1);
        const previous = detail.history.at(-2);
        const result = { detail, log: {
          actorId: precheck.principal.id, parcelId: detail.id, oldStatus: previous?.status,
          newStatus: current?.status, occurredAt: current?.changedAt, requestId,
        } };
        // authorize resolves only after its transaction commits, so a success log cannot precede the commit.
        logEvent('status_changed', result.log);
        return Response.json(result.detail);
      } catch (error) {
        if (publishedKey && store && !(error instanceof CommitUncertainError)) {
          try { await store.delete(publishedKey); }
          catch { throw new AppError('STORAGE_UNAVAILABLE'); }
        }
        throw error;
      }
    }),
  };
}
