import { randomUUID } from 'node:crypto';
import { createPrincipalUow } from '@/server/core/authorized';
import { createRegistrationHandler } from '@/server/modules/parcels/register-handler';
import type { IsolatedDatabase } from '../../harness/isolated-database';
import { origin } from '../../harness/login-as';
import type { MatrixRow } from './matrix';

const authorize = (database: IsolatedDatabase) => createPrincipalUow(database.pool(), {
  APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev',
});

export const parcelRows: MatrixRow[] = [
  {
    endpoint: 'A10', label: 'POST /parcels',
    expected: { anonymous: 401, 'seller.a': 201, 'seller.b': 201, 'rider.a': 403, 'rider.b': 403, admin: 403, inactive: 401, 'must.change': 403 },
    call: (actor, _handlers, database) => createRegistrationHandler(authorize(database))(actor.request('/parcels', {
      method: 'POST', body: JSON.stringify({
        recipientName: 'Synthetic', recipientPhone: '0123456789', recipientAddress: 'Synthetic address',
        weightKg: '1.25', clientRequestId: randomUUID(),
      }),
    })),
  },
];
