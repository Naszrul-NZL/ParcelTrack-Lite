import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Client } from 'pg';
import { createPrincipalUow } from '@/server/core/authorized';
import { createParcelReadHandlers } from '@/server/modules/parcels/read-handlers';
import { createDatabaseHarness, type AccountName, type IsolatedDatabase } from '../harness/isolated-database';
import { loginAs, origin, type LoginSession } from '../harness/login-as';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

type Row = { key: string; seller: AccountName; token: string; name: string | null; status: string; createdAt: string };
const tok = (prefix: string) => 'PTL-' + prefix.padEnd(32, '0');
// Recipient names hold the LIKE metacharacters so the search must treat them literally.
const rows: Row[] = [
  { key: 'aina', seller: 'seller.a', token: tok('AB12'), name: 'Aina Rahman', status: 'REGISTERED', createdAt: '2026-02-01T00:00:00Z' },
  { key: 'percent', seller: 'seller.a', token: tok('AB34'), name: 'Ben 100% Sure', status: 'ASSIGNED', createdAt: '2026-02-02T00:00:00Z' },
  { key: 'underscore', seller: 'seller.a', token: tok('CD56'), name: 'Chong_Wei', status: 'OUT_FOR_DELIVERY', createdAt: '2026-02-03T00:00:00Z' },
  { key: 'backslash', seller: 'seller.a', token: tok('EF78'), name: 'Dev \\ Kumar', status: 'DELIVERED', createdAt: '2026-02-04T00:00:00Z' },
  { key: 'plain', seller: 'seller.a', token: tok('EF90'), name: 'Chong Wei', status: 'FAILED', createdAt: '2026-02-05T00:00:00Z' },
  { key: 'anonymized', seller: 'seller.a', token: tok('AB56'), name: null, status: 'DELIVERED', createdAt: '2026-02-06T00:00:00Z' },
  // Seller B's parcel shares Seller A's search terms; it must never appear for A.
  { key: 'other', seller: 'seller.b', token: tok('AB99'), name: 'Aina Rahman', status: 'REGISTERED', createdAt: '2026-02-07T00:00:00Z' },
];

async function seed(client: Client, database: IsolatedDatabase) {
  const ids: Record<string, string> = {};
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE domain_writer');
  for (const row of rows) {
    const anonymized = row.name === null;
    const { rows: [parcel] } = await client.query<{ id: string }>(`
      INSERT INTO app.parcel (tracking_number, seller_id, recipient_name, recipient_phone, recipient_address, weight_kg,
        current_status, client_request_id, creation_fingerprint, created_at, anonymized_at)
      VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8, $9, $10) RETURNING id::text
    `, [row.token, database.accounts[row.seller], row.name, anonymized ? null : '+60123456789', anonymized ? null : 'Address',
      row.status, randomUUID(), anonymized ? null : 'c'.repeat(64), row.createdAt, anonymized ? row.createdAt : null]);
    await client.query("INSERT INTO app.parcel_status_history (parcel_id, changed_by_id, status, changed_at) VALUES ($1, $2, 'REGISTERED', $3)",
      [parcel.id, database.accounts[row.seller], row.createdAt]);
    ids[row.key] = parcel.id;
  }
  await client.query('COMMIT');
  return ids;
}

