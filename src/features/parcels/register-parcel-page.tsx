'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FieldFeedback } from '@/components/field-feedback';
import { ParcelDocket } from '@/components/parcel-docket';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RouteGuard } from '@/features/auth/route-guard';
import { useSession } from '@/features/auth/session-provider';
import { ApiFailure } from '@/shared/api-client';
import { parcelDetailSchema, parcelInputSchema, type ParcelDetail } from '@/shared/schemas';

const fields = [
  { name: 'recipientName', label: 'Recipient name', hint: undefined, maxLength: 120, inputMode: 'text' },
  { name: 'recipientPhone', label: 'Recipient phone', hint: 'Use a Malaysian or international phone number.', maxLength: 32, inputMode: 'tel' },
  { name: 'recipientAddress', label: 'Delivery address', hint: undefined, maxLength: 500, inputMode: 'text' },
  { name: 'weightKg', label: 'Weight (kg)', hint: '0.001 to 100 kg, with up to three decimal places.', maxLength: 7, inputMode: 'decimal' },
] as const;
type FieldErrors = Partial<Record<typeof fields[number]['name'], string>>;
const fieldMessage: Required<FieldErrors> = {
  recipientName: 'Enter a recipient name with up to 120 characters.',
  recipientPhone: 'Enter a valid local or international phone number.',
  recipientAddress: 'Enter a delivery address with up to 500 characters.',
  weightKg: 'Enter a weight from 0.001 to 100 kg with up to three decimal places.',
};

function RegisterParcel() {
  const { request } = useSession();
  const clientRequestId = useRef<string | null>(null);
  const submitting = useRef(false);
  const confirmation = useRef<HTMLHeadingElement>(null);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState('');
  const [parcel, setParcel] = useState<ParcelDetail | null>(null);
  useEffect(() => { if (parcel) confirmation.current?.focus(); }, [parcel]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    clientRequestId.current ??= crypto.randomUUID();
    const data = parcelInputSchema.safeParse({
      ...Object.fromEntries(fields.map(field => [field.name, String(values.get(field.name) ?? '')])),
      clientRequestId: clientRequestId.current,
    });
    setFailure('');
    setFieldErrors({});
    const showErrors = (errors: Record<string, unknown>) => {
      const invalid = fields.filter(field => Object.hasOwn(errors, field.name));
      setFieldErrors(Object.fromEntries(invalid.map(field => [field.name, fieldMessage[field.name]])));
      if (invalid[0]) requestAnimationFrame(() => {
        const element = form.elements.namedItem(invalid[0].name);
        if (element instanceof HTMLElement) element.focus();
      });
      return invalid.length > 0;
    };
    if (!data.success) {
      showErrors(Object.fromEntries(data.error.issues.map(issue => [String(issue.path[0]), true])));
      return;
    }

    submitting.current = true;
    setPending(true);
    try {
      const response = await request<unknown>('/parcels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data.data),
      });
      setParcel(parcelDetailSchema.parse(response));
    } catch (error) {
      if (error instanceof ApiFailure && error.fields && showErrors(error.fields)) return;
      if (error instanceof ApiFailure && error.code === 'IDEMPOTENCY_CONFLICT') {
        setFailure('This request was already used. Check your parcel list before submitting a new registration.');
      } else if (error instanceof ApiFailure && error.code === 'REQUEST_EXPIRED') {
        setFailure('This registration is too old to repeat. Check your parcel list, then register it again as a new parcel.');
      } else if (error instanceof ApiFailure && error.code === 'CSRF_INVALID') {
        setFailure('Reload this page to refresh your session before trying again.');
      } else {
        setFailure('Couldn’t confirm registration. Check your connection and parcel list, then retry here if needed.');
      }
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return <section aria-labelledby="register-parcel-title">
    <Link href="/seller/parcels" className="text-link">Your parcels</Link>
    <div className="parcel-workspace-header">
      <h1 id="register-parcel-title" ref={confirmation} tabIndex={-1}>{parcel ? 'Parcel registered' : 'Register a parcel'}</h1>
    </div>
    {parcel ? <>
      <ParcelDocket className="parcel-confirmation-docket" trackingNumber={parcel.trackingNumber} status={parcel.currentStatus} history={parcel.history} />
      <Link href={'/parcels/' + parcel.id} className={buttonVariants({ className: 'mt-5 min-h-11' })}>View parcel details</Link>
    </> : <form className="parcel-register-form" onSubmit={submit} noValidate aria-busy={pending}>
      <fieldset disabled={pending}>
        <legend className="sr-only">Parcel registration details</legend>
        <div className="parcel-form-fields">
          {fields.map(field => {
            const feedback = fieldErrors[field.name];
            const props = {
              id: field.name, name: field.name, required: true, maxLength: field.maxLength,
              'aria-invalid': !!feedback,
              'aria-describedby': feedback || field.hint ? field.name + '-feedback' : undefined,
            };
            return <div className={'parcel-field parcel-field-' + field.name} key={field.name}>
              <Label htmlFor={field.name}>{field.label}</Label>
              {field.name === 'recipientAddress'
                ? <textarea className="parcel-address" rows={3} {...props} />
                : <Input inputMode={field.inputMode} {...props} />}
              <FieldFeedback id={field.name + '-feedback'} error={feedback} hint={field.hint} />
            </div>;
          })}
        </div>
        {failure && <p className="field-error" role="alert">{failure}</p>}
        <Button className="min-h-11" type="submit" disabled={pending}>{pending ? 'Registering…' : 'Register parcel'}</Button>
      </fieldset>
    </form>}
  </section>;
}

export function RegisterParcelPage() {
  return <div className="page-width parcel-workspace">
    <RouteGuard role="SELLER"><RegisterParcel /></RouteGuard>
  </div>;
}
