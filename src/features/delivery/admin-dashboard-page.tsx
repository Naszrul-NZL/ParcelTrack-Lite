'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { RouteGuard } from '@/features/auth/route-guard';
import { useSession } from '@/features/auth/session-provider';
import { STATUSES, type ParcelStatus } from '@/shared/constants';
import { formatParcelTime, PARCEL_PRESENTATION } from '@/shared/parcel-presentation';
import { dashboardSchema, type AdminDashboard } from './admin-contract';

type Props = {
  loadDashboard: (signal: AbortSignal) => Promise<AdminDashboard>;
  adminName?: string;
};

function statusHref(status: ParcelStatus) {
  return '/admin/parcels?status=' + encodeURIComponent(status);
}

export function AdminDashboardPage({ loadDashboard, adminName }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; data?: AdminDashboard; error?: unknown }>();

  useEffect(() => {
    const controller = new AbortController();
    void loadDashboard(controller.signal).then(
      data => { if (!controller.signal.aborted) setResult({ attempt, data }); },
      error => { if (!controller.signal.aborted) setResult({ attempt, error }); },
    );
    return () => controller.abort();
  }, [attempt, loadDashboard]);

  const loaded = result?.attempt === attempt ? result : undefined;
  const data = loaded?.data;

  return (
    <section className="grid gap-7" aria-labelledby="admin-dashboard-heading">
      <div className="parcel-workspace-header mb-0!">
        <div>
          <h1 id="admin-dashboard-heading">Parcel dashboard</h1>
          {adminName && <p className="section-label">Signed in as {adminName}.</p>}
        </div>
        <Link href="/admin/parcels" className={buttonVariants({ className: 'min-h-11' })}>Manage assignments</Link>
      </div>

      {!loaded && <p role="status" className="text-muted-foreground">Loading parcel counts…</p>}
      {!!loaded?.error && <div className="grid justify-items-start gap-3">
        <p role="alert" className="text-destructive">Could not load the Admin dashboard.</p>
        <Button type="button" variant="outline" onClick={() => setAttempt(current => current + 1)}>Retry dashboard</Button>
      </div>}
      {data && <div className="grid gap-7">
        <div className="flex flex-wrap items-end justify-between gap-4 border-y border-border py-5">
          <div>
            <p className="section-label">All retained parcels</p>
            <p className="font-heading text-6xl font-semibold leading-none">{data.total}</p>
          </div>
          <Link href="/admin/parcels" className="inline-flex min-h-11 items-center text-sm font-semibold underline">View all parcels</Link>
        </div>
        <dl aria-label="Parcel counts by status" className="divide-y divide-border border-y border-border">
          {STATUSES.map(status => <div key={status} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5 py-4 sm:py-5">
            <dt><Link href={statusHref(status)} className="inline-flex min-h-11 items-center text-base font-semibold underline">{PARCEL_PRESENTATION[status].label}</Link></dt>
            <dd className="font-heading text-5xl font-semibold leading-none tabular-nums">{data.counts[status]}</dd>
          </div>)}
        </dl>
        <p className="text-sm text-muted-foreground">Counts generated <time dateTime={data.generatedAt}>{formatParcelTime(data.generatedAt)}</time>.</p>
      </div>}
    </section>
  );
}

function AdminDashboardWorkspaceContent() {
  const { principal, request } = useSession();
  const loadDashboard = useCallback(async (signal: AbortSignal) => dashboardSchema.parse(await request('/admin/dashboard', { signal })), [request]);
  return <AdminDashboardPage loadDashboard={loadDashboard} adminName={principal?.displayName} />;
}

export function AdminDashboardWorkspace() {
  return <div className="page-width parcel-workspace"><RouteGuard role="ADMIN"><AdminDashboardWorkspaceContent /></RouteGuard></div>;
}
