import type { Role } from '@/shared/constants';

// M2 and M3 own these pages. Until they ship them, each path serves a labeled placeholder (see RoleWorkspacePlaceholder).
export const ROLE_LANDING: Record<Role, string> = { SELLER: '/seller/parcels', RIDER: '/rider/parcels', ADMIN: '/admin/dashboard' };
export const ROLE_LABEL: Record<Role, string> = { SELLER: 'Seller', RIDER: 'Rider', ADMIN: 'Admin' };
