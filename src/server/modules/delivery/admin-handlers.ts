import 'server-only';
import { principalUow } from '@/server/core/authorized';
import { AppError } from '@/server/core/errors';
import { apiHandler } from '@/server/core/handler';
import { readJsonBody } from '@/server/core/json-body';
import { idSchema } from '@/shared/schemas';
import { adminParcelListQuerySchema, assignmentSchema } from '@/features/delivery/admin-contract';
import { assignAdminParcel, listAdminParcels } from './admin-service';

export function createDeliveryAdminHandlers(authorize: typeof principalUow = principalUow) {
  return {
    list: apiHandler(async request => {
      const result = await authorize(request, { roles: ['ADMIN'] }, async client => {
        const params = new URL(request.url).searchParams;
        const entries = Array.from(params.entries());
        if (entries.length !== new Set(params.keys()).size) throw new AppError('VALIDATION_ERROR');
        return listAdminParcels(client, adminParcelListQuerySchema.parse(Object.fromEntries(entries)));
      });
      return Response.json(result);
    }),
    assign: apiHandler(async (request, { requestId }, { params }: { params: Promise<{ parcelId: string }> }) => {
      const detail = await authorize(request, { roles: ['ADMIN'] }, async (client, principal) => {
        const parcelId = idSchema.safeParse((await params).parcelId);
        if (!parcelId.success) throw new AppError('NOT_FOUND');
        return assignAdminParcel(client, principal, parcelId.data, assignmentSchema.parse(await readJsonBody(request)), requestId);
      });
      return Response.json(detail);
    }),
  };
}
