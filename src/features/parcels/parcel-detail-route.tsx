'use client';

import { ParcelDetailPage, type ParcelDetailSlots } from './parcel-detail-page';
import { ProofViewerPlaceholder, RiderActionPanelPlaceholder } from './slot-placeholders';

/** The components plugged into the H34 slots. M3's H35 components replace the placeholders here. */
const SLOTS: ParcelDetailSlots = { RiderActionPanel: RiderActionPanelPlaceholder, ProofViewer: ProofViewerPlaceholder };

export function ParcelDetailRoute({ parcelId }: { parcelId: string }) {
  return <ParcelDetailPage parcelId={parcelId} slots={SLOTS} />;
}
