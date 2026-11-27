import { createPrincipalUow } from '@/server/core/authorized';
import { createDeliveryAdminHandlers } from '@/server/modules/delivery/admin-handlers';
import { seedRiderParcels } from '../../fixtures/delivery/rider-parcels';
import type { IsolatedDatabase } from '../../harness/isolated-database';
import { origin } from '../../harness/login-as';
import type { MatrixRow } from './matrix';

const deliveryAdmin = (database: IsolatedDatabase) => createDeliveryAdminHandlers(createPrincipalUow(database.pool(), {
  APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev',
}));

export const deliveryAdminRows: MatrixRow[] = [
  {
    endpoint: 'A14', label: 'GET /admin/parcels',
    expected: { anonymous: 401, 'seller.a': 403, 'seller.b': 403, 'rider.a': 403, 'rider.b': 403, admin: 200, inactive: 401, 'must.change': 403 },
    call: (actor, _handlers, database) => deliveryAdmin(database).list(actor.request('/admin/parcels')),
  },
  {
    endpoint: 'A15', label: 'PATCH /admin/parcels/{parcelId}/assignment',
    expected: { anonymous: 401, 'seller.a': 403, 'seller.b': 403, 'rider.a': 403, 'rider.b': 403, admin: 200, inactive: 401, 'must.change': 403 },
    call: async (actor, _handlers, database) => {
      const parcels = await seedRiderParcels(database);
      const parcelId = parcels.find(parcel => parcel.key === 'registered')!.parcelId;
      return deliveryAdmin(database).assign(actor.request(`/admin/parcels/${parcelId}/assignment`, {
        method: 'PATCH',
        body: JSON.stringify({ riderId: database.accounts['rider.a'], expectedVersion: 1 }),
      }), { params: Promise.resolve({ parcelId }) });
    },
  },
];
