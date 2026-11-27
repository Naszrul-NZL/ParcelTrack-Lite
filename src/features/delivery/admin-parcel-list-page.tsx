'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ParcelStatusBadge } from '@/components/parcel-status';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RouteGuard } from '@/features/auth/route-guard';
import { useSession } from '@/features/auth/session-provider';
import { cn } from '@/lib/utils';
import { ApiFailure } from '@/shared/api-client';
import { STATUSES, type ParcelStatus } from '@/shared/constants';
import { formatParcelTime, PARCEL_PRESENTATION } from '@/shared/parcel-presentation';
import { userListSchema, type UserList } from '@/shared/schemas';
import { adminParcelListSchema, type AdminParcelList, type AdminParcelSummary } from './admin-contract';

export type AdminParcelFilters = {
  status?: ParcelStatus;
  riderId?: string;
  needsReassignment?: boolean;
  page: number;
};

type Rider = UserList['items'][number];
type RiderDirectory = { all: Rider[]; active: Rider[] };
type Listing = { key: string; data?: AdminParcelList; error?: unknown };
type Directory = { attempt: number; data?: RiderDirectory; error?: unknown };
type Notice = { text: string; error?: boolean };
type Assignment = { parcel: AdminParcelSummary; riderId: string; notice?: Notice };

type Props = {
  initialFilters?: Partial<AdminParcelFilters>;
  loadParcels: (filters: AdminParcelFilters, signal: AbortSignal) => Promise<AdminParcelList>;
  loadRiders: (signal: AbortSignal) => Promise<RiderDirectory>;
  assignParcel: (parcelId: string, riderId: string, expectedVersion: number) => Promise<void>;
  adminName?: string;
};

const unfinished = new Set<ParcelStatus>(['REGISTERED', 'ASSIGNED', 'OUT_FOR_DELIVERY']);
const reassignable = new Set<ParcelStatus>(['ASSIGNED', 'OUT_FOR_DELIVERY']);
const filterKey = (filters: AdminParcelFilters, attempt: number) => JSON.stringify(filters) + '#' + attempt;

function needsReassignment(parcel: AdminParcelSummary) {
  return reassignable.has(parcel.currentStatus) && parcel.assignedRider !== null && !parcel.assignedRider.isActive;
}

