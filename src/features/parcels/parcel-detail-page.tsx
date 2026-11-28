'use client';

import Link from 'next/link';
import type { ComponentType } from 'react';
import { ParcelDocket } from '@/components/parcel-docket';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ROLE_LABEL, ROLE_LANDING } from '@/features/auth/landing';
import { RouteGuard } from '@/features/auth/route-guard';
import { useSession } from '@/features/auth/session-provider';
import { ApiFailure } from '@/shared/api-client';
import { parcelDetailSchema, type ParcelDetail as Detail, type Principal } from '@/shared/schemas';
import type { ProofViewerProps, RiderActionPanelProps } from '@/shared/types/parcel-slots';
import { useParcelData } from './use-parcel-data';

/**
 * The H34 slots. M3 supplies the real components (H35); until then the route passes the placeholders below.
 * The page decides when a slot appears; the components never repeat that permission logic.
 */
export type ParcelDetailSlots = {
  RiderActionPanel?: ComponentType<RiderActionPanelProps>;
  ProofViewer?: ComponentType<ProofViewerProps>;
};

const RIDER_ACTION_STATUSES = new Set(['ASSIGNED', 'OUT_FOR_DELIVERY']);

/** Rider actions: only for the Rider currently assigned, while the status still allows a Rider action. */
export function showsRiderActions(parcel: Detail, principal: Principal | null) {
  return principal?.role === 'RIDER' && parcel.assignedRider?.id === principal.id && RIDER_ACTION_STATUSES.has(parcel.currentStatus);
}
/** Proof: only when a proof exists and the parcel has not been anonymized (A19 denies anonymized parcels). */
export function showsProof(parcel: Detail) {
  return parcel.hasProof && !parcel.anonymized;
}

const waitText = (seconds?: number) => seconds && seconds < 60 ? `Try again in ${seconds} second${seconds === 1 ? '' : 's'}.` : 'Wait a minute, then try again.';

function ParcelDetail({ parcelId, slots }: { parcelId: string; slots: ParcelDetailSlots }) {
  const { principal } = useSession();
  const { result, retry } = useParcelData('/parcels/' + encodeURIComponent(parcelId), parcelDetailSchema);
  const parcel = result?.data;
  const failure = result?.error instanceof ApiFailure ? result.error : null;
  const missing = !!failure && [404, 422].includes(failure.status);
  const role = principal!.role;
  const { RiderActionPanel, ProofViewer } = slots;

  return <section aria-labelledby="parcel-detail-title">
    <Link href={ROLE_LANDING[role]} className="text-link">{role === 'SELLER' ? 'Your parcels' : ROLE_LABEL[role] + ' workspace'}</Link>
    <div className="parcel-workspace-header">
      <h1 id="parcel-detail-title">{missing ? 'Parcel not found' : 'Parcel details'}</h1>
    </div>
    {!result && <p className="guard-status" role="status">Loading parcel…</p>}
    {missing && <p className="guard-status">This parcel may be unavailable to your account.</p>}
    {failure?.status === 429 && <Alert variant="destructive">
      <AlertTitle>Too many requests.</AlertTitle>
      <p>{waitText(failure.retryAfter)}</p>
      <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={retry}>Try again</Button>
    </Alert>}
    {result && !parcel && !missing && failure?.status !== 429 && <Alert variant="destructive">
      <AlertTitle>Couldn’t load this parcel.</AlertTitle>
      <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={retry}>Try again</Button>
    </Alert>}
    {parcel && <div className="parcel-detail-layout">
      <ParcelDocket trackingNumber={parcel.trackingNumber} status={parcel.currentStatus} history={parcel.history} />
      <div className="grid content-start gap-6">
        <section aria-labelledby="parcel-delivery-title" className="parcel-detail-record">
          <h2 id="parcel-delivery-title">Delivery details</h2>
          {parcel.anonymized && <p className="section-label" role="note">Recipient details were removed under the 12-month retention rule. The status history is kept.</p>}
          <dl>
            <div><dt>Recipient</dt><dd>{parcel.recipient.name ?? 'Removed'}</dd></div>
            <div><dt>Phone</dt><dd>{parcel.recipient.phone ?? 'Removed'}</dd></div>
            <div><dt>Address</dt><dd className="parcel-recipient-address">{parcel.recipient.address ?? 'Removed'}</dd></div>
            <div><dt>Weight</dt><dd>{parcel.weightKg} kg</dd></div>
            <div><dt>Assigned rider</dt><dd>{parcel.assignedRider?.displayName ?? 'Unassigned'}{parcel.assignedRider && !parcel.assignedRider.isActive ? ' (inactive)' : ''}</dd></div>
          </dl>
        </section>
        {RiderActionPanel && showsRiderActions(parcel, principal) && <RiderActionPanel parcel={parcel} onChanged={retry} />}
        {ProofViewer && showsProof(parcel) && <ProofViewer parcel={parcel} onChanged={retry} />}
      </div>
    </div>}
  </section>;
}

export function ParcelDetailPage({ parcelId, slots = {} }: { parcelId: string; slots?: ParcelDetailSlots }) {
  return <div className="page-width parcel-workspace">
    <RouteGuard><ParcelDetail key={parcelId} parcelId={parcelId} slots={slots} /></RouteGuard>
  </div>;
}
