import { createPrincipalUow } from '@/server/core/authorized';
import { createUserAdminHandlers } from '@/server/modules/auth/user-handlers';
import { origin } from '../../harness/login-as';
import type { MatrixRow } from './matrix';

/** M1 Admin rows (PH3): A07 now; A08, A09, A20 and A21 register theirs with their endpoints. */
export const adminRows: MatrixRow[] = [
  {
    endpoint: 'A07', label: 'GET /admin/users',
    expected: { anonymous: 401, 'seller.a': 403, 'seller.b': 403, 'rider.a': 403, 'rider.b': 403, admin: 200, inactive: 401, 'must.change': 403 },
    call: (actor, _handlers, database) => createUserAdminHandlers(createPrincipalUow(database.pool(), {
      APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev',
    })).list(actor.request('/admin/users')),
  },
];
