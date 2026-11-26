'use client';

import Link from 'next/link';
import { ParcelDocket } from '@/components/parcel-docket';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ROLE_LABEL, ROLE_LANDING } from '@/features/auth/landing';
import { RouteGuard } from '@/features/auth/route-guard';
import { useSession } from '@/features/auth/session-provider';
import { ApiFailure } from '@/shared/api-client';
import { parcelDetailSchema } from '@/shared/schemas';
import { useParcelData } from './use-parcel-data';

function ParcelDetail({ parcelId }: { parcelId: string }) {
  const { principal } = useSession();
  const { result, retry } = useParcelData('/parcels/' + encodeURIComponent(parcelId), parcelDetailSchema);
  const parcel = result?.data;
  const missing = result?.error instanceof ApiFailure && [404, 422].includes(result.error.status);
  const role = principal!.role;

  return <section aria-labelledby="parcel-detail-title">
    <Link href={ROLE_LANDING[role]} className="text-link">{role === 'SELLER' ? 'Your parcels' : ROLE_LABEL[role] + ' workspace'}</Link>
    <div className="parcel-workspace-header">
      <h1 id="parcel-detail-title">{missing ? 'Parcel not found' : 'Parcel details'}</h1>
    </div>
    {!result && <p className="guard-status" role="status">Loading parcel…</p>}
    {missing && <p className="guard-status">This parcel may be unavailable to your account.</p>}
    {result && !parcel && !missing && <Alert variant="destructive">
      <AlertTitle>Couldn’t load this parcel.</AlertTitle>
      <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={retry}>Try again</Button>
    </Alert>}
    {parcel && <div className="parcel-detail-layout">
      <ParcelDocket trackingNumber={parcel.trackingNumber} status={parcel.currentStatus} history={parcel.history} />
      <section aria-labelledby="parcel-delivery-title" className="parcel-detail-record">
        <h2 id="parcel-delivery-title">Delivery details</h2>
        <dl>
          <div><dt>Recipient</dt><dd>{parcel.recipient.name ?? 'Unavailable'}</dd></div>
          <div><dt>Phone</dt><dd>{parcel.recipient.phone ?? 'Unavailable'}</dd></div>
          <div><dt>Address</dt><dd className="parcel-recipient-address">{parcel.recipient.address ?? 'Unavailable'}</dd></div>
          <div><dt>Weight</dt><dd>{parcel.weightKg} kg</dd></div>
          <div><dt>Assigned rider</dt><dd>{parcel.assignedRider?.displayName ?? 'Unassigned'}</dd></div>
        </dl>
      </section>
    </div>}
  </section>;
}

export function ParcelDetailPage({ parcelId }: { parcelId: string }) {
  return <div className="page-width parcel-workspace">
    <RouteGuard><ParcelDetail key={parcelId} parcelId={parcelId} /></RouteGuard>
  </div>;
}
