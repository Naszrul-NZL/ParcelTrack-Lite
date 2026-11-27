import { createPrincipalUow } from '@/server/core/authorized';
import { createUserAdminHandlers } from '@/server/modules/auth/user-handlers';
import { origin } from '../../harness/login-as';
import type { IsolatedDatabase } from '../../harness/isolated-database';
import type { MatrixRow } from './matrix';

const admin = (database: IsolatedDatabase) => createUserAdminHandlers(createPrincipalUow(database.pool(), {
  APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev',
}));

/** M1 Admin rows (PH3): A07 and A09 now; A08 and A21 register theirs with their endpoints. */
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
];