function lister(database: IsolatedDatabase) {
  const { list } = createParcelReadHandlers(createPrincipalUow(database.pool(), { APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev' }));
  return async (actor: LoginSession, query: string) => {
    const response = await list(actor.request('/seller/parcels?' + query));
    return { status: response.status, body: await response.json() };
  };
}

it('M2-PH3-TC03 searches literally by token prefix or name substring, filters by status, and refuses bad input', async () => {
  await harness.run(async database => {
    const client = await database.fixtureClient();
    const ids = await seed(client, database);
    const seller = await loginAs(database, 'seller.a');
    const list = lister(database);
    const keys = async (query: string) => {
      const { status, body } = await list(seller, query);
      expect(status, query).toBe(200);
      expect(body.total, query).toBe(body.items.length);
      // The harness template also gives each Seller one parcel with a random token; leave it out of the comparison.
      return body.items.map((item: { id: string }) => Object.entries(ids).find(([, id]) => id === item.id)?.[0] ?? 'template')
        .filter((key: string) => key !== 'template');
    };
    const q = (text: string) => 'q=' + encodeURIComponent(text);

    // Token prefix, case-insensitive; a token fragment that is not a prefix finds nothing.
    expect(await keys(q('ptl-ab'))).toEqual(['anonymized', 'percent', 'aina']);
    expect(await keys(q(tok('AB34')))).toEqual(['percent']);
    expect(await keys(q('AB34'))).toEqual([]);
    // Name substring, case-insensitive. Anonymized parcels have no name, but their token still matches.
    expect(await keys(q('rahman'))).toEqual(['aina']);
    expect(await keys(q('chong'))).toEqual(['plain', 'underscore']);
    // Wildcards are literal: % and _ and \ match only themselves and never broaden the result.
    expect(await keys(q('%'))).toEqual(['percent']);
    expect(await keys(q('100%'))).toEqual(['percent']);
    expect(await keys(q('_'))).toEqual(['underscore']);
    expect(await keys(q('Chong_'))).toEqual(['underscore']);
    expect(await keys(q('\\'))).toEqual(['backslash']);
    expect(await keys(q('PTL-%'))).toEqual([]);
    expect(await keys(q('PTL-_B'))).toEqual([]);
    // Injection text is only ever search text.
    expect(await keys(q("' OR 1=1--"))).toEqual([]);
    expect(await keys(q("'; DROP TABLE app.parcel;--"))).toEqual([]);
    // Surrounding spaces are trimmed; 64 characters are allowed.
    expect(await keys(q('  rahman  '))).toEqual(['aina']);
    expect(await keys(q('x'.repeat(64)))).toEqual([]);

    expect(await keys('status=DELIVERED')).toEqual(['anonymized', 'backslash']);
    expect(await keys('status=DELIVERED&' + q('ptl-ef'))).toEqual(['backslash']);

    for (const bad of [q('x'.repeat(65)), q(''), q('   '), 'status=delivered', 'status=LOST', 'sort=createdAt;DROP',
      'sort=id', 'sort=recipientName', 'q=a&q=b', 'filter=all']) {
      const { status, body } = await list(seller, bad);
      expect(status, bad).toBe(422);
      expect(body.error.code, bad).toBe('VALIDATION_ERROR');
    }
    await client.query('SET ROLE domain_writer');
    expect(Number((await client.query('SELECT count(*) FROM app.parcel')).rows[0].count)).toBeGreaterThanOrEqual(rows.length);
  });
});

it('M2-PH3-TC04 sorts by an allowlisted key with a stable id tie-break and pages consistently', async () => {
  await harness.run(async database => {
    const client = await database.fixtureClient();
    const ids = await seed(client, database);
    const seller = await loginAs(database, 'seller.a');
    const list = lister(database);
    const order = async (query: string) => (await list(seller, query)).body.items.map((item: { id: string }) => item.id);
    const seeded = new Set(Object.values(ids));
    const seededOrder = async (query: string) => (await order(query)).filter((id: string) => seeded.has(id));

    const newest = await seededOrder('q=ptl-');
    expect(newest).toEqual(['anonymized', 'plain', 'backslash', 'underscore', 'percent', 'aina'].map(key => ids[key]));
    expect(await seededOrder('q=ptl-&sort=createdAt')).toEqual(newest);
    // Delivery stage first, then newest first inside a stage.
    expect(await seededOrder('q=ptl-&sort=currentStatus')).toEqual(
      ['aina', 'percent', 'underscore', 'anonymized', 'backslash', 'plain'].map(key => ids[key]));

    // Equal timestamps fall back to id descending, and pages never repeat or skip a row.
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE domain_writer');
    await client.query("UPDATE app.parcel SET created_at = '2026-03-01T00:00:00Z' WHERE seller_id = $1", [database.accounts['seller.a']]);
    await client.query('COMMIT');
    const all = await order('pageSize=100');
    expect(all).toEqual([...all].sort((a, b) => Number(b) - Number(a)));
    const paged = [...await order('pageSize=3&page=1'), ...await order('pageSize=3&page=2'), ...await order('pageSize=3&page=3')];
    expect(paged).toEqual(all);
    const beyond = await list(seller, 'page=50');
    expect(beyond).toMatchObject({ status: 200, body: { items: [], page: 50, total: all.length } });
    for (const bad of ['page=0', 'pageSize=0', 'page=-1']) expect((await list(seller, bad)).status, bad).toBe(422);
    expect((await list(seller, 'pageSize=101')).body.pageSize).toBe(100);
    expect((await list(seller, 'pageSize=20')).body.pageSize).toBe(20);
  });
});

it('M2-PH3-TC15 keeps another Seller’s parcels out of search results and totals', async () => {
  await harness.run(async database => {
    const client = await database.fixtureClient();
    const ids = await seed(client, database);
    const sellerB = await loginAs(database, 'seller.b');
    const list = lister(database);
    // Seller A's exact token, A's name and a broad prefix all stay inside Seller B's own rows.
    for (const query of ['q=' + tok('AB12'), 'q=Chong', 'q=%25', 'status=DELIVERED']) {
      const { status, body } = await list(sellerB, query);
      expect(status, query).toBe(200);
      expect(body, query).toMatchObject({ items: [], total: 0 });
    }
    const own = await list(sellerB, 'q=aina');
    expect(own.body.items.map((item: { id: string }) => item.id)).toEqual([ids.other]);
    expect(own.body.total).toBe(1);
  });
});
