import type { IsolatedDatabase } from '../../harness/isolated-database';

// TMP-02: synthetic assignment profile for the isolated harness and future H25 loader hook.
const seeded = [
  { key: 'riderAFirst', rider: 'rider.a', token: '1' },
  { key: 'riderASecond', rider: 'rider.a', token: '2' },
  { key: 'riderB', rider: 'rider.b', token: '3' },
  { key: 'registered', rider: null, token: '4' },
] as const;

export async function seedRiderParcels(database: IsolatedDatabase) {
  const client = await database.fixtureClient();
  const manifest: Array<{
    key: typeof seeded[number]['key'];
    parcelId: string;
    trackingNumber: string;
    source: 'seeded';
    rider: typeof seeded[number]['rider'];
  }> = [];
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE domain_writer');
    const sellerId = database.accounts['seller.a'];
    for (const entry of seeded) {
      const rider = entry.rider ? database.accounts[entry.rider] : null;
      const trackingNumber = 'PTL-' + entry.token.repeat(32);
      const requestId = '00000000-0000-4000-8000-00000000000' + entry.token;
      const parcel = await client.query<{ id: string }>(`
        INSERT INTO app.parcel (
          tracking_number, seller_id, assigned_rider_id, recipient_name, recipient_phone, recipient_address,
          weight_kg, current_status, version, client_request_id, creation_fingerprint, created_at
        ) VALUES ($1, $2, $3, 'Synthetic Recipient', '+60000000000', 'Fictional test address',
          1.250, $4, $5, $6, repeat('a', 64), '2026-01-01T00:00:00Z')
        ON CONFLICT (seller_id, client_request_id) DO NOTHING RETURNING id
      `, [trackingNumber, sellerId, rider, rider ? 'ASSIGNED' : 'REGISTERED', rider ? 2 : 1, requestId]);
      let parcelId = parcel.rows[0]?.id;
      if (parcelId) {
        await client.query(`
          INSERT INTO app.parcel_status_history (parcel_id, changed_by_id, status, changed_at)
          VALUES ($1, $2, 'REGISTERED', '2026-01-01T00:00:00Z')
        `, [parcelId, sellerId]);
        if (rider) {
          await client.query(`
            INSERT INTO app.parcel_status_history (parcel_id, changed_by_id, status, changed_at)
            VALUES ($1, $2, 'ASSIGNED', '2026-01-01T00:01:00Z')
          `, [parcelId, database.accounts.admin]);
        }
      } else {
        const existing = await client.query<{ id: string }>(`
          SELECT id FROM app.parcel WHERE seller_id = $1 AND client_request_id = $2 AND tracking_number = $3
        `, [sellerId, requestId, trackingNumber]);
        if (!existing.rows[0]) throw new Error('Unexpected conflict in the TMP-02 fixture profile.');
        parcelId = existing.rows[0].id;
      }
      manifest.push({ key: entry.key, parcelId, trackingNumber, source: 'seeded', rider: entry.rider });
    }
    await client.query('COMMIT');
    return manifest;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
