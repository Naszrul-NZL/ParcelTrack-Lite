import { createPrincipalUow } from '@/server/core/authorized';
import { createUserAdminHandlers } from '@/server/modules/auth/user-handlers';
import { origin } from '../../harness/login-as';
import type { IsolatedDatabase } from '../../harness/isolated-database';
import type { MatrixRow } from './matrix';

const admin = (database: IsolatedDatabase) => createUserAdminHandlers(createPrincipalUow(database.pool(), {
  APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev',
}));

/** M1 Admin rows (PH3): A07 to A09, A20 and A21. */
export const adminRows: MatrixRow[] = [
  {
    endpoint: 'A07', label: 'GET /admin/users',
    expected: { anonymous: 401, 'seller.a': 403, 'seller.b': 403, 'rider.a': 403, 'rider.b': 403, admin: 200, inactive: 401, 'must.change': 403 },
    call: (actor, _handlers, database) => admin(database).list(actor.request('/admin/users')),
  },
  {
    // The target is Seller B, whose own identity in the matrix is denied before this function runs, so the Admin's
    // single allowed call is the only one that reaches the database.
    endpoint: 'A09', label: 'PATCH /admin/users/{userId}/status for Seller B',
    expected: { anonymous: 401, 'seller.a': 403, 'seller.b': 403, 'rider.a': 403, 'rider.b': 403, admin: 200, inactive: 401, 'must.change': 403 },
    call: async (actor, _handlers, database) => {
      const userId = database.accounts['seller.b'];
      return admin(database).updateStatus(
        actor.request(`/admin/users/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: false, expectedVersion: 1 }) }),
        { params: Promise.resolve({ userId }) },
      );
    },
  },
  {
    endpoint: 'A08', label: 'POST /admin/riders',
    expected: { anonymous: 401, 'seller.a': 403, 'seller.b': 403, 'rider.a': 403, 'rider.b': 403, admin: 201, inactive: 401, 'must.change': 403 },
    call: (actor, _handlers, database) => admin(database).createRider(
      actor.request('/admin/riders', { method: 'POST', body: JSON.stringify({ username: 'matrix.rider', displayName: 'Matrix Rider', initialPassword: 'a-sufficiently-long-secret' }) })),
  },
  {
    // Seller B is the target for the same reason as A09: its own identity is denied before the function runs.
    endpoint: 'A21', label: 'POST /admin/users/{userId}/password-reset for Seller B',
    expected: { anonymous: 401, 'seller.a': 403, 'seller.b': 403, 'rider.a': 403, 'rider.b': 403, admin: 200, inactive: 401, 'must.change': 403 },
    call: async (actor, _handlers, database) => {
      const userId = database.accounts['seller.b'];
      return admin(database).resetPassword(actor.request(`/admin/users/${userId}/password-reset`, { method: 'POST' }), { params: Promise.resolve({ userId }) });
    },
  },
  {
    endpoint: 'A20', label: 'GET /admin/audit',
    expected: { anonymous: 401, 'seller.a': 403, 'seller.b': 403, 'rider.a': 403, 'rider.b': 403, admin: 200, inactive: 401, 'must.change': 403 },
    call: (actor, _handlers, database) => admin(database).audit(actor.request('/admin/audit')),
  },
];
