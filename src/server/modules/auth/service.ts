import 'server-only';
import type { PoolClient } from 'pg';
import { LIMITS } from '@/shared/constants';
import { loginSchema, usernameSchema, type Principal } from '@/shared/schemas';
import { AppError } from '@/server/core/errors';
import { assertConnectedRole, getPool, transaction, type TransactionPool } from '@/server/core/db';
import { getSettings, type Settings } from '@/server/core/settings';
import { sourceAddress } from '@/server/core/request';
import { PasswordService } from './password';
import { recordAudit } from './audit';
import { verifyCsrf } from './csrf';
import { RATE_RULES, RateLimiter, normalizeSource, type Clock } from './rate-limit';
import { readSessionContext } from './session-context';
import {
  createAnonymousSession, createUserSession, expiredCookie, findLiveSession, readCookieToken,
  revokeSession, sessionCookie, tokenDigest,
} from './sessions';

type Context = { requestId: string };
export type AuthServiceSettings = Pick<Settings, 'APP_ENV' | 'APP_ORIGIN' | 'SESSION_COOKIE_NAME' | 'RATE_LIMIT_KEY'>;
export type AuthServiceDependencies = {
  pool: TransactionPool;
  settings: AuthServiceSettings;
  passwords: Pick<PasswordService, 'verify'>;
  /** Trusted client address; defaults to the adapter-supplied socket address. */
  source?: (request: Request) => string;
  clock?: Clock;
};

type Snapshot = { id: string; password_hash: string; session_version: number; is_active: boolean; must_change_password: boolean };
type Attempt = { username: string; usernameDigest: string; length: number; source: string; requestId: string };
type Issued = { principal: Principal; token: string; csrfToken: string; maxAgeSeconds: number };

const hasJsonBody = (request: Request) => (request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json');

/** Reads at most `LIMITS.jsonBytes` bytes; the declared length is checked first so oversized bodies are never buffered. */
async function readBoundedJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(declared) || declared > LIMITS.jsonBytes) throw new AppError('VALIDATION_ERROR', { body: 'The request is too large.' });
  if (!hasJsonBody(request) || !request.body) throw new AppError('VALIDATION_ERROR', { body: 'Send the request as JSON.' });
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > LIMITS.jsonBytes) { await reader.cancel(); throw new AppError('VALIDATION_ERROR', { body: 'The request is too large.' }); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError('VALIDATION_ERROR', { body: 'Send the request as JSON.' }); }
}

