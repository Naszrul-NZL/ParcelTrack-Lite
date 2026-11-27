import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseHarness, type IsolatedDatabase } from '../../harness/isolated-database';
import { apiRequest, authHandlers, bootstrapCsrf, loginAs } from '../../harness/login-as';
import { implementedEndpoints } from '../../../scripts/contract-inventory';
import { IDENTITIES, assertRowsComplete, assertRowsCoverEndpoints, type Actor, type Identity } from './matrix';
import { authRows } from './auth.rows';

import { adminRows } from './admin.rows';
import { parcelRows } from './parcel.rows';
import { riderRows } from './rider.rows';

const rows = [...authRows, ...parcelRows, ...adminRows, ...riderRows];

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

async function actors(database: IsolatedDatabase, handlers: ReturnType<typeof authHandlers>): Promise<Record<Identity, Actor>> {
  // Sequential on purpose: parallel Argon2 logins exceed the hashing semaphore and correctly answer 503 BUSY.
  const entries: [Identity, Actor][] = [];
  for (const identity of IDENTITIES) entries.push(await (async (): Promise<[Identity, Actor]> => {
    if (identity === 'anonymous') {
      const anonymous = await bootstrapCsrf(handlers);
      const credentials = { username: 'nobody.here', password: 'not-a-real-password' };
      return [identity, { identity, cookie: anonymous.cookie, csrfToken: anonymous.csrfToken, credentials, request: (path, init) => apiRequest(path, { ...init, cookie: anonymous.cookie, csrfToken: anonymous.csrfToken }) }];
    }
    const credentials = database.loginInput(identity);
    if (identity === 'inactive') {
      // An inactive account cannot sign in, so its identity is a session that existed before it was disabled (TMP-04).
      const session = await database.session('inactive');
      return [identity, { identity, cookie: session.cookie, csrfToken: session.csrfToken, credentials, request: (path, init) => apiRequest(path, { ...init, cookie: session.cookie, csrfToken: session.csrfToken }) }];
    }
    const session = await loginAs(database, identity, { handlers });
    return [identity, { identity, cookie: session.cookie, csrfToken: session.csrfToken, credentials, request: session.request }];
  })());
  return Object.fromEntries(entries) as Record<Identity, Actor>;
}

describe('M1-PH2-TC18 authorization matrix', () => {
  it('has a complete row for every implemented endpoint', () => {
    assertRowsComplete(rows);
    assertRowsCoverEndpoints(implementedEndpoints(), rows);
  });

  for (const row of rows) {
    it(`${row.endpoint} ${row.label}`, async () => {
      await harness.run(async database => {
        const handlers = authHandlers(database);
        const everyone = await actors(database, handlers);
        for (const identity of IDENTITIES) {
          const response = await row.call(everyone[identity], handlers, database);
          expect(response.status, `${row.endpoint} as ${identity}`).toBe(row.expected[identity]);
        }
      });
    });
  }
});