export function AdminParcelListPage({ initialFilters, loadParcels, loadRiders, assignParcel, adminName }: Props) {
  const [filters, setFilters] = useState<AdminParcelFilters>({
    status: initialFilters?.status,
    riderId: initialFilters?.riderId,
    needsReassignment: initialFilters?.needsReassignment,
    page: initialFilters?.page ?? 1,
  });
  const [attempt, setAttempt] = useState(0);
  const [directoryAttempt, setDirectoryAttempt] = useState(0);
  const [listing, setListing] = useState<Listing>();
  const [directory, setDirectory] = useState<Directory>();
  const [assignment, setAssignment] = useState<Assignment>();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const updateMessage = useRef<HTMLParagraphElement>(null);
  const key = filterKey(filters, attempt);

  useEffect(() => {
    const controller = new AbortController();
    void loadParcels(filters, controller.signal).then(
      data => { if (!controller.signal.aborted) setListing({ key, data }); },
      error => { if (!controller.signal.aborted) setListing({ key, error }); },
    );
    return () => controller.abort();
  }, [filters, key, loadParcels]);

  useEffect(() => {
    const controller = new AbortController();
    void loadRiders(controller.signal).then(
      data => { if (!controller.signal.aborted) setDirectory({ attempt: directoryAttempt, data }); },
      error => { if (!controller.signal.aborted) setDirectory({ attempt: directoryAttempt, error }); },
    );
    return () => controller.abort();
  }, [directoryAttempt, loadRiders]);

  const loaded = listing?.key === key ? listing : undefined;
  const data = loaded?.data;
  const loadedDirectory = directory?.attempt === directoryAttempt ? directory : undefined;
  const riders = loadedDirectory?.data?.all;
  const activeRiders = useMemo(() => loadedDirectory?.data?.active ?? [], [loadedDirectory]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasFilters = !!(filters.status || filters.riderId || filters.needsReassignment);

  function updateFilters(next: Partial<AdminParcelFilters>) {
    setNotice(undefined);
    setFilters(current => ({ ...current, ...next, page: next.page ?? 1 }));
  }

  function openAssignment(parcel: AdminParcelSummary) {
    const currentRider = parcel.assignedRider?.isActive ? parcel.assignedRider.id : '';
    setAssignment({ parcel, riderId: currentRider });
  }

  async function refreshSelectedParcel(current: Assignment) {
    const latest = await loadParcels(filters, new AbortController().signal);
    setListing({ key, data: latest });
    return latest.items.find(parcel => parcel.id === current.parcel.id);
  }

  async function submitAssignment() {
    if (!assignment?.riderId || pending) return;
    setPending(true);
    setAssignment(current => current ? { ...current, notice: undefined } : current);
    try {
      await assignParcel(assignment.parcel.id, assignment.riderId, assignment.parcel.version);
      setAssignment(undefined);
      setNotice({ text: `Rider assignment saved for ${assignment.parcel.trackingNumber}.` });
      setAttempt(current => current + 1);
      queueMicrotask(() => updateMessage.current?.focus());
    } catch (error) {
      const conflict = error instanceof ApiFailure && error.status === 409;
      const uncertain = !(error instanceof ApiFailure) || error.status >= 500;
      if (conflict || uncertain) {
        try {
          const latest = await refreshSelectedParcel(assignment);
          if (!latest) {
            setAssignment(undefined);
            setNotice({ text: 'The parcel is no longer on this page. The list has been refreshed.', error: true });
          } else if (!unfinished.has(latest.currentStatus)) {
            setAssignment(undefined);
            setNotice({ text: `The parcel is now ${PARCEL_PRESENTATION[latest.currentStatus].label.toLowerCase()} and can no longer be assigned.`, error: true });
            queueMicrotask(() => updateMessage.current?.focus());
          } else {
            setAssignment(current => current ? {
              ...current,
              parcel: latest,
              notice: {
                text: conflict
                  ? 'The parcel changed. Its latest version is shown; review it before assigning again.'
                  : 'The result was uncertain. The latest parcel state is shown; review it before assigning again.',
                error: true,
              },
            } : current);
          }
        } catch {
          setAssignment(current => current ? { ...current, notice: { text: 'Could not confirm the latest parcel state. Close this dialog and retry the list.', error: true } } : current);
        }
      } else {
        const message = error instanceof ApiFailure && error.code === 'INVALID_ASSIGNEE'
          ? 'That Rider is no longer active. Refresh the Rider directory and choose another Rider.'
          : 'Could not save this assignment. Check your access and try again.';
        setAssignment(current => current ? {
          ...current,
          riderId: error instanceof ApiFailure && error.code === 'INVALID_ASSIGNEE' ? '' : current.riderId,
          notice: { text: message, error: true },
        } : current);
        if (error instanceof ApiFailure && error.code === 'INVALID_ASSIGNEE') setDirectoryAttempt(current => current + 1);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid gap-6" aria-labelledby="admin-parcels-heading">
      <div className="parcel-workspace-header mb-0!">
        <div>
          <h1 id="admin-parcels-heading">Parcel assignments</h1>
          {adminName && <p className="section-label">Signed in as {adminName}.</p>}
        </div>
        <Link href="/admin/dashboard" className={buttonVariants({ variant: 'outline', className: 'min-h-11' })}>Dashboard</Link>
      </div>

      <div className="grid gap-4 border-y border-border py-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="admin-parcel-status">Status</Label>
          <select id="admin-parcel-status" className="min-h-11 min-w-0 rounded-md border border-input bg-card px-3 text-foreground" value={filters.status ?? ''} disabled={pending}
            onChange={event => updateFilters({ status: STATUSES.find(status => status === event.currentTarget.value) })}>
            <option value="">All statuses</option>
            {STATUSES.map(status => <option key={status} value={status}>{PARCEL_PRESENTATION[status].label}</option>)}
          </select>
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="admin-parcel-rider">Assigned Rider</Label>
          <select id="admin-parcel-rider" className="min-h-11 min-w-0 rounded-md border border-input bg-card px-3 text-foreground" value={filters.riderId ?? ''} disabled={!riders || pending}
            onChange={event => updateFilters({ riderId: event.currentTarget.value || undefined })}>
            <option value="">All Riders</option>
            {riders?.map(rider => <option key={rider.id} value={rider.id}>{rider.displayName}{rider.isActive ? '' : ' (inactive)'}</option>)}
          </select>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 text-sm font-medium">
          <input type="checkbox" className="size-5 accent-primary" checked={!!filters.needsReassignment} disabled={pending}
            onChange={event => updateFilters({ needsReassignment: event.currentTarget.checked || undefined })} />
          Needs reassignment only
        </label>
      </div>

      {!loadedDirectory && <p role="status" className="text-sm text-muted-foreground">Loading Rider directory…</p>}
      {!!loadedDirectory?.error && <div className="grid justify-items-start gap-3">
        <p role="alert" className="text-destructive">Could not load the Rider directory. Assignment controls are unavailable.</p>
        <Button type="button" variant="outline" onClick={() => setDirectoryAttempt(current => current + 1)}>Retry Rider directory</Button>
      </div>}
      <p ref={updateMessage} tabIndex={-1} role="status" className={notice ? (notice.error ? 'text-destructive' : 'text-success') : 'sr-only'}>{notice?.text}</p>

      {!loaded && <p role="status" className="text-muted-foreground">Loading Admin parcel records…</p>}
      <div aria-busy={!loaded}>
        {!!loaded?.error && <div className="grid justify-items-start gap-3">
          <p role="alert" className="text-destructive">Could not load the Admin parcel list.</p>
          <Button type="button" variant="outline" onClick={() => setAttempt(current => current + 1)}>Retry parcel list</Button>
        </div>}
        {data?.total === 0 && <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-3xl">{hasFilters ? 'No matching parcels' : 'No parcels yet'}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {filters.needsReassignment
              ? 'No unfinished parcels are assigned to inactive Riders.'
              : hasFilters ? 'Change the filters to search another part of the parcel list.' : 'Registered parcels will appear here for assignment.'}
          </p>
        </div>}
        {data && data.total > 0 && data.items.length === 0 && <p className="text-muted-foreground">There are no parcels on this page.</p>}
        {!!data?.items.length && <ul aria-label="Admin parcel records" className="divide-y divide-border border-y border-border">
          {data.items.map(parcel => {
            const attention = needsReassignment(parcel);
            return <li key={parcel.id} className={cn('grid min-w-0 gap-4 py-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,.9fr)_auto] lg:items-center', attention && 'bg-accent px-3')}>
              <div className="grid min-w-0 justify-items-start gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <ParcelStatusBadge status={parcel.currentStatus} />
                  {attention && <span className="rounded-sm bg-journey-current px-2 py-1 text-xs font-semibold text-journey-current-foreground">Needs reassignment</span>}
                </div>
                <Link href={`/parcels/${parcel.id}`} className="inline-flex min-h-11 max-w-full items-center rounded-sm font-mono text-sm underline"><span className="[overflow-wrap:anywhere]">{parcel.trackingNumber}</span></Link>
                <p className="text-xs text-muted-foreground">Registered <time dateTime={parcel.createdAt}>{formatParcelTime(parcel.createdAt)}</time> · {parcel.weightKg} kg</p>
              </div>
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{parcel.assignedRider?.displayName ?? 'Unassigned'}</p>
                <p className={cn('mt-1 text-xs', parcel.assignedRider && !parcel.assignedRider.isActive ? 'text-destructive' : 'text-muted-foreground')}>
                  {parcel.assignedRider ? (parcel.assignedRider.isActive ? 'Active Rider' : 'Inactive Rider') : 'Choose an active Rider'}
                </p>
              </div>
              {unfinished.has(parcel.currentStatus) && <Button type="button" variant={attention ? 'default' : 'outline'} disabled={!activeRiders.length || pending} onClick={() => openAssignment(parcel)}>
                {parcel.assignedRider ? 'Reassign Rider' : 'Assign Rider'}<span className="sr-only"> for {parcel.trackingNumber}</span>
              </Button>}
            </li>;
          })}
        </ul>}
        {data && (pages > 1 || data.page > 1) && <nav aria-label="Admin parcel pages" className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" disabled={pending || data.page <= 1} onClick={() => updateFilters({ page: data.page - 1 })}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {data.page} of {pages}</span>
          <Button type="button" variant="outline" disabled={pending || data.page >= pages} onClick={() => updateFilters({ page: data.page + 1 })}>Next</Button>
        </nav>}
      </div>

      <Dialog open={!!assignment} onOpenChange={open => { if (!open && !pending) setAssignment(undefined); }}>
        {assignment && <DialogContent>
          <DialogTitle>{assignment.parcel.assignedRider ? 'Reassign Rider' : 'Assign Rider'}</DialogTitle>
          <DialogDescription>Choose an active Rider for <span className="font-mono [overflow-wrap:anywhere] text-foreground">{assignment.parcel.trackingNumber}</span>. The saved parcel version is {assignment.parcel.version}.</DialogDescription>
          <div className="mt-5 grid gap-2">
            <Label htmlFor="assignment-rider">Active Rider</Label>
            <select id="assignment-rider" className="min-h-12 min-w-0 rounded-md border border-input bg-card px-3 text-foreground" value={assignment.riderId} disabled={pending}
              onChange={event => setAssignment(current => current ? { ...current, riderId: event.currentTarget.value, notice: undefined } : current)}>
              <option value="">Choose a Rider</option>
              {activeRiders.map(rider => <option key={rider.id} value={rider.id}>{rider.displayName}</option>)}
            </select>
          </div>
          {assignment.notice && <p role="alert" className={cn('mt-4 text-sm', assignment.notice.error ? 'text-destructive' : 'text-success')}>{assignment.notice.text}</p>}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Cancel</DialogClose>
            <Button type="button" disabled={pending || !assignment.riderId} onClick={() => void submitAssignment()}>{pending ? 'Saving assignment…' : 'Save assignment'}</Button>
          </DialogFooter>
        </DialogContent>}
      </Dialog>
    </section>
  );
}

async function loadRiderPageSet(request: ReturnType<typeof useSession>['request'], signal: AbortSignal, activeOnly: boolean) {
  const items: Rider[] = [];
  for (let page = 1; ; page += 1) {
    const activeFilter = activeOnly ? '&isActive=true' : '';
    const data = userListSchema.parse(await request(`/admin/users?role=RIDER${activeFilter}&page=${page}&pageSize=100`, { signal }));
    items.push(...data.items);
    if (items.length >= data.total) return items;
  }
}

function AdminParcelWorkspaceContent({ initialFilters }: { initialFilters?: Partial<AdminParcelFilters> }) {
  const { principal, request } = useSession();
  const loadParcels = useCallback(async (filters: AdminParcelFilters, signal: AbortSignal) => {
    const query = new URLSearchParams({ page: String(filters.page) });
    if (filters.status) query.set('status', filters.status);
    if (filters.riderId) query.set('riderId', filters.riderId);
    if (filters.needsReassignment) query.set('needsReassignment', 'true');
    return adminParcelListSchema.parse(await request('/admin/parcels?' + query, { signal }));
  }, [request]);
  const loadRiders = useCallback(async (signal: AbortSignal) => {
    const [all, active] = await Promise.all([
      loadRiderPageSet(request, signal, false),
      loadRiderPageSet(request, signal, true),
    ]);
    return { all, active: active.filter(rider => rider.isActive) };
  }, [request]);
  const assignParcel = useCallback(async (parcelId: string, riderId: string, expectedVersion: number) => {
    await request('/admin/parcels/' + encodeURIComponent(parcelId) + '/assignment', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ riderId, expectedVersion }),
    });
  }, [request]);
  return <AdminParcelListPage initialFilters={initialFilters} loadParcels={loadParcels} loadRiders={loadRiders} assignParcel={assignParcel} adminName={principal?.displayName} />;
}

export function AdminParcelWorkspace({ initialFilters }: { initialFilters?: Partial<AdminParcelFilters> }) {
  return <div className="page-width parcel-workspace"><RouteGuard role="ADMIN"><AdminParcelWorkspaceContent initialFilters={initialFilters} /></RouteGuard></div>;
}
