import { RoleWorkspacePlaceholder } from '@/features/auth/role-workspace-placeholder';
export const dynamic='force-dynamic';
export const metadata={title:'Seller workspace | ParcelTrack Lite'};
// Placeholder landing page: the owning module replaces this file with its real screen.
export default function Page() { return <RoleWorkspacePlaceholder role="SELLER" />; }
