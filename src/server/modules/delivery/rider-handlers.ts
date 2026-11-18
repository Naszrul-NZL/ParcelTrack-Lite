import 'server-only';
import { apiHandler } from '@/server/core/handler';
import { principalUow } from '@/server/core/authorized';
import { AppError } from '@/server/core/errors';
import { LIMITS } from '@/shared/constants';
import { idSchema } from '@/shared/schemas';
import { riderListQuerySchema, riderStatusFields } from '@/features/delivery/rider-contract';
import { listRiderParcels, updateRiderStatus } from './rider-service';

async function readStatusFields(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new AppError('VALIDATION_ERROR');
  const length = request.headers.get('content-length');
  if (length !== null && !/^\d+$/.test(length)) throw new AppError('VALIDATION_ERROR');
  if (length !== null && Number(length) > LIMITS.multipartBytes) throw new AppError('PROOF_TOO_LARGE');
  if (!request.body) throw new AppError('VALIDATION_ERROR');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  // Release the database transaction before its 15-second idle timeout.
  const deadline = Promise.withResolvers<never>();
  const timer = setTimeout(() => deadline.reject(new AppError('BUSY')), 5000);
  try {
    for (;;) {
      const chunk = await Promise.race([reader.read(), deadline.promise]);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      // Releasing the reader stops application reads without cancelling Node's multipart producer.
      if (bytes > LIMITS.multipartBytes) throw new AppError('PROOF_TOO_LARGE');
      chunks.push(chunk.value);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('VALIDATION_ERROR');
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }

  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks, bytes), { headers: { 'content-type': contentType } }).formData();
  } catch {
    throw new AppError('VALIDATION_ERROR');
  }
  if (form.has('proof')) throw new AppError('PROOF_NOT_ALLOWED');
  const entries = Array.from(form.entries());
  if (entries.length !== 2 || new Set(form.keys()).size !== 2) throw new AppError('VALIDATION_ERROR');
  return riderStatusFields.parse(Object.fromEntries(entries));
}

// Route mounting follows the registered migration and service handoffs.
export function createRiderHandlers(authorize: typeof principalUow = principalUow) {
  return {
    list: apiHandler((request) => authorize(request, { roles: ['RIDER'] }, async (client, principal) => {
      const params = new URL(request.url).searchParams;
      const entries = Array.from(params.entries());
      if (entries.length !== new Set(params.keys()).size) throw new AppError('VALIDATION_ERROR');
      return Response.json(await listRiderParcels(client, principal, riderListQuerySchema.parse(Object.fromEntries(entries))));
    })),
    updateStatus: apiHandler(async (request, { requestId }, context: { params: Promise<{ parcelId: string }> }) => {
      const detail = await authorize(request, { roles: ['RIDER'] }, async (client, principal) => {
        const { parcelId } = await context.params;
        if (!idSchema.safeParse(parcelId).success) throw new AppError('NOT_FOUND');
        return updateRiderStatus(client, principal, parcelId, await readStatusFields(request), requestId);
      });
      return Response.json(detail);
    }),
  };
}
