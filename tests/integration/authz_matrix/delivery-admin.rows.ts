import { createPrincipalUow } from '@/server/core/authorized';
import { createDeliveryAdminHandlers } from '@/server/modules/delivery/admin-handlers';
import { createDashboardHandler } from '@/server/modules/delivery/dashboard-handler';
import { createProofHandler } from '@/server/modules/delivery/proof-handler';
import type { ProofStore } from '@/server/modules/delivery/storage';
import { seedRiderParcels } from '../../fixtures/delivery/rider-parcels';
import type { IsolatedDatabase } from '../../harness/isolated-database';
import { origin } from '../../harness/login-as';
import type { MatrixRow } from './matrix';

const deliveryAdmin = (database: IsolatedDatabase) => createDeliveryAdminHandlers(createPrincipalUow(database.pool(), {
  APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev',
}));

const proofBytes = Buffer.from('89504e470d0a1a0a', 'hex');
const proofStore: ProofStore = {
  publish: async () => {}, open: async () => proofBytes, delete: async () => {}, exists: async () => true,
  async *listOld() { /* The authorization row never lists objects. */ },
};

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
  {
    endpoint: 'A18', label: 'GET /admin/dashboard',
    expected: { anonymous: 401, 'seller.a': 403, 'seller.b': 403, 'rider.a': 403, 'rider.b': 403, admin: 200, inactive: 401, 'must.change': 403 },
    call: (actor, _handlers, database) => createDashboardHandler(createPrincipalUow(database.pool(), {
      APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev',
    }))(actor.request('/admin/dashboard')),
  },
  {
    endpoint: 'A19', label: 'GET /parcels/{parcelId}/proof',
    expected: { anonymous: 401, 'seller.a': 200, 'seller.b': 404, 'rider.a': 200, 'rider.b': 404, admin: 200, inactive: 401, 'must.change': 403 },
    call: async (actor, _handlers, database) => {
      const [{ parcelId }] = await seedRiderParcels(database);
      const key = `${parcelId}/${'a'.repeat(32)}.png`;
      const fixture = await database.fixtureClient();
      await fixture.query('BEGIN');
      await fixture.query('SET LOCAL ROLE domain_writer');
      await fixture.query(`
        INSERT INTO app.delivery_proof(parcel_id, uploaded_by_id, storage_key, media_type, size_bytes)
        VALUES ($1, $2, $3, 'image/png', $4) ON CONFLICT (parcel_id) DO NOTHING
      `, [parcelId, database.accounts['rider.a'], key, proofBytes.length]);
      await fixture.query('COMMIT');
      return createProofHandler(createPrincipalUow(database.pool(), {
        APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev',
      }), proofStore)(actor.request(`/parcels/${parcelId}/proof`), { params: Promise.resolve({ parcelId }) });
    },
  },
];
