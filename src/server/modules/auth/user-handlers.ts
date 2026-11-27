import 'server-only';
import { principalUow } from '@/server/core/authorized';
import { AppError } from '@/server/core/errors';
import { apiHandler } from '@/server/core/handler';
import { userListQuerySchema } from '@/shared/schemas';
import { listUsers } from './users';

export function createUserAdminHandlers(authorize: typeof principalUow = principalUow) {
  return {
    list: apiHandler(async request => {
      const result = await authorize(request, { roles: ['ADMIN'] }, async client => {
        const params = new URL(request.url).searchParams;
        const entries = Array.from(params.entries());
        // A repeated key is ambiguous input, not something to merge or pick from.
        if (entries.length !== new Set(params.keys()).size) throw new AppError('VALIDATION_ERROR');
        return listUsers(client, userListQuerySchema.parse(Object.fromEntries(entries)));
      });
      return Response.json(result);
    }),
  };
}
