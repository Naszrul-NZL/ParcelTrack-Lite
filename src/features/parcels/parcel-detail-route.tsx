'use client';

import { ParcelDetailPage, type ParcelDetailSlots } from './parcel-detail-page';
import { RiderActionPanel } from '@/features/delivery/rider-action-panel';
import { ProofViewerPlaceholder } from './slot-placeholders';

/** H35 supplies the Rider outcome panel; proof viewing remains a separate follow-up. */
const SLOTS: ParcelDetailSlots = { RiderActionPanel, ProofViewer: ProofViewerPlaceholder };

export function ParcelDetailRoute({ parcelId }: { parcelId: string }) {
  return <ParcelDetailPage parcelId={parcelId} slots={SLOTS} />;
}
