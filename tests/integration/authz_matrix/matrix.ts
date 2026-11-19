import type { EndpointId } from '@/shared/api-contract';
import type { IsolatedDatabase } from '../../harness/isolated-database';
import type { AuthHandlers } from '../../harness/login-as';

/** H24 authorization-matrix harness v1. Each owner registers rows for the endpoints they implement. */
export const IDENTITIES = ['anonymous', 'seller.a', 'seller.b', 'rider.a', 'rider.b', 'admin', 'inactive', 'must.change'] as const;
export type Identity = typeof IDENTITIES[number];

export type Actor = {
  identity: Identity;
  /** Cookie jar value; absent for the anonymous identity. */
  cookie?: string;
  csrfToken?: string;
  /** Credentials this identity would sign in with; the anonymous identity has none that work. */
  credentials: { username: string; password: string };
  request(path: string, init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> }): Request;
};

export type MatrixRow = {
  endpoint: EndpointId;
  label: string;
  /** Exercises the endpoint as `actor` and returns its response. */
  call(actor: Actor, handlers: AuthHandlers, database: IsolatedDatabase): Promise<Response>;
  /** Expected HTTP status for every identity; a missing identity fails the harness. */
  expected: Record<Identity, number>;
};

/**
 * PH2 rows owed by other modules: M2 registers A10 to A12 and M3 registers A16 and A17 in their own
 * `*.rows.ts` files when those endpoints are implemented. The coverage rule below enforces it.
 */
export const PENDING_OWNER_ROWS = { A10: 'M2', A11: 'M2', A12: 'M2', A16: 'M3', A17: 'M3' } as const;

export function assertRowsCoverEndpoints(implemented: { id: string }[], rows: { endpoint: string }[]) {
  const covered = new Set(rows.map(row => row.endpoint));
  const missing = [...new Set(implemented.map(endpoint => endpoint.id))].filter(id => !covered.has(id));
  if (missing.length) throw new Error('Authorization matrix has no row for implemented endpoint(s): ' + missing.join(', '));
}

export function assertRowsComplete(rows: MatrixRow[]) {
  for (const row of rows) {
    const missing = IDENTITIES.filter(identity => typeof row.expected[identity] !== 'number');
    if (missing.length) throw new Error(`Matrix row ${row.endpoint} (${row.label}) lacks an expectation for: ${missing.join(', ')}`);
  }
}
