export type SampleParcel = {
  number: string;
  status: 'Registered' | 'Out for delivery' | 'Delivered';
  updated: string;
  description: string;
  events: { status: string; time: string; description: string }[];
};

export const sampleParcels: SampleParcel[] = [
  {
    number: 'PTL-DEMO-001', status: 'Out for delivery', updated: '22 Oct 2026, 9:40 am',
    description: 'The assigned rider has started this delivery.',
    events: [
      { status: 'Out for delivery', time: '22 Oct 2026, 9:40 am', description: 'The rider started delivery.' },
      { status: 'Assigned', time: '22 Oct 2026, 8:15 am', description: 'A rider was assigned to the parcel.' },
      { status: 'Registered', time: '21 Oct 2026, 4:30 pm', description: 'The seller registered the parcel.' },
    ],
  },
  {
    number: 'PTL-DEMO-002', status: 'Delivered', updated: '21 Oct 2026, 2:20 pm',
    description: 'This sample parcel has completed its delivery.',
    events: [
      { status: 'Delivered', time: '21 Oct 2026, 2:20 pm', description: 'The rider recorded a completed delivery.' },
      { status: 'Out for delivery', time: '21 Oct 2026, 10:00 am', description: 'The rider started delivery.' },
      { status: 'Assigned', time: '21 Oct 2026, 8:30 am', description: 'A rider was assigned to the parcel.' },
      { status: 'Registered', time: '20 Oct 2026, 3:10 pm', description: 'The seller registered the parcel.' },
    ],
  },
  {
    number: 'PTL-DEMO-003', status: 'Registered', updated: '22 Oct 2026, 10:15 am',
    description: 'The parcel has been registered and is waiting for a rider assignment.',
    events: [{ status: 'Registered', time: '22 Oct 2026, 10:15 am', description: 'The seller registered the parcel.' }],
  },
];

export function findSampleParcel(number: string) {
  return sampleParcels.find(parcel => parcel.number === number.trim().toUpperCase());
}

export function statusVariant(status: SampleParcel['status']) {
  return status === 'Delivered' ? 'delivered' : status === 'Registered' ? 'registered' : 'active';
}
