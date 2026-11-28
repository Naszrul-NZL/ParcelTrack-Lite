import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTrackingHandler, TRACKING_RULE } from '@/server/modules/parcels/tracking-handler';
import { makeTracking } from '@/server/modules/parcels/tokens';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';
import { origin } from '../harness/login-as';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

type Options = { source?: string; now?: () => Date };
const handler = (database: IsolatedDatabase, options: Options = {}) => createTrackingHandler({
  pool: database.pool(), trackingPool: database.pool('tracking_runtime'),
  settings: { APP_ORIGIN: origin(), RATE_LIMIT_KEY: process.env.RATE_LIMIT_KEY! },
  source: () => options.source ?? '127.0.0.1', clock: options.now,
});

/** A browser-shaped same-origin POST with no cookie and no CSRF token. */
const lookup = (body: unknown, headers: Record<string, string> = { origin: origin() }) => new Request(origin() + '/api/v1/public/tracking', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
});
const errorCode = async (response: Response) => (await response.json()).error.code as string;

const FLOW = ['REGISTERED', 'ASSIGNED', 'OUT_FOR_DELIVERY'] as const;
type Final = 'REGISTERED' | 'ASSIGNED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED';

/** Inserts a parcel whose history reaches `status` (TMP-06 test-only DML), optionally already anonymized. */
async function seed(database: IsolatedDatabase, token: string, status: Final, { anonymized = false } = {}) {
  const steps: Final[] = status === 'DELIVERED' || status === 'FAILED' ? [...FLOW, status] : FLOW.slice(0, FLOW.indexOf(status) + 1);
  const at = (index: number) => new Date(Date.UTC(2026, 4, 1, 1 + index)).toISOString();
  const terminal = status === 'DELIVERED' || status === 'FAILED' ? at(steps.length - 1) : null;
  const client = await database.fixtureClient();
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE domain_writer');
  const { rows: [parcel] } = await client.query<{ id: string }>(`
    INSERT INTO app.parcel (tracking_number, seller_id, assigned_rider_id, recipient_name, recipient_phone, recipient_address,
      weight_kg, current_status, version, client_request_id, creation_fingerprint, created_at, terminal_at, anonymized_at)
    VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id::text`, [token, database.accounts['seller.a'], status === 'REGISTERED' ? null : database.accounts['rider.a'],
    anonymized ? null : 'Private Recipient', anonymized ? null : '+60123456789', anonymized ? null : 'Private address 9',
    status, steps.length, randomUUID(), anonymized ? null : 'd'.repeat(64), at(0), terminal, anonymized ? at(9) : null]);
  for (const [index, step] of steps.entries()) {
    const by = step === 'REGISTERED' ? 'seller.a' : step === 'ASSIGNED' ? 'admin' : 'rider.a';
    await client.query('INSERT INTO app.parcel_status_history (parcel_id, changed_by_id, status, changed_at) VALUES ($1, $2, $3, $4)',
      [parcel.id, database.accounts[by], step, at(index)]);
  }
  await client.query('COMMIT');
  return steps.map((step, index) => ({ status: step, changedAt: at(index) }));
}

const PRIVATE = /Private Recipient|\+60123456789|Private address|seller\.a|rider\.a|admin|changedBy|recipient|assignedRider|proof|"id"/i;

