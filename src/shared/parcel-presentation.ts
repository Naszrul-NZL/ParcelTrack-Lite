import type { ParcelStatus } from './constants';

export const PARCEL_PRESENTATION = {
  REGISTERED: { label: 'Registered', description: 'The parcel is registered and waiting for a rider assignment.' },
  ASSIGNED: { label: 'Assigned', description: 'A rider has been assigned to this parcel.' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', description: 'The assigned rider has started this delivery.' },
  DELIVERED: { label: 'Delivered', description: 'The rider recorded a completed delivery.' },
  FAILED: { label: 'Failed', description: 'The rider recorded an unsuccessful delivery.' },
} satisfies Record<ParcelStatus, { label: string; description: string }>;

export type ParcelJourneyEvent = { status: ParcelStatus; changedAt: string };

export function formatParcelTime(value: string) {
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(value));
}
