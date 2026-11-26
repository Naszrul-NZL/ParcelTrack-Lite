import { ParcelDetailPage } from '@/features/parcels/parcel-detail-page';

export const metadata = { title: 'Parcel details | ParcelTrack Lite' };

export default async function Page({ params }: { params: Promise<{ parcelId: string }> }) {
  return <ParcelDetailPage parcelId={(await params).parcelId} />;
}
