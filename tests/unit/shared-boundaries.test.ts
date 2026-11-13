import { it, expect } from 'vitest';
import { z } from 'zod';
import { apiHandler } from '@/server/core/handler';
import { verifyCsrf } from '@/server/modules/auth/csrf';
import { sessionDigest } from '@/server/modules/auth/session-context';
import { assertIsolatedTestConfiguration, TestClock } from '../harness/isolated-database';

it('H05 normalizes unexpected/validation failures without echoing input and preserves response correlation', async () => {
  const handler = apiHandler(() => { z.strictObject({ password: z.string().min(10) }).parse({ password: 'CANARY' }); return new Response(); });
  const response = await handler(new Request('http://localhost', { headers: { 'x-request-id': 'CANARY' } }));
  const body = await response.json();
  expect(response.status).toBe(422);
  expect(JSON.stringify(body)).not.toContain('CANARY');
  expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(response.headers.get('x-request-id')).toBe(body.requestId);
  expect(response.headers.get('cache-control')).toBe('no-store');
});

it('H05 supports Next dynamic route context without mixing it with request metadata', async () => {
  const handler = apiHandler(async (_request, metadata, context: { params: Promise<{ id: string }> }) => Response.json({ ...(await context.params), requestId: metadata.requestId }));
  const response = await handler(new Request('http://localhost'), { params: Promise.resolve({ id: '7' }) });
  expect(await response.json()).toEqual({ id: '7', requestId: response.headers.get('x-request-id') });
});

it('H04 fails closed for duplicate/malformed cookies and ignores identity headers', () => {
  for (const cookie of ['', 'ptl_session_dev=short', `ptl_session_dev=${'a'.repeat(43)}; ptl_session_dev=${'b'.repeat(43)}`]) {
    expect(() => sessionDigest(new Request('http://localhost', { headers: { cookie, 'x-test-user': '1' } }), 'ptl_session_dev')).toThrow('UNAUTHENTICATED');
  }
});

it('H04 a foreign Origin cannot be rescued by same-origin Fetch Metadata or Referer', () => {
  const token = 'a'.repeat(43);
  const request = new Request('http://localhost', { headers: { origin: 'https://foreign.invalid', 'sec-fetch-site': 'same-origin', referer: 'http://localhost/', 'x-csrf-token': token } });
  expect(() => verifyCsrf(request, token, 'http://localhost')).toThrow('CSRF_INVALID');
});

it('HAR-01 refuses production/development databases and remote Storage before connecting', () => {
  const env = {
    PTL_PROFILE: 'test', APP_ENV: 'test', ALLOW_SYNTHETIC_FIXTURES: 'local-only',
    BOOTSTRAP_DATABASE_URL: 'postgresql://postgres@127.0.0.1:54323/postgres',
    MIGRATION_DATABASE_URL: 'postgresql://migration_owner@127.0.0.1:54323/postgres',
    FIXTURE_DATABASE_URL: 'postgresql://fixture_provisioner@127.0.0.1:54323/postgres',
    APP_DATABASE_URL: 'postgresql://app_runtime@127.0.0.1:54323/postgres',
    TRACKING_DATABASE_URL: 'postgresql://tracking_runtime@127.0.0.1:54323/postgres',
    SUPABASE_INTERNAL_URL: 'http://127.0.0.1:8001',
  };
  expect(() => assertIsolatedTestConfiguration(env)).not.toThrow();
  for (const change of [{ APP_ENV: 'production' }, { PTL_PROFILE: 'development' }, { ALLOW_SYNTHETIC_FIXTURES: '' }, { APP_DATABASE_URL: env.APP_DATABASE_URL.replace('54323', '54322') }, { SUPABASE_INTERNAL_URL: 'https://remote.invalid' }]) {
    expect(() => assertIsolatedTestConfiguration({ ...env, ...change })).toThrow();
  }
  const clock = new TestClock();
  const first = clock.now(); clock.advance(1000);
  expect(clock.now().getTime() - first.getTime()).toBe(1000);
  expect(() => clock.advance(-1)).toThrow();
});
