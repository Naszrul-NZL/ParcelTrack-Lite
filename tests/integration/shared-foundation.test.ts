import { beforeAll, afterAll, it, expect } from 'vitest';
import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';
import { assertConnectedRole, transaction } from '@/server/core/db';
import { SupabaseProofStore } from '@/server/modules/delivery/storage';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

async function counts(database: IsolatedDatabase) {
  const client = await database.pool().connect();
  try { return (await client.query('SELECT (SELECT count(*) FROM app.auth_session)::integer sessions,(SELECT count(*) FROM app.rate_limit_bucket)::integer buckets')).rows[0]; }
  finally { client.release(); }
}

it('HAR-01 clones a clean fixture after a committed test and deletes its temporary files', async () => {
  let firstName = '', directory = '';
  await harness.run(async database => {
    firstName = database.name; directory = database.directory;
    expect(await counts(database)).toEqual({ sessions: 0, buckets: 0 });
    expect(database.loginInput('seller.a').password).toHaveLength(43);
    const session = await database.session('seller.a');
    await transaction(database.pool(), {}, async client => {
      expect((await client.query('SELECT token_digest FROM app.auth_session')).rows[0].token_digest).toBe(session.digest);
      await client.query("INSERT INTO app.rate_limit_bucket VALUES('probe',repeat('a',64),1,1,now()+interval '1 hour')");
    });
    await writeFile(path.join(directory, 'private-probe.txt'), 'synthetic');
    if (process.platform !== 'win32') expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect(await counts(database)).toEqual({ sessions: 1, buckets: 1 });
  });
  await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
  await harness.run(async database => {
    expect(database.name).not.toBe(firstName);
    expect(await counts(database)).toEqual({ sessions: 0, buckets: 0 });
    const owner = await database.migrationClient();
    expect((await owner.query('SELECT datname FROM pg_database WHERE datname=$1', [firstName])).rowCount).toBe(0);
  });
});

it('HAR-01 asserts both runtime roles and rejects an owner connection', async () => {
  await harness.run(async database => {
    for (const role of ['app_runtime', 'tracking_runtime'] as const) {
      const client = await database.pool(role).connect();
      try { await assertConnectedRole(client, role); } finally { client.release(); }
    }
    const owner = await database.migrationClient();
    await expect(assertConnectedRole(owner as unknown as import('pg').PoolClient, 'app_runtime')).rejects.toThrow('Restricted runtime role');
  });
});

it('HAR-01 cleans tracked Storage objects and database connections even when a test fails', async () => {
  let key = '', directory = '';
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#39358c' } }).png().toBuffer();
  await expect(harness.run(async database => {
    directory = database.directory;
    key = database.storageKey('1', 'png');
    await database.storage.publish(key, bytes, 'image/png');
    expect(await database.storage.exists(key)).toBe(true);
    await expect(database.storage.delete('1/' + 'a'.repeat(32) + '.png')).rejects.toThrow('another test');
    await database.pool().connect(); // The harness must close a leaked lease.
    throw new Error('deliberate fixture failure');
  })).rejects.toThrow('deliberate fixture failure');
  const store = new SupabaseProofStore(process.env.SUPABASE_INTERNAL_URL!, process.env.STORAGE_SERVICE_KEY!, process.env.PROOF_BUCKET);
  expect(await store.exists(key)).toBe(false);
  await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('HAR-01 concurrent cases have distinct databases, sessions and Storage namespaces', async () => {
  let arrivals = 0;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const names = await Promise.all([0, 1].map(() => harness.run(async database => {
    await database.session('seller.a');
    if (++arrivals === 2) release();
    await barrier;
    expect(await counts(database)).toEqual({ sessions: 1, buckets: 0 });
    return database.name;
  })));
  expect(new Set(names).size).toBe(2);
});
