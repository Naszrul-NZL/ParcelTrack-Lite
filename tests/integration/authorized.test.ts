import { beforeAll, afterAll, it, expect } from 'vitest';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';
import { Barrier } from '../harness/database';
import { createPrincipalUow } from '@/server/core/authorized';
import { apiHandler } from '@/server/core/handler';

const origin = process.env.APP_ORIGIN!;
const settings = { APP_ORIGIN: origin, SESSION_COOKIE_NAME: 'ptl_session_dev' };
let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

function request(cookie = '', method = 'GET', headers: Record<string, string> = {}) {
  return new Request(origin + '/api/v1/parcels/1', { method, headers: { cookie, ...headers } });
}

async function execute(database: IsolatedDatabase, sql: string, parameters: unknown[] = []) {
  const client = await database.pool().connect();
  try { return await client.query(sql, parameters); } finally { client.release(); }
}

it('H04/H07 authenticates inside one transaction and applies the verified Seller RLS context', async () => {
  await harness.run(async database => {
    const session = await database.session('seller.a');
    const service = createPrincipalUow(database.pool(), settings);
    const rows = await service(request(session.cookie, 'GET', { 'x-test-user': database.accounts['seller.b'] }), { roles: ['SELLER'] }, async (client, principal) => {
      expect(principal.id).toBe(database.accounts['seller.a']);
      return (await client.query('SELECT seller_id FROM app.parcel')).rows;
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row => row.seller_id === database.accounts['seller.a'])).toBe(true);
    expect((await execute(database, 'SELECT id FROM app.parcel')).rowCount).toBe(0);
    await expect(service(request('', 'GET', { 'x-test-user': session.userId }), {}, async () => true)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

it('H04 rejects wrong roles, inactive accounts, duplicate cookies and the must-change gate', async () => {
  await harness.run(async database => {
    const service = createPrincipalUow(database.pool(), settings);
    for (const [username, roles, code] of [
      ['seller.a', ['ADMIN'], 'FORBIDDEN'], ['inactive', ['RIDER'], 'UNAUTHENTICATED'], ['must.change', ['RIDER'], 'PASSWORD_CHANGE_REQUIRED'],
    ] as const) {
      const session = await database.session(username);
      await expect(service(request(session.cookie), { roles }, async () => { throw new Error('Forbidden callback executed'); })).rejects.toMatchObject({ code });
    }
    const session = await database.session('seller.a');
    await expect(service(request(session.cookie + '; ' + session.cookie), {}, async () => true)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

it('H04 refuses a privileged connection even when it contains a valid session', async () => {
  await harness.run(async database => {
    const session = await database.session('seller.a');
    const owner = await database.migrationClient();
    const service = createPrincipalUow({ connect: async () => Object.assign(owner, { release: () => {} }) as unknown as import('pg').PoolClient }, settings);
    await expect(service(request(session.cookie), {}, async () => { throw new Error('Privileged callback executed'); })).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});

it('H04 binds CSRF to the current session and checks provenance on every unsafe method', async () => {
  await harness.run(async database => {
    const session = await database.session('seller.a');
    const other = await database.session('seller.b');
    const service = createPrincipalUow(database.pool(), settings);
    for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) {
      const denied: Record<string, string>[] = [
        { origin }, { origin, 'x-csrf-token': other.csrfToken },
        { origin: 'https://foreign.invalid', 'x-csrf-token': session.csrfToken },
        { 'x-csrf-token': session.csrfToken },
      ];
      for (const headers of denied) await expect(service(request(session.cookie, method, headers), {}, async () => true)).rejects.toMatchObject({ code: 'CSRF_INVALID' });
      expect(await service(request(session.cookie, method, { origin, 'x-csrf-token': session.csrfToken }), {}, async () => 'allowed')).toBe('allowed');
    }
    expect(await service(request(session.cookie, 'POST', { referer: origin + '/seller/parcels', 'x-csrf-token': session.csrfToken }), {}, async () => true)).toBe(true);
    expect(await service(request(session.cookie, 'POST', { 'sec-fetch-site': 'same-origin', 'x-csrf-token': session.csrfToken }), {}, async () => true)).toBe(true);
  });
});

it('H04 rejects revoked, expired, disabled and stale-version sessions on the next service call', async () => {
  await harness.run(async database => {
    const service = createPrincipalUow(database.pool(), settings);
    for (const change of ['revoke', 'expiry', 'idle', 'version', 'disable']) {
      const session = await database.session('seller.a');
      if (change === 'revoke') await execute(database, 'DELETE FROM app.auth_session WHERE token_digest=$1', [session.digest]);
      if (change === 'expiry') await execute(database, "UPDATE app.auth_session SET created_at=now()-interval '1 hour',expires_at=now()-interval '1 minute' WHERE token_digest=$1", [session.digest]);
      if (change === 'idle') await execute(database, "UPDATE app.auth_session SET last_seen_at=now()-interval '30 minutes' WHERE token_digest=$1", [session.digest]);
      if (change === 'version' || change === 'disable') {
        const fixture = await database.fixtureClient();
        await fixture.query('SET ROLE auth_fn_owner');
        await fixture.query(change === 'version' ? 'UPDATE app.app_user SET session_version=session_version+1 WHERE id=$1' : 'UPDATE app.app_user SET is_active=false WHERE id=$1', [session.userId]);
      }
      await expect(service(request(session.cookie), {}, async () => true)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    }
  });
});

it('H07 commits before a success response and rolls back failures without pooled identity leakage', async () => {
  await harness.run(async database => {
    const session = await database.session('seller.a');
    const service = createPrincipalUow(database.pool(), settings);
    const mutation = request(session.cookie, 'POST', { origin, 'x-csrf-token': session.csrfToken });
    const insert = "INSERT INTO app.rate_limit_bucket VALUES('boundary-probe',repeat('a',64),1,1,now()+interval '1 hour')";
    const failing = apiHandler(async incoming => service(incoming, {}, async client => {
      await client.query(insert);
      throw new Error('CANARY private internal failure');
    }));
    const failure = await failing(mutation);
    expect(failure.status).toBe(500);
    expect(await failure.text()).not.toContain('CANARY');
    expect((await execute(database, 'SELECT * FROM app.rate_limit_bucket')).rowCount).toBe(0);
    const success = apiHandler(async incoming => {
      await service(incoming, {}, async client => { await client.query(insert); });
      return Response.json({ committed: true });
    });
    const response = await success(mutation);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await execute(database, 'SELECT * FROM app.rate_limit_bucket')).rowCount).toBe(1);
    expect((await execute(database, 'SELECT id FROM app.parcel')).rowCount).toBe(0);
  });
});

it('H07 RLS rechecks account version across statements during an in-flight read', async () => {
  await harness.run(async database => {
    const session = await database.session('seller.a');
    const entered = new Barrier(), changed = new Barrier();
    const service = createPrincipalUow(database.pool(), settings);
    const pending = service(request(session.cookie), {}, async client => {
      expect((await client.query('SELECT id FROM app.parcel')).rowCount).toBeGreaterThan(0);
      entered.open(); await changed.wait();
      return (await client.query('SELECT id FROM app.parcel')).rowCount;
    });
    await entered.wait();
    const fixture = await database.fixtureClient();
    try {
      await fixture.query('SET ROLE auth_fn_owner');
      await fixture.query('UPDATE app.app_user SET session_version=session_version+1 WHERE id=$1', [session.userId]);
    } finally { changed.open(); }
    expect(await pending).toBe(0);
  });
});

it('H07 rejects mutations during maintenance while permitting authorized reads', async () => {
  await harness.run(async database => {
    const session = await database.session('seller.a');
    const service = createPrincipalUow(database.pool(), settings);
    const operator = await database.migrationClient();
    await operator.query('SET ROLE ops_fn_owner');
    await operator.query("UPDATE app.system_state SET maintenance_mode=true,set_until=now()+interval '5 minutes'");
    await expect(service(request(session.cookie, 'POST', { origin, 'x-csrf-token': session.csrfToken }), {}, async () => true)).rejects.toMatchObject({ code: 'MAINTENANCE' });
    expect(await service(request(session.cookie), {}, async () => true)).toBe(true);
  });
});