export function createAuthService(dependencies: AuthServiceDependencies) {
  const { pool, settings, passwords } = dependencies;
  const limiter = new RateLimiter(settings.RATE_LIMIT_KEY, dependencies.clock);
  const sourceOf = (request: Request) => normalizeSource((dependencies.source ?? sourceAddress)(request));
  // Session, CSRF and limiter housekeeping never take the backup lock, so these transactions are not write transactions.
  const work = <T>(task: (client: PoolClient) => Promise<T>) => transaction(pool, {}, async client => {
    await assertConnectedRole(client, 'app_runtime');
    return task(client);
  });

  async function readSnapshot(client: PoolClient, username: string): Promise<Snapshot | null> {
    const result = await client.query<Snapshot>('SELECT id,password_hash,session_version,is_active,must_change_password FROM app.get_login_snapshot($1)', [username]);
    return result.rows[0] ?? null;
  }

  /** A01: resume the caller's session, or lazily create an anonymous one (limited per source). */
  async function csrf(request: Request): Promise<Response> {
    const token = readCookieToken(request, settings.SESSION_COOKIE_NAME);
    type Outcome = { csrfToken: string; created?: Awaited<ReturnType<typeof createAnonymousSession>>; retryAfter?: number };
    const outcome = await work(async (client): Promise<Outcome> => {
      const existing = token ? await findLiveSession(client, tokenDigest(token)) : null;
      if (existing) return { csrfToken: existing.csrfToken };
      const charged = await limiter.increment(client, RATE_RULES.anonymousSession, sourceOf(request));
      if (charged.count > RATE_RULES.anonymousSession.limit) return { csrfToken: '', retryAfter: charged.retryAfter };
      const created = await createAnonymousSession(client);
      return { csrfToken: created.csrfToken, created };
    });
    if (outcome.retryAfter !== undefined) throw new AppError('RATE_LIMITED', undefined, outcome.retryAfter);
    const headers: Record<string, string> = {};
    if (outcome.created) headers['Set-Cookie'] = sessionCookie(settings, outcome.created.token, outcome.created.maxAgeSeconds);
    return Response.json({ csrfToken: outcome.csrfToken }, { headers });
  }

  /** Counters and the failure audit commit in their own transaction after the login transaction has closed. */
  async function recordFailure(attempt: Attempt, reason: string, targetUserId: string | null): Promise<never> {
    await work(async client => {
      await limiter.increment(client, RATE_RULES.loginPair, attempt.usernameDigest, attempt.source);
      const user = await limiter.increment(client, RATE_RULES.loginUser, attempt.usernameDigest);
      await limiter.increment(client, RATE_RULES.loginSource, attempt.source);
      const details = { reason, usernameDigest: attempt.usernameDigest, usernameLength: attempt.length };
      await recordAudit(client, { type: 'LOGIN_FAILED', outcome: 'FAILURE', requestId: attempt.requestId, targetUserId, details });
      // The username-only counter alerts but never blocks, so a remote attacker cannot lock out the real user.
      if (user.count === RATE_RULES.loginUser.limit) {
        await recordAudit(client, { type: 'LOGIN_THROTTLED', outcome: 'FAILURE', requestId: attempt.requestId, targetUserId, details: { scope: 'username', usernameDigest: attempt.usernameDigest } });
      }
    });
    throw new AppError('AUTH_INVALID');
  }

  /** A hard block when this (username, source) pair or the source has too many recent failures. */
  async function checkBlocked(attempt: Attempt) {
    const blocked = await work(async client => {
      const pair = await limiter.count(client, RATE_RULES.loginPair, attempt.usernameDigest, attempt.source);
      const source = await limiter.count(client, RATE_RULES.loginSource, attempt.source);
      const scope = pair.count >= RATE_RULES.loginPair.limit ? 'username_source' : source.count >= RATE_RULES.loginSource.limit ? 'source' : null;
      if (!scope) return null;
      // One audit event per scope and window, so a flood of blocked attempts cannot flood the audit table.
      const first = (await limiter.increment(client, RATE_RULES.throttleAudit, scope, attempt.usernameDigest, attempt.source)).count === 1;
      if (first) await recordAudit(client, { type: 'LOGIN_THROTTLED', outcome: 'FAILURE', requestId: attempt.requestId, details: { scope, usernameDigest: attempt.usernameDigest, retryAfter: pair.retryAfter } });
      return { retryAfter: scope === 'source' ? source.retryAfter : pair.retryAfter };
    });
    if (blocked) throw new AppError('RATE_LIMITED', undefined, blocked.retryAfter);
  }

  /** A03 */
  async function login(request: Request, { requestId }: Context): Promise<Response> {
    // Cheap rejections first: a declared oversize body never reaches the database or the hasher.
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (!Number.isFinite(declared) || declared > LIMITS.jsonBytes) throw new AppError('VALIDATION_ERROR', { body: 'The request is too large.' });
    const presented = readCookieToken(request, settings.SESSION_COOKIE_NAME);
    const presentedDigest = presented ? tokenDigest(presented) : null;
    const session = presentedDigest ? await work(client => findLiveSession(client, presentedDigest)) : null;
    if (!session) throw new AppError('CSRF_INVALID');
    verifyCsrf(request, session.csrfToken, settings.APP_ORIGIN);

    const input = loginSchema.parse(await readBoundedJson(request));
    const normalized = input.username.trim().toLowerCase();
    const username = usernameSchema.safeParse(normalized).success ? normalized : null;
    const source = sourceOf(request);
    const attempt: Attempt = {
      username: normalized, usernameDigest: limiter.digest('username', normalized.slice(0, 256)),
      length: Array.from(normalized).length, source, requestId,
    };
    await checkBlocked(attempt);

    // Short read, then hash outside any transaction so slow Argon2 work never holds a database connection.
    const snapshot = username ? await work(client => readSnapshot(client, username)) : null;
    const matched = await passwords.verify(snapshot?.password_hash ?? null, input.password);
    if (!snapshot || !matched || !snapshot.is_active) {
      return recordFailure(attempt, !snapshot ? 'unknown_user' : !snapshot.is_active ? 'inactive' : 'bad_password', snapshot?.id ?? null);
    }

    const issued = await work(async (client): Promise<Issued | null> => {
      // Re-read inside the issuing transaction: the account must be unchanged since the password was verified.
      const current = await readSnapshot(client, username!);
      if (!current || current.id !== snapshot.id || current.password_hash !== snapshot.password_hash
        || current.session_version !== snapshot.session_version || !current.is_active) return null;
      const profile = (await client.query<{ id: string; username: string; display_name: string; role: Principal['role']; must_change_password: boolean }>(
        'SELECT id,username,display_name,role,must_change_password FROM app.app_user WHERE id=$1', [current.id])).rows[0];
      if (presentedDigest) await revokeSession(client, presentedDigest);
      const created = await createUserSession(client, current.id, current.session_version);
      if (!created) return null;
      // Same transaction as the session: if the audit store fails, no session exists.
      await recordAudit(client, { type: 'LOGIN_SUCCEEDED', outcome: 'SUCCESS', requestId, actorId: current.id });
      return {
        principal: { id: profile.id, username: profile.username, displayName: profile.display_name, role: profile.role, mustChangePassword: profile.must_change_password },
        token: created.token, csrfToken: created.csrfToken, maxAgeSeconds: created.maxAgeSeconds,
      };
    });
    if (!issued) return recordFailure(attempt, 'changed_during_login', snapshot.id);
    return Response.json({ ...issued.principal, csrfToken: issued.csrfToken }, { headers: { 'Set-Cookie': sessionCookie(settings, issued.token, issued.maxAgeSeconds) } });
  }

  /** A04: allowed for every authenticated account, including one that must change its password. */
  async function logout(request: Request, { requestId }: Context): Promise<Response> {
    const token = readCookieToken(request, settings.SESSION_COOKIE_NAME);
    if (!token) throw new AppError('UNAUTHENTICATED');
    const digest = tokenDigest(token);
    await work(async client => {
      const session = await findLiveSession(client, digest);
      if (!session?.userId) throw new AppError('UNAUTHENTICATED');
      verifyCsrf(request, session.csrfToken, settings.APP_ORIGIN);
      await revokeSession(client, digest);
      await recordAudit(client, { type: 'LOGOUT', outcome: 'SUCCESS', requestId, actorId: session.userId });
    });
    return new Response(null, { status: 204, headers: { 'Set-Cookie': expiredCookie(settings) } });
  }

  /** A05 */
  async function me(request: Request): Promise<Response> {
    // Visitors without a session cookie are the common case on public pages; answer without touching the database.
    if (!readCookieToken(request, settings.SESSION_COOKIE_NAME)) throw new AppError('UNAUTHENTICATED');
    const principal = await work(async client => (await readSessionContext(client, request, settings.SESSION_COOKIE_NAME)).principal);
    const { id, username, displayName, role, mustChangePassword } = principal;
    return Response.json({ id, username, displayName, role, mustChangePassword });
  }

  return { csrf, login, logout, me };
}

let production: ReturnType<typeof createAuthService> | undefined;
/** Application wiring: the restricted `app_runtime` pool and validated server settings. */
export function authService() {
  production ??= createAuthService({ pool: getPool('app_runtime'), settings: getSettings(), passwords: new PasswordService(getSettings().HASH_CONCURRENCY) });
  return production;
}
