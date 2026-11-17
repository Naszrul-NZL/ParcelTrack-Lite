import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PasswordService } from '@/server/modules/auth/password';
import { apiHandler } from '@/server/core/handler';
import { AppError } from '@/server/core/errors';
import { assertIsolatedTestConfiguration } from '../harness/isolated-database';
import { assertUnreachable } from '../harness/import-graph';
import { assertRowsComplete, assertRowsCoverEndpoints } from '../integration/authz_matrix/matrix';
import { authRows } from '../integration/authz_matrix/auth.rows';

// TMP-01: the injected test principal. The module name is reserved here so no integration test can ever import one.
export const PRINCIPAL_OVERRIDE = /(^|\/)principal-override(\.[cm]?[jt]sx?)?$/;

function workspace(files: Record<string, string>, run: (directory: string) => void) {
  const base = path.resolve('.local/contract-probes');
  fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, 'shortcut-'));
  try {
    const content = { 'tsconfig.json': JSON.stringify({ compilerOptions: { allowJs: true, module: 'esnext', moduleResolution: 'bundler', baseUrl: '.', paths: { '@/*': ['./src/*'] } } }), ...files };
    for (const [name, text] of Object.entries(content)) {
      const file = path.join(directory, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
    run(directory);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

describe('M1-PH2-TC16 retiring TMP-01 and TMP-04', () => {
  it('no integration test can import the principal override, directly or through a helper', () => {
    expect(() => assertUnreachable(process.cwd(), 'tests/integration', PRINCIPAL_OVERRIDE)).not.toThrow();
  });

  it('detects a direct import, an indirect import and a dynamic import (negative controls)', () => {
    const override = { 'tests/harness/principal-override.ts': 'export const asUser = () => 1;' };
    workspace({ ...override, 'tests/integration/a.test.ts': "import { asUser } from '../harness/principal-override'; asUser();" }, directory => {
      expect(() => assertUnreachable(directory, 'tests/integration', PRINCIPAL_OVERRIDE)).toThrow(/a\.test\.ts -> tests\/harness\/principal-override\.ts/);
    });
    workspace({ ...override, 'tests/harness/helper.ts': "export * from './principal-override';", 'tests/integration/b.test.ts': "import { asUser } from '../harness/helper'; asUser();" }, directory => {
      expect(() => assertUnreachable(directory, 'tests/integration', PRINCIPAL_OVERRIDE)).toThrow(/b\.test\.ts -> tests\/harness\/principal-override\.ts/);
    });
    workspace({ ...override, 'tests/integration/c.test.ts': "export const load = () => import('../harness/principal-override');" }, directory => {
      expect(() => assertUnreachable(directory, 'tests/integration', PRINCIPAL_OVERRIDE)).toThrow(/principal-override/);
    });
    workspace({ ...override, 'tests/integration/d.test.ts': "export const ok = 1;" }, directory => {
      expect(() => assertUnreachable(directory, 'tests/integration', PRINCIPAL_OVERRIDE)).not.toThrow();
    });
  });

  it('refuses the seeded fixture password machinery unless the profile and environment are the isolated test ones', () => {
    for (const env of [{ PTL_PROFILE: 'test', APP_ENV: 'development', ALLOW_SYNTHETIC_FIXTURES: 'local-only' }, { PTL_PROFILE: 'test', APP_ENV: 'production', ALLOW_SYNTHETIC_FIXTURES: 'local-only' }, { PTL_PROFILE: 'test', APP_ENV: 'test' }]) {
      expect(() => assertIsolatedTestConfiguration(env)).toThrow('require the test profile');
    }
  });
});

describe('M1-PH2-TC18 matrix harness rules', () => {
  it('fails when an implemented endpoint has no registered row', () => {
    expect(() => assertRowsCoverEndpoints([{ id: 'A01' }, { id: 'A12' }], authRows)).toThrow('A12');
    expect(() => assertRowsCoverEndpoints([{ id: 'A01' }, { id: 'A05' }], authRows)).not.toThrow();
  });

  it('fails when a row omits an identity', () => {
    const [row] = authRows;
    expect(() => assertRowsComplete([{ ...row, expected: { ...row.expected, admin: undefined as never } }])).toThrow('admin');
    expect(() => assertRowsComplete(authRows)).not.toThrow();
  });
});

describe('M1-PH2-TC13 and TC21 service guardrails', () => {
  it('turns a handler exception into a generic 500 with a request ID and no internals', async () => {
    const response = await apiHandler(() => { throw new Error('CANARY stack detail'); })(new Request('http://localhost/'));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ error: { code: 'INTERNAL_ERROR' }, requestId: expect.any(String) });
    expect(response.headers.get('x-request-id')).toBe(JSON.parse(text).requestId);
    expect(text).not.toContain('CANARY');
  });

  it('logs diagnostics for an internal error without its message, stack or request data', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const failure = Object.assign(new Error('CANARY secret detail password=hunter2'), { code: '23505' });
      const response = await apiHandler(() => { throw failure; })(new Request('http://localhost/', { method: 'POST', headers: { cookie: 'ptl_session_dev=CANARYCOOKIE' }, body: 'CANARYBODY' }));
      const { requestId } = await response.json();
      const lines = log.mock.calls.map(call => String(call[0]));
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toEqual({ event: 'request_failed', requestId, code: 'INTERNAL_ERROR', errorType: 'Error', sqlState: '23505' });
      expect(lines[0]).not.toMatch(/CANARY|hunter2/);
      // Expected failures (401, 403, 422) are not diagnostics and stay out of the log.
      await apiHandler(() => { throw new AppError('AUTH_INVALID'); })(new Request('http://localhost/'));
      expect(log).toHaveBeenCalledOnce();
    } finally { log.mockRestore(); }
  });

  it('answers hashing overload with BUSY instead of queueing unbounded Argon2 work', async () => {
    const service = new PasswordService(1);
    const hash = await service.hash('A-sufficiently-long-seed-value');
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => service.verify(hash, 'A-sufficiently-long-seed-value')));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(rejected).toHaveLength(3);
    for (const result of rejected) expect(result.reason).toMatchObject({ code: 'BUSY' });
  });
});
