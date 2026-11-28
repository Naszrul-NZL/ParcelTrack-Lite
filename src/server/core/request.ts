import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { AppError } from './errors';
import { getSettings } from './settings';
export function equalSecret(a: string, b: string) { const aa=Buffer.from(a); const bb=Buffer.from(b); return aa.length === bb.length && timingSafeEqual(aa,bb); }
export function verifyOrigin(request: Request, expectedOrigin = getSettings().APP_ORIGIN) {
  const origin = request.headers.get('origin');
  if (origin) { if (origin !== expectedOrigin) throw new AppError('CSRF_INVALID'); return; }
  if (request.headers.get('sec-fetch-site') === 'same-origin') return;
  try { if (new URL(request.headers.get('referer') ?? '').origin === expectedOrigin) return; } catch { /* Missing/malformed provenance is rejected below. */ }
  throw new AppError('CSRF_INVALID');
}
/**
 * The client address used to key rate limits (login, registration, anonymous sessions, public tracking).
 * - On Vercel there is no custom server. Vercel's edge sets `x-vercel-forwarded-for` and `x-real-ip` itself and
 *   overwrites any client-supplied value, so the first entry is the real client address.
 * - Locally, `scripts/server.mjs` stamps the socket address with a per-process token, and requests without that token
 *   are refused, so a client cannot choose its own bucket.
 */
export function sourceAddress(request: Request, env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL === '1') {
    const forwarded = (request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-real-ip') ?? '').split(',')[0].trim();
    if (!forwarded) throw new AppError('BUSY');
    return forwarded;
  }
  const expected=env.PTL_ADAPTER_SECRET;
  if (!expected || !equalSecret(request.headers.get('x-ptl-adapter-token') ?? '',expected)) throw new AppError('BUSY');
  const source=request.headers.get('x-ptl-client-ip');
  if (!source) throw new AppError('BUSY');
  return source;
}
