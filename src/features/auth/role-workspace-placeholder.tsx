'use client';
import type { Role } from '@/shared/constants';
import { RouteGuard } from './route-guard';
import { useSession } from './session-provider';
import { ROLE_LABEL } from './landing';

const unavailable: Record<Role, string> = {
  SELLER: 'Parcel registration and your parcel list are being built in the Seller module.',
  RIDER: 'Your assigned parcels and delivery updates are being built in the Rider module.',
  ADMIN: 'Parcel assignment, accounts and the delivery dashboard are being built in the Admin module.',
};

function Welcome({ role }: { role: Role }) {
  const { principal } = useSession();
  return <section aria-labelledby="workspace-heading" className="workspace-placeholder">
    <p className="section-label">{ROLE_LABEL[role]} workspace</p>
    <h1 id="workspace-heading">Signed in as {principal?.displayName}.</h1>
    <p className="lead">{unavailable[role]}</p>
    <p className="guard-status">This page is a placeholder until that module ships its screens.</p>
  </section>;
}

/** Landing page for a role until its owning module replaces the route. */
export function RoleWorkspacePlaceholder({ role }: { role: Role }) {
  return <div className="page-width workspace-page"><RouteGuard role={role}><Welcome role={role} /></RouteGuard></div>;
}
