'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useSession } from '@/features/auth/session-provider';
import { ApiFailure } from '@/shared/api-client';
import { LIMITS, type ParcelStatus } from '@/shared/constants';
import type { RiderActionPanelProps } from '@/shared/types/parcel-slots';

type RiderOutcome = Extract<ParcelStatus, 'DELIVERED' | 'FAILED'>;
type UpdateStatus = (parcelId: string, status: Extract<ParcelStatus, 'OUT_FOR_DELIVERY' | RiderOutcome>, expectedVersion: number, proof?: File) => Promise<void>;
type Notice = { kind: 'success' | 'error'; title: string; detail: string };

const PHOTO_NAME = /^[^./\\]+\.(?:jpe?g|png)$/i;
const ALLOWED_MEDIA = new Set(['image/jpeg', 'image/png']);
const MAX_MIB = LIMITS.proofBytes / 1024 / 1024;

function validatePhoto(file: File | null) {
  if (!file) return 'Choose one JPG or PNG photo.';
  if (!file.size) return 'The photo is empty. Choose another JPG or PNG file.';
  if (file.size > LIMITS.proofBytes) return `The photo is larger than ${MAX_MIB} MiB. Choose a smaller file.`;
  if (!PHOTO_NAME.test(file.name) || !ALLOWED_MEDIA.has(file.type)) {
    return 'Choose a JPG or PNG with one image extension. Renamed or double-extension files are not accepted.';
  }
  return undefined;
}

function failureNotice(error: unknown): { notice: Notice; refresh: boolean } {
  if (!(error instanceof ApiFailure)) {
    return {
      notice: { kind: 'error', title: 'The result is uncertain.', detail: 'The parcel will refresh before you can try again. Check its latest status first.' },
      refresh: true,
    };
  }
  if (error.status === 409) return {
    notice: { kind: 'error', title: 'The parcel changed.', detail: 'The parcel will refresh before you can submit again. Your selected photo will be kept when the action is still available.' },
    refresh: true,
  };
  if (error.code === 'PROOF_TOO_LARGE' || error.status === 413) return {
    notice: { kind: 'error', title: 'The photo is too large.', detail: `Choose a JPG or PNG no larger than ${MAX_MIB} MiB.` }, refresh: false,
  };
  if (error.code === 'PROOF_INVALID' || error.status === 415) return {
    notice: { kind: 'error', title: 'That photo is not valid.', detail: 'Choose a single, non-animated JPG or PNG. Renaming another file type does not make it an image.' }, refresh: false,
  };
  if (error.code === 'PROOF_REQUIRED' || error.code === 'PROOF_COUNT') return {
    notice: { kind: 'error', title: 'One photo is required.', detail: 'Choose exactly one JPG or PNG, then submit the outcome again.' }, refresh: false,
  };
  if (error.status === 429) return {
    notice: { kind: 'error', title: 'Too many attempts.', detail: error.retryAfter ? `Try again in ${error.retryAfter} seconds.` : 'Wait a minute, then try again.' }, refresh: false,
  };
  if (error.status === 404 || error.status === 403 || error.status === 401) return {
    notice: { kind: 'error', title: 'This action is no longer available.', detail: 'The parcel will refresh to check its assignment and latest status.' }, refresh: true,
  };
  if (error.status >= 500) return {
    notice: { kind: 'error', title: 'The result is uncertain.', detail: 'The parcel will refresh before you can try again. Check its latest status first.' }, refresh: true,
  };
  return {
    notice: { kind: 'error', title: 'Couldn’t update this parcel.', detail: 'Review the selected outcome and photo, then try again.' }, refresh: false,
  };
}

type ViewProps = RiderActionPanelProps & { updateStatus: UpdateStatus };

