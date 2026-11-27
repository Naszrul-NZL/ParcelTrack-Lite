import { createPrincipalUow } from '@/server/core/authorized';
import { createRiderHandlers } from '@/server/modules/delivery/rider-handlers';
import { seedRiderParcels } from '../../fixtures/delivery/rider-parcels';
import type { IsolatedDatabase } from '../../harness/isolated-database';
import { origin } from '../../harness/login-as';
import type { MatrixRow } from './matrix';

const authorize = (database: IsolatedDatabase) => createPrincipalUow(database.pool(), {
  APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev',
});

export const riderRows: MatrixRow[] = [
  {
    endpoint: 'A16', label: 'GET /rider/parcels',
    expected: { anonymous: 401, 'seller.a': 403, 'seller.b': 403, 'rider.a': 200, 'rider.b': 200, admin: 403, inactive: 401, 'must.change': 403 },
    call: (actor, _handlers, database) => createRiderHandlers(authorize(database)).list(actor.request('/rider/parcels')),
  },
  {
    endpoint: 'A17', label: 'POST Start delivery for Rider A parcel',
    expected: { anonymous: 401, 'seller.a': 403, 'seller.b': 403, 'rider.a': 200, 'rider.b': 404, admin: 403, inactive: 401, 'must.change': 403 },
    call: async (actor, _handlers, database) => {
      const [{ parcelId }] = await seedRiderParcels(database);
      const body = new FormData();
      body.set('status', 'OUT_FOR_DELIVERY');
      body.set('expectedVersion', '2');
      return createRiderHandlers(authorize(database)).updateStatus(actor.request('/rider/parcels/' + parcelId + '/status', {
        method: 'POST', body,
      }), { params: Promise.resolve({ parcelId }) });
    },
  },
];
