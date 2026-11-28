import 'server-only';
import { principalUow } from '@/server/core/authorized';
import { AppError } from '@/server/core/errors';
import { apiHandler } from '@/server/core/handler';
import { idSchema, parcelListQuerySchema } from '@/shared/schemas';
import { listSellerParcels, readParcelDetail } from './read-service';

export function createParcelReadHandlers(authorize: typeof principalUow = principalUow) {
  return {
    list: apiHandler(async request => {
      const result = await authorize(request, { roles: ['SELLER'] }, async (client, principal) => {
        const query = new URL(request.url).searchParams;
        const entries = Array.from(query.entries());
        if (entries.length !== new Set(query.keys()).size) throw new AppError('VALIDATION_ERROR');
        return listSellerParcels(client, principal.id, parcelListQuerySchema.parse(Object.fromEntries(entries)));
      });
      return Response.json(result);
    }),
    detail: apiHandler(async (request, { requestId }, { params }: { params: Promise<{ parcelId: string }> }) => {
      const detail = await authorize(request, {}, async (client, principal) => {
        const id = idSchema.parse((await params).parcelId);
        return readParcelDetail(client, principal, id, requestId);
      });
      return Response.json(detail);
    }),
  };
}
