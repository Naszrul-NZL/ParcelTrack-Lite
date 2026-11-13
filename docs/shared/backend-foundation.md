# Shared backend and test foundation

The shared infrastructure below is implemented locally and tested. Module owners can use it now without creating their own authorization wrappers, test-database reset scripts or route inventories. Consumer acceptance and group gate sign-off still require the normal PR evidence.

| Planned work | Available implementation | Remaining boundary |
| --- | --- | --- |
| H04 / M1-PH1-T08 and M1-PH2-T08 shared authorization | `src/server/core/authorized.ts`: `principalUow` and `createPrincipalUow`; session resolution in `src/server/modules/auth/session-context.ts`; CSRF check in `csrf.ts` | Real session creation, renewal, login/logout and CSRF bootstrap are still H20 work. Business functions still acquire/recheck actor and parcel locks |
| H05 / shared safe responses | `src/server/core/handler.ts`: `apiHandler` | Endpoint owns body caps, input validation, safe DTO conversion and its business error/response tests |
| H10 / M3-PH1-T01 isolation | `tests/harness/isolated-database.ts`: migrated template, per-case clones, checked runtime pools, private temporary directories, tracked Storage keys, deterministic clock and fixture sessions | Legacy low-level probes still use their existing scratch/rollback patterns. Real HTTP role journeys, controlled failpoints and H20 `login_as` remain to be completed |
| H08/H12 / CT-01 and CT-02 contract checks | `src/shared/api-contract.ts`, `scripts/contract-inventory.ts`, `npm run contract:check` | Route/method/owner and import-boundary coverage is implemented. Complete endpoint-specific payload/status/error conformance remains required with each real route |

## Protected module services

Wrap API entry points with `apiHandler`, then run protected database work through `principalUow`. It opens one transaction/connection, verifies the actual `app_runtime` role, resolves the opaque cookie against the session table, checks active account/version/expiry, checks allowed roles and the must-change restriction, verifies session-bound CSRF and request provenance on unsafe methods, and sets transaction-local actor context. It commits before returning a result and rolls back/releases on failure.

The wrapper derives mutation protection from the Request method, so an endpoint cannot accidentally omit CSRF by forgetting a `write` flag. Mutations also consume the existing maintenance/advisory-lock protocol. Reads can continue during maintenance. Domain write functions remain the authoritative account/parcel lock and transition boundary; the wrapper gives them no owner-role connection.

For example, the future A12 Route Handler can call its module's detail service like this after that service is implemented:

```tsx
import { apiHandler } from '@/server/core/handler';
import { principalUow } from '@/server/core/authorized';
import { idSchema, parcelDetailSchema } from '@/shared/schemas';
// Import readParcelDetail from the owning module's authorized detail service.

export const GET = apiHandler(async (request, _metadata,
  context: { params: Promise<{ parcelId: string }> }) => {
  const id = idSchema.parse((await context.params).parcelId);
  const dto = await principalUow(request, {},
    (client, principal) => readParcelDetail(client, principal, id));
  return Response.json(parcelDetailSchema.parse(dto));
});
```

Use `{roles: ['SELLER']}`, `{roles: ['RIDER']}` or `{roles: ['ADMIN']}` for role-specific endpoints. The empty options above permit the three authenticated roles; the detail service and RLS still enforce ownership/assignment. Never serialize `AuthContext`, a raw database row, a session token or an internal hash as a DTO.

M1's auth endpoints have their own anonymous/session lifecycle rules. The generic business wrapper denies must-change accounts; the allowlisted account endpoints may explicitly use `requireAuthenticated(request, {allowPasswordChange: true})`. Public tracking A13 is anonymous and token-CSRF-exempt, so it uses its own origin/limiter boundary rather than `principalUow`.

`createPrincipalUow(pool, settings)` binds the same behavior to an explicitly supplied restricted pool in tests. It accepts no injected principal, test header or request flag. Production entry points use `principalUow` with application settings. Session issuance/touch remains M1 work; this helper does not refresh or create a session.

