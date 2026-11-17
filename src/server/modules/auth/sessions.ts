import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { LIMITS } from '@/shared/constants';
import type { Settings } from '@/server/core/settings';

type Queryable = Pick<PoolClient, 'query'>;
type CookieSettings = Pick<Settings, 'APP_ENV' | 'SESSION_COOKIE_NAME'>;

// A session row is touched at most this often; the idle clock is 30 minutes, so the write rate stays low.
export const TOUCH_AFTER_SECONDS = 60;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export const newToken = () => randomBytes(32).toString('base64url');
export const tokenDigest = (token: string) => createHash('sha256').update(token).digest('hex');

/** Returns the one well-formed session token in the Cookie header, or null for none, duplicates or malformed values. */
export function readCookieToken(request: Request, cookieName: string): string | null {
  const values = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(cookieName + '='));
  if (values.length !== 1) return null;
  const token = values[0].slice(cookieName.length + 1);
  return TOKEN.test(token) ? token : null;
}

const attributes = (settings: CookieSettings) => '; Path=/; HttpOnly; SameSite=Lax' + (settings.APP_ENV === 'production' ? '; Secure' : '');
export const sessionCookie = (settings: CookieSettings, token: string, maxAgeSeconds: number) =>
  `${settings.SESSION_COOKIE_NAME}=${token}${attributes(settings)}; Max-Age=${Math.floor(maxAgeSeconds)}`;
export const expiredCookie = (settings: CookieSettings) =>
  `${settings.SESSION_COOKIE_NAME}=${attributes(settings)}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;

export type LiveSession = { csrfToken: string; userId: string | null };

/** Unexpired anonymous or user session. A user session also needs an active account at the same session version. */
export async function findLiveSession(client: Queryable, digest: string): Promise<LiveSession | null> {
  const result = await client.query<{ csrf_token: string; user_id: string | null }>(
    `SELECT s.csrf_token,s.user_id FROM app.auth_session s LEFT JOIN app.app_user u ON u.id=s.user_id
      WHERE s.token_digest=$1 AND s.expires_at>now() AND s.absolute_expires_at>now()
        AND (s.user_id IS NULL OR (u.is_active AND u.session_version=s.user_session_version
          AND s.last_seen_at>now()-make_interval(mins=>$2)))`, [digest, LIMITS.idleMinutes]);
  const row = result.rows[0];
  return row ? { csrfToken: row.csrf_token, userId: row.user_id } : null;
}

export async function createAnonymousSession(client: Queryable) {
  const token = newToken(), csrfToken = newToken();
  await client.query(
    `INSERT INTO app.auth_session(token_digest,csrf_token,expires_at,absolute_expires_at)
     VALUES($1,$2,now()+make_interval(mins=>$3),now()+make_interval(mins=>$3))`, [tokenDigest(token), csrfToken, LIMITS.anonymousMinutes]);
  return { token, csrfToken, maxAgeSeconds: LIMITS.anonymousMinutes * 60 };
}

/** Binds the new row to the version the caller verified; a concurrent version change inserts nothing. */
export async function createUserSession(client: Queryable, userId: string, sessionVersion: number) {
  const token = newToken(), csrfToken = newToken();
  const result = await client.query(
    `INSERT INTO app.auth_session(token_digest,user_id,user_session_version,csrf_token,expires_at,absolute_expires_at)
     SELECT $1,u.id,u.session_version,$2,now()+make_interval(mins=>$3),now()+make_interval(hours=>$4)
       FROM app.app_user u WHERE u.id=$5 AND u.is_active AND u.session_version=$6`,
    [tokenDigest(token), csrfToken, LIMITS.idleMinutes, LIMITS.absoluteHours, userId, sessionVersion]);
  return result.rowCount === 1 ? { token, csrfToken, maxAgeSeconds: LIMITS.absoluteHours * 3600 } : null;
}

/** UPDATE only: an expired or revoked row is never recreated, and an anonymous row is never extended. */
export async function touchSession(client: Queryable, digest: string) {
  const result = await client.query(
    `UPDATE app.auth_session SET last_seen_at=now(),expires_at=LEAST(now()+make_interval(mins=>$2),absolute_expires_at)
      WHERE token_digest=$1 AND user_id IS NOT NULL AND expires_at>now() AND absolute_expires_at>now()
        AND last_seen_at<=now()-make_interval(secs=>$3)`, [digest, LIMITS.idleMinutes, TOUCH_AFTER_SECONDS]);
  return result.rowCount === 1;
}

export async function revokeSession(client: Queryable, digest: string) {
  await client.query('DELETE FROM app.auth_session WHERE token_digest=$1', [digest]);
}
