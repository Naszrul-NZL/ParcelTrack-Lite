import { GET as health } from '@/app/api/v1/health/route';
import type { MatrixRow, Identity } from './matrix';

const everyone = (status: number, overrides: Partial<Record<Identity, number>> = {}): Record<Identity, number> => ({
  anonymous: status, 'seller.a': status, 'seller.b': status, 'rider.a': status, 'rider.b': status, admin: status, inactive: status, 'must.change': status, ...overrides,
});
const signedIn = (overrides: Partial<Record<Identity, number>> = {}) => everyone(200, { anonymous: 401, inactive: 401, ...overrides });

/** M1 rows: shared health plus A01, A03, A04 and A05. */
export const authRows: MatrixRow[] = [
  { endpoint: 'HEALTH', label: 'GET /health', expected: everyone(200), call: async actor => health(actor.request('/health')) },
  { endpoint: 'A01', label: 'GET /auth/csrf', expected: everyone(200), call: (actor, handlers) => handlers.csrf(actor.request('/auth/csrf')) },
  {
    // The anonymous identity signs in with a wrong password. The inactive identity's session is already dead, so the
    // CSRF check on its stale cookie fails first. Everyone else signs in again and gets a rotated session.
    endpoint: 'A03', label: 'POST /auth/login with the identity\'s own credentials',
    expected: everyone(200, { anonymous: 401, inactive: 403 }),
    call: (actor, handlers) => handlers.login(actor.request('/auth/login', { method: 'POST', body: JSON.stringify(actor.credentials) })),
  },
  {
    endpoint: 'A04', label: 'POST /auth/logout',
    expected: everyone(204, { anonymous: 401, inactive: 401 }),
    call: (actor, handlers) => handlers.logout(actor.request('/auth/logout', { method: 'POST' })),
  },
  { endpoint: 'A05', label: 'GET /auth/me', expected: signedIn(), call: (actor, handlers) => handlers.me(actor.request('/auth/me')) },
];