## Isolated test cases

Start the isolated stack and apply bootstrap/migrations as in [local development](../local-development.md). Import the harness only from tests. It refuses non-test profiles, development/remote database addresses, unexpected runtime credentials and non-test Storage endpoints before connecting.

```tsx
import { beforeAll, afterAll, it, expect } from 'vitest';
import { createDatabaseHarness } from '../harness/isolated-database';
import { createPrincipalUow } from '@/server/core/authorized';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness.dispose(); });

it('reads only this Seller’s parcels', async () => {
  await harness.run(async database => {
    const session = await database.session('seller.a'); // TMP-04, early PH2 only.
    const authorize = createPrincipalUow(database.pool(), {
      APP_ORIGIN: process.env.APP_ORIGIN!, SESSION_COOKIE_NAME: 'ptl_session_dev',
    });
    const request = new Request(process.env.APP_ORIGIN! + '/api/v1/seller/parcels',
      {headers: {cookie: session.cookie}});
    const owners = await authorize(request, {roles: ['SELLER']}, async client =>
      (await client.query('SELECT seller_id FROM app.parcel')).rows);
    expect(owners.length).toBeGreaterThan(0);
    expect(owners.every(row => row.seller_id === database.accounts['seller.a'])).toBe(true);
  });
});
```

The template contains the seven synthetic accounts and Registered parcels for Seller A/B. Each `run` gets a separate database cloned from the migrated, sealed template. Session/counter mutations and committed requests in one case do not affect the next. Concurrent cases have distinct database names; the existing suite-wide parallelism setting remains unchanged.

- `database.pool()` and `database.pool('tracking_runtime')` assert real runtime privileges on each checkout.
- `database.session(name)` inserts a real opaque-cookie session and CSRF value in that case's database. This is TMP-04, not login: H20 must replace slice authentication with real endpoint login before G2.
- `database.loginInput(name)` supplies the matching ephemeral fixture password for future real login tests. Never print or commit it.
- `fixtureClient()` is explicitly privileged test seeding; select its permitted function-owner role only for setup. `migrationClient()` is for schema/catalog/maintenance setup and negative controls. Neither proves runtime RLS.
- `directory` is private test staging. The harness validates its managed path before cleanup and removes it after success or failure.
- Generate keys with `storageKey(parcelId, extension)` and use `storage`. The scoped adapter rejects another case's keys and cleans tracked objects through the real Storage API. Keep unknown-outcome production reconciliation separate from fixture cleanup.
- Use `TestClock` for injectable pure-service clocks and the existing `Barrier` for intentional overlap. Production request time still comes from PostgreSQL. No production clock/failpoint switch is added.

`shared-foundation.test.ts` proves clean clones after committed writes, restricted-role negative controls, concurrent case isolation and cleanup after a deliberately failed test with a leaked connection and published object. `authorized.test.ts` proves the protected service boundary with real sessions/RLS, CSRF, revocation/expiry/disablement, commit/rollback, maintenance and a version change between statements.

## Contract and production import checks

The browser-safe endpoint registry uses the IDs, owners, paths and methods already defined in [system-contract.md](system-contract.md). `contract:check` compares the registry with that authoritative table and discovers actual Route Handler method exports using TypeScript's module symbols, including aliased exports and dynamic path segments. Unknown methods/paths fail. The OpenAPI snapshot includes only implemented routes; adding an endpoint requires updating its snapshot with `npm run contract:write` after review.

The same check follows local source imports, re-exports and literal dynamic imports. It rejects production imports of test/operator code or colocated test modules; computed module loads must be changed to verifiable literal imports. Colocated tests themselves remain allowed. Negative controls prove that an indirect test import and an undeclared endpoint fail these checks.

Run `npm run check`, `npm run test:integration`, `npm run build`, browser checks and the documentation checker before sharing a changed boundary. The local evidence does not supply consumer approval or remote CI results.
