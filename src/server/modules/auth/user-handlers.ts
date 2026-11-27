import 'server-only';
import { principalUow } from '@/server/core/authorized';
import { AppError } from '@/server/core/errors';
import { apiHandler } from '@/server/core/handler';
import { readJsonBody } from '@/server/core/json-body';
import { idSchema, userListQuerySchema, userStatusSchema } from '@/shared/schemas';
import { listUsers, setUserActive } from './users';

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
    // PATCH is an unsafe method, so `authorize` also enforces the session CSRF token, same-origin evidence and the
    // maintenance gate. The role check runs before the body is read, so an unauthorized caller never has it parsed.
    updateStatus: apiHandler(async (request, { requestId }, { params }: { params: Promise<{ userId: string }> }) => {
      const result = await authorize(request, { roles: ['ADMIN'] }, async client => {
        const userId = idSchema.safeParse((await params).userId);
        // A malformed id names no account, exactly like an unknown one.
        if (!userId.success) throw new AppError('NOT_FOUND');
        return setUserActive(client, userId.data, userStatusSchema.parse(await readJsonBody(request)), requestId);
      });
      return Response.json(result);
    }),
  };
}