export function RiderActionPanelView({ parcel, onChanged, updateStatus }: ViewProps) {
  const [outcome, setOutcome] = useState<RiderOutcome>();
  const [photoError, setPhotoError] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [pending, setPending] = useState(false);
  const [awaitingRefresh, setAwaitingRefresh] = useState<typeof parcel>();
  const mutation = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  const refreshing = awaitingRefresh === parcel;
  const blocked = pending || refreshing;

  async function submit(status: 'OUT_FOR_DELIVERY' | RiderOutcome, proof?: File) {
    if (mutation.current || blocked) return;
    mutation.current = true;
    setPending(true);
    setNotice(undefined);
    try {
      await updateStatus(parcel.id, status, parcel.version, proof);
      setNotice({
        kind: 'success', title: status === 'OUT_FOR_DELIVERY' ? 'Delivery started.' : `Parcel marked ${status === 'DELIVERED' ? 'Delivered' : 'Failed'}.`,
        detail: 'Refreshing the parcel with its latest status.',
      });
      onChanged();
    } catch (error) {
      const failure = failureNotice(error);
      setNotice(failure.notice);
      if (failure.refresh) {
        setAwaitingRefresh(parcel);
        onChanged();
      }
      queueMicrotask(() => noticeRef.current?.focus());
    } finally {
      mutation.current = false;
      setPending(false);
    }
  }

  function submitOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInput.current?.files?.[0] ?? null;
    const nextPhotoError = validatePhoto(file);
    setPhotoError(nextPhotoError);
    if (!outcome) {
      setNotice({ kind: 'error', title: 'Choose an outcome.', detail: 'Select Delivered or Failed before submitting.' });
      queueMicrotask(() => noticeRef.current?.focus());
      return;
    }
    if (nextPhotoError) {
      setNotice({ kind: 'error', title: 'Check the proof photo.', detail: nextPhotoError });
      queueMicrotask(() => noticeRef.current?.focus());
      return;
    }
    void submit(outcome, file!);
  }

  return <section className="parcel-detail-record grid gap-5" aria-labelledby="rider-action-title" aria-busy={pending}>
    <div>
      <p className="section-label">Rider action</p>
      <h2 id="rider-action-title">{parcel.currentStatus === 'ASSIGNED' ? 'Start this delivery' : 'Record the outcome'}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {parcel.currentStatus === 'ASSIGNED'
          ? 'Confirm when the parcel leaves for delivery.'
          : 'Choose the final outcome and attach one proof photo. This cannot be undone.'}
      </p>
    </div>

    {notice && <Alert
      ref={noticeRef}
      tabIndex={-1}
      role={notice.kind === 'error' ? 'alert' : 'status'}
      variant={notice.kind === 'error' ? 'destructive' : 'default'}
      className={notice.kind === 'success' ? 'border-success text-success' : undefined}
    >
      <AlertTitle>{notice.title}</AlertTitle>
      <p>{notice.detail}</p>
    </Alert>}

    {parcel.currentStatus === 'ASSIGNED' && <Button type="button" className="min-h-11 w-full sm:w-fit" disabled={blocked} onClick={() => void submit('OUT_FOR_DELIVERY')}>
      {pending ? 'Starting delivery…' : refreshing ? 'Refreshing parcel…' : 'Start delivery'}
    </Button>}

    {parcel.currentStatus === 'OUT_FOR_DELIVERY' && <form className="grid gap-5" onSubmit={submitOutcome} noValidate>
      <fieldset className="grid gap-3" disabled={blocked}>
        <legend className="font-semibold">Outcome</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['DELIVERED', 'FAILED'] as const).map(value => <Label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-input bg-card px-4 py-3 has-checked:border-primary has-checked:ring-2 has-checked:ring-ring">
            <input type="radio" name="rider-outcome" value={value} checked={outcome === value} onChange={() => { setOutcome(value); setNotice(undefined); }} />
            <span>{value === 'DELIVERED' ? 'Delivered' : 'Failed'}</span>
          </Label>)}
        </div>
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor={`rider-proof-${parcel.id}`}>Proof photo</Label>
        <input
          ref={fileInput}
          id={`rider-proof-${parcel.id}`}
          name="proof"
          type="file"
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          required
          disabled={blocked}
          aria-describedby={`rider-proof-hint-${parcel.id}${photoError ? ` rider-proof-error-${parcel.id}` : ''}`}
          aria-invalid={!!photoError}
          className="min-h-11 min-w-0 max-w-full rounded-md border border-input bg-card px-3 py-2 text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-primary file:px-3 file:py-1 file:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onChange={event => {
            setNotice(undefined);
            setPhotoError(validatePhoto(event.currentTarget.files?.[0] ?? null));
          }}
        />
        <p id={`rider-proof-hint-${parcel.id}`} className="text-sm text-muted-foreground">One JPG or PNG, up to {MAX_MIB} MiB. Animated, renamed and double-extension files are rejected.</p>
        {photoError && <p id={`rider-proof-error-${parcel.id}`} role="alert" className="text-sm text-destructive">{photoError}</p>}
      </div>

      <Button type="submit" className="min-h-11 w-full sm:w-fit" disabled={blocked}>
        {pending ? 'Saving outcome…' : refreshing ? 'Refreshing parcel…' : 'Save outcome'}
      </Button>
    </form>}
  </section>;
}

export function RiderActionPanel(props: RiderActionPanelProps) {
  const { request } = useSession();
  const updateStatus: UpdateStatus = async (parcelId, status, expectedVersion, proof) => {
    const body = new FormData();
    body.set('status', status);
    body.set('expectedVersion', String(expectedVersion));
    if (proof) body.set('proof', proof);
    await request('/rider/parcels/' + encodeURIComponent(parcelId) + '/status', { method: 'POST', body });
  };
  return <RiderActionPanelView {...props} updateStatus={updateStatus} />;
}
