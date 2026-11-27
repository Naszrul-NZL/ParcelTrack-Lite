import { AdminDashboardWorkspace } from '@/features/delivery/admin-dashboard-page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin dashboard | ParcelTrack Lite' };

export default function Page() {
  return <AdminDashboardWorkspace />;
}
