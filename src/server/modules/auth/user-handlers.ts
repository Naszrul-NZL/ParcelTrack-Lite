import 'server-only';
import { randomBytes } from 'node:crypto';
import { principalUow } from '@/server/core/authorized';
import { AppError } from '@/server/core/errors';
import { apiHandler } from '@/server/core/handler';
import { readJsonBody } from '@/server/core/json-body';
import { getSettings } from '@/server/core/settings';
import { auditQuerySchema, createRiderSchema, idSchema, temporaryPasswordSchema, userListQuerySchema, userStatusSchema } from '@/shared/schemas';
import { accountJournal, type AccountJournal } from './account-journal';
import { PasswordService, validatePassword } from './password';
import { createRider, listAuditEvents, listUsers, resetPassword, setUserActive } from './users';

let production: PasswordService | undefined;
const defaultPasswords = () => (production ??= new PasswordService(getSettings().HASH_CONCURRENCY));

/** 18 random bytes as 24 URL-safe characters: well inside the password policy, and never a common password. */
function newTemporaryPassword() {
  const value = randomBytes(18).toString('base64url');
  validatePassword(value);
  return value;
}

export function createUserAdminHandlers(authorize: typeof principalUow = principalUow, passwords: Pick<PasswordService, 'hash'> = { hash: value => defaultPasswords().hash(value) }, journal: () => AccountJournal = accountJournal) {
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
    audit: apiHandler(async request => {
      const result = await authorize(request, { roles: ['ADMIN'] }, async client => {
        const entries = Array.from(new URL(request.url).searchParams.entries());
        if (entries.length !== new Set(entries.map(([key]) => key)).size) throw new AppError('VALIDATION_ERROR');
        return listAuditEvents(client, auditQuerySchema.parse(Object.fromEntries(entries)));
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
      // After the transaction has committed, so the journal never records a change that rolled back.
      await journal().record(result.id, 'USER_STATUS_CHANGED', { isActive: result.isActive });
      return Response.json(result);
    }),
    // A08. The role is decided here, never by the request: the strict schema rejects a `role` field. Hashing happens
    // after the Admin check, inside the protected transaction; an Admin action is rare enough that the held connection is
    // acceptable, and the bounded hasher answers 503 BUSY rather than queueing.
    createRider: apiHandler(async (request, { requestId }) => {
      const result = await authorize(request, { roles: ['ADMIN'] }, async client => {
        const input = createRiderSchema.parse(await readJsonBody(request));
        try { validatePassword(input.initialPassword); }
        catch (error) {
          // The shared policy names its field `password`; this request calls it `initialPassword`.
          if (error instanceof AppError && error.fieldErrors?.password) throw new AppError('VALIDATION_ERROR', { initialPassword: error.fieldErrors.password });
          throw error;
        }
        return createRider(client, input, await passwords.hash(input.initialPassword), requestId);
      });
      await journal().record(result.id, 'USER_CREATED');
      return Response.json(result, { status: 201 });
    }),
    // A21. The generated password appears only in this response body: it is never stored, logged or audited, and the
    // response is `no-store`. The function leaves the target must-change, expiring in 72 hours, with no live sessions.
    resetPassword: apiHandler(async (request, { requestId }, { params }: { params: Promise<{ userId: string }> }) => {
      const result = await authorize(request, { roles: ['ADMIN'] }, async client => {
        const userId = idSchema.safeParse((await params).userId);
        if (!userId.success) throw new AppError('NOT_FOUND');
        const temporaryPassword = newTemporaryPassword();
        await resetPassword(client, userId.data, await passwords.hash(temporaryPassword), requestId);
        return { userId: userId.data, ...temporaryPasswordSchema.parse({ temporaryPassword }) };
      });
      await journal().record(result.userId, 'PASSWORD_RESET');
      return Response.json({ temporaryPassword: result.temporaryPassword });
    }),
  };
}
