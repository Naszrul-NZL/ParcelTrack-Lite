import type { ParcelDetail } from '@/shared/schemas';

/**
 * H34: the props contract for the two components M3 plugs into the shared parcel detail page (M2-PH3-T03).
 *
 * M2 owns the page and the A12 `ParcelDetail` it renders; M3 owns the implementations
 * (`RiderActionPanel` and `ProofViewer`, M3-PH3-T10, handoff H35). Neither side imports the other's code:
 * this file depends only on the shared schema, and the page receives the components through these types.
 *
 * Both components get the same A12 detail the page already fetched, never a second copy of the permission
 * logic. After a successful action the component calls `onChanged()` and the page refetches A12, so the server
 * stays the single source of state (contract: refetch after an uncertain or completed mutation).
 *
 * When the page shows each slot (wired in M2-PH3-T07):
 * - `RiderActionPanel`: only for the assigned Rider while the status still allows a Rider action
 *   (ASSIGNED or OUT_FOR_DELIVERY).
 * - `ProofViewer`: only when `parcel.hasProof` is true.
 */
export type ParcelSlotProps = {
  /** The A12 detail exactly as served to the signed-in viewer. */
  parcel: ParcelDetail;
  /** Ask the page to refetch A12 after the component changed the parcel. */
  onChanged(): void;
};

export type RiderActionPanelProps = ParcelSlotProps;
export type ProofViewerProps = ParcelSlotProps;
