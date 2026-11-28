import { ParcelDetailRoute } from '@/features/parcels/parcel-detail-route';

export const metadata = { title: 'Parcel details | ParcelTrack Lite' };

export default async function Page({ params }: { params: Promise<{ parcelId: string }> }) {
  return <ParcelDetailRoute parcelId={(await params).parcelId} />;
}
