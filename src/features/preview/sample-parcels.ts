import type { ParcelStatus } from '@/shared/constants';
import type { ParcelJourneyEvent } from '@/shared/parcel-presentation';

export type SampleParcel = { number: string; status: ParcelStatus; history: ParcelJourneyEvent[] };

export const sampleParcels: SampleParcel[] = [
  {
    number: 'PTL-DEMO-001', status: 'OUT_FOR_DELIVERY', history: [
      { status: 'OUT_FOR_DELIVERY', changedAt: '2026-11-13T01:40:00Z' },
      { status: 'ASSIGNED', changedAt: '2026-11-13T00:15:00Z' },
      { status: 'REGISTERED', changedAt: '2026-11-12T08:30:00Z' },
    ],
  },
  {
    number: 'PTL-DEMO-002', status: 'DELIVERED', history: [
      { status: 'DELIVERED', changedAt: '2026-11-12T06:20:00Z' },
      { status: 'OUT_FOR_DELIVERY', changedAt: '2026-11-12T02:00:00Z' },
      { status: 'ASSIGNED', changedAt: '2026-11-12T00:30:00Z' },
      { status: 'REGISTERED', changedAt: '2026-11-11T07:10:00Z' },
    ],
  },
  { number: 'PTL-DEMO-003', status: 'REGISTERED', history: [{ status: 'REGISTERED', changedAt: '2026-11-13T02:15:00Z' }] },
  {
    number: 'PTL-DEMO-004', status: 'FAILED', history: [
      { status: 'FAILED', changedAt: '2026-11-13T03:25:00Z' },
      { status: 'OUT_FOR_DELIVERY', changedAt: '2026-11-13T01:10:00Z' },
      { status: 'ASSIGNED', changedAt: '2026-11-13T00:00:00Z' },
      { status: 'REGISTERED', changedAt: '2026-11-12T05:20:00Z' },
    ],
  },
  { number: 'PTL-DEMO-005', status: 'ASSIGNED', history: [
    { status: 'ASSIGNED', changedAt: '2026-11-13T00:45:00Z' },
    { status: 'REGISTERED', changedAt: '2026-11-12T06:00:00Z' },
  ] },
];

export function findSampleParcel(number: string) {
  return sampleParcels.find(parcel => parcel.number === number.trim().toUpperCase());
}
