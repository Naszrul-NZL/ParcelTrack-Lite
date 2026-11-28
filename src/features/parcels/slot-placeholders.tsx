'use client';

import Link from 'next/link';
import type { ProofViewerProps, RiderActionPanelProps } from '@/shared/types/parcel-slots';

/*
 * Substitutes for M3's H35 components (M2-PH3 dependency table: "Placeholder components in the slots").
 * They take the agreed H34 props but act on nothing: each one names where the real work happens today.
 * Replace them in `parcel-detail-route.tsx` when M3-PH3-T10 delivers `RiderActionPanel` and `ProofViewer`.
 */

export function RiderActionPanelPlaceholder({ parcel }: RiderActionPanelProps) {
  return <section aria-labelledby="rider-actions-title" className="parcel-detail-record" data-slot="rider-action-panel">
    <h2 id="rider-actions-title">Delivery actions</h2>
    <p className="section-label">Record progress for {parcel.trackingNumber} from your assigned parcel list.</p>
    <Link href="/rider/parcels" className="text-link">Assigned parcels</Link>
  </section>;
}

export function ProofViewerPlaceholder({ parcel }: ProofViewerProps) {
  return <section aria-labelledby="proof-title" className="parcel-detail-record" data-slot="proof-viewer">
    <h2 id="proof-title">Delivery proof</h2>
    <p className="section-label">A delivery photo is on record for {parcel.trackingNumber}. It will be viewable here when the proof viewer is connected.</p>
  </section>;
}