describe('M2-PH3-T05 A13 POST /public/tracking', () => {
  it('M2-PH3-TC07 returns only status and time for every status and an anonymized parcel, with no token or session', async () => {
    await harness.run(async database => {
      const cases: [Final, boolean][] = [['REGISTERED', false], ['ASSIGNED', false], ['OUT_FOR_DELIVERY', false], ['DELIVERED', false], ['FAILED', false], ['DELIVERED', true]];
      const track = handler(database);
      for (const [index, [status, anonymized]] of cases.entries()) {
        const token = 'PTL-' + String(index + 1).repeat(32);
        const history = await seed(database, token, status, { anonymized });
        const response = await track(lookup({ trackingNumber: token }));
        const label = status + (anonymized ? ' anonymized' : '');
        expect(response.status, label).toBe(200);
        expect(response.headers.get('cache-control'), label).toBe('no-store');
        expect(response.headers.get('set-cookie'), label).toBeNull();
        const text = await response.text();
        expect(text, label).not.toMatch(PRIVATE);
        expect(text, label).not.toContain(token);
        const body = JSON.parse(text);
        expect(Object.keys(body), label).toEqual(['history']);
        for (const item of body.history) expect(Object.keys(item).sort(), label).toEqual(['changedAt', 'status']);
        expect(body, label).toEqual({ history });
      }
    });
  });

  it('M2-PH3-TC07 trims and uppercases the token, answers unknown valid tokens 404 and malformed ones 422', async () => {
    await harness.run(async database => {
      const token = 'PTL-' + 'ABCDEF0123456789'.repeat(2);
      const history = await seed(database, token, 'OUT_FOR_DELIVERY');
      const track = handler(database);
      const lower = await track(lookup({ trackingNumber: '  ' + token.toLowerCase() + '\t' }));
      expect([lower.status, await lower.json()]).toEqual([200, { history }]);

      const unknown = await track(lookup({ trackingNumber: 'PTL-' + 'F'.repeat(32) }));
      expect([unknown.status, await errorCode(unknown)]).toEqual([404, 'NOT_FOUND']);

      const malformed: [string, unknown][] = [
        ['injection', { trackingNumber: "' OR '1'='1" }], ['31 hex characters', { trackingNumber: 'PTL-' + 'A'.repeat(31) }],
        ['33 hex characters', { trackingNumber: 'PTL-' + 'A'.repeat(33) }], ['non-hex', { trackingNumber: 'PTL-' + 'G'.repeat(32) }],
        ['missing prefix', { trackingNumber: 'A'.repeat(32) }], ['pattern', { trackingNumber: 'PTL-%' }], ['number', { trackingNumber: 1 }],
        ['extra field', { trackingNumber: token, status: 'DELIVERED' }], ['missing field', {}], ['array', [token]], ['null', 'null'],
        ['malformed JSON', '{"trackingNumber":'], ['oversize', JSON.stringify({ trackingNumber: token, pad: 'x'.repeat(20_000) })],
      ];
      for (const [label, body] of malformed) {
        const response = await track(lookup(body));
        const text = await response.text();
        expect([response.status, JSON.parse(text).error.code], label).toEqual([422, 'VALIDATION_ERROR']);
        expect(text, label).not.toContain("OR '1'");
        expect(text, label).not.toContain(token);
      }
    });
  });

  it('M2-PH3-TC07 rejects a foreign Origin and a request with no same-origin evidence, but accepts Sec-Fetch-Site', async () => {
    await harness.run(async database => {
      const token = 'PTL-' + '7'.repeat(32);
      await seed(database, token, 'ASSIGNED');
      const track = handler(database);
      const body = { trackingNumber: token };
      const foreign = await track(lookup(body, { origin: 'https://evil.example' }));
      expect([foreign.status, await errorCode(foreign)]).toEqual([403, 'CSRF_INVALID']);
      const bare = await track(lookup(body, {}));
      expect([bare.status, await errorCode(bare)]).toEqual([403, 'CSRF_INVALID']);
      const crossSite = await track(lookup(body, { 'sec-fetch-site': 'cross-site' }));
      expect(crossSite.status).toBe(403);
      expect((await track(lookup(body, { 'sec-fetch-site': 'same-origin' }))).status).toBe(200);
      expect((await track(lookup(body, { referer: origin() + '/track' }))).status).toBe(200);
    });
  });

  it('M2-PH3-TC08 allows 30 lookups per source per minute, counts invalid tokens, and resumes in the next window', async () => {
    await harness.run(async database => {
      const token = 'PTL-' + '8'.repeat(32);
      await seed(database, token, 'REGISTERED');
      let now = new Date('2026-11-28T10:00:05Z');
      const clock = () => now;
      const first = handler(database, { source: '203.0.113.7', now: clock });
      for (let index = 0; index < TRACKING_RULE.limit; index++) {
        // Half valid, half malformed: both count against the same bucket.
        const response = await first(lookup({ trackingNumber: index % 2 ? token : 'bad' }));
        expect(response.status, String(index)).toBe(index % 2 ? 200 : 422);
      }
      const limited = await first(lookup({ trackingNumber: token }));
      expect([limited.status, await errorCode(limited)]).toEqual([429, 'RATE_LIMITED']);
      expect(Number(limited.headers.get('retry-after'))).toBe(55);
      // Malformed bodies and foreign tokens are throttled too once the limit is reached.
      expect((await first(lookup('{'))).status).toBe(429);

      // Another source, and an IPv6 neighbour outside the /64, are unaffected.
      expect((await handler(database, { source: '203.0.113.8', now: clock })(lookup({ trackingNumber: token }))).status).toBe(200);
      now = new Date('2026-11-28T10:01:00Z');
      expect((await first(lookup({ trackingNumber: token }))).status).toBe(200);
      // Bucket keys are digests, never the raw address or token.
      const client = await database.migrationClient();
      const stored = JSON.stringify((await client.query("SELECT * FROM app.rate_limit_bucket WHERE bucket_type = 'public_tracking'")).rows);
      expect(stored).not.toContain('203.0.113');
      expect(stored).not.toContain(token);
    });
  });

  it('M2-PH3-TC19 answers every neighbour of a real token with a uniform 404 that counts against the limiter', async () => {
    await harness.run(async database => {
      const real = makeTracking();
      await seed(database, real, 'DELIVERED');
      const last = parseInt(real.slice(-1), 16);
      const neighbours = [
        real.slice(0, -1) + ((last + 1) % 16).toString(16).toUpperCase(),
        real.slice(0, -1) + ((last + 15) % 16).toString(16).toUpperCase(),
        'PTL-' + '0'.repeat(32),
        ...Array.from({ length: 26 }, (_, index) => 'PTL-' + index.toString(16).toUpperCase().padStart(32, '0')),
      ];
      const track = handler(database, { source: '198.51.100.20', now: () => new Date('2026-11-28T11:00:00Z') });
      const bodies = new Set<string>();
      for (const token of neighbours) {
        const response = await track(lookup({ trackingNumber: token }));
        expect(response.status, token).toBe(404);
        const { error } = await response.json();
        bodies.add(JSON.stringify({ code: error.code, message: error.message, fieldErrors: error.fieldErrors }));
      }
      expect([...bodies]).toEqual([JSON.stringify({ code: 'NOT_FOUND', message: 'The request could not be completed.' })]);
      expect((await track(lookup({ trackingNumber: real }))).status).toBe(200);
      const limited = await track(lookup({ trackingNumber: real }));
      expect(limited.status).toBe(429);

      // Two consecutively generated tokens share no structure beyond the prefix.
      const [a, b] = [makeTracking(), makeTracking()];
      expect(a).toMatch(/^PTL-[0-9A-F]{32}$/);
      expect(a.slice(4, 12)).not.toBe(b.slice(4, 12));
      expect(a.slice(-8)).not.toBe(b.slice(-8));
    });
  });
});
