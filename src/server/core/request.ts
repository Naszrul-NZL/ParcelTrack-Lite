import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { AppError } from './errors';
import { getSettings } from './settings';
export function equalSecret(a: string, b: string) { const aa=Buffer.from(a); const bb=Buffer.from(b); return aa.length === bb.length && timingSafeEqual(aa,bb); }
export function verifyOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin) { if (origin !== getSettings().APP_ORIGIN) throw new AppError('CSRF_INVALID'); return; }
  if (request.headers.get('sec-fetch-site') === 'same-origin') return;
  try { if (new URL(request.headers.get('referer') ?? '').origin === getSettings().APP_ORIGIN) return; } catch { /* Missing/malformed provenance is rejected below. */ }
  throw new AppError('CSRF_INVALID');
}
export function sourceAddress(request: Request): string {
  const expected=process.env.PTL_ADAPTER_SECRET;
  if (!expected || !equalSecret(request.headers.get('x-ptl-adapter-token') ?? '',expected)) throw new AppError('BUSY');
  const source=request.headers.get('x-ptl-client-ip');
  if (!source) throw new AppError('BUSY');
  return source;
}
