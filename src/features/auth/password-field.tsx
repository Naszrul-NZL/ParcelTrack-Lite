'use client';

import { forwardRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldFeedback } from '@/components/field-feedback';

type Props = {
  id: string; label: string; value: string; onChange(value: string): void;
  autoComplete: 'current-password' | 'new-password'; error?: string; hint?: string; disabled?: boolean;
};

/**
 * Labeled password input with a Show/Hide control. The parent remounts it (by key) after each submit, which also
 * returns it to the hidden state, so a revealed password never stays on screen once it has been sent.
 */
export const PasswordField = forwardRef<HTMLInputElement, Props>(function PasswordField({ id, label, value, onChange, autoComplete, error, hint, disabled }, ref) {
  const [visible, setVisible] = useState(false);
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
  return <div>
    <Label htmlFor={id} className="block">{label}</Label>
    <div className="password-input" style={{ marginTop: 10 }}>
      <Input ref={ref} id={id} name={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete} autoCapitalize="none" spellCheck={false}
        maxLength={128} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} aria-invalid={!!error} aria-describedby={describedBy} />
      <Button variant="ghost" size="sm" className="h-11 px-2 text-[13px]" type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</Button>
    </div>
    <FieldFeedback id={`${id}-error`} error={error} />
    {hint && <p id={`${id}-hint`} className="field-help">{hint}</p>}
  </div>;
});
