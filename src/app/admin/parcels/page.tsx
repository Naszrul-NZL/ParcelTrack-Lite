import { AdminParcelWorkspace, type AdminParcelFilters } from '@/features/delivery/admin-parcel-list-page';
import { STATUSES } from '@/shared/constants';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Parcel assignments | ParcelTrack Lite' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const statusValue = typeof query.status === 'string' ? query.status : undefined;
  const status = STATUSES.find(candidate => candidate === statusValue);
  const initialFilters: Partial<AdminParcelFilters> = {
    status,
    needsReassignment: query.needsReassignment === 'true' || undefined,
  };
  return <AdminParcelWorkspace initialFilters={initialFilters} />;
}
