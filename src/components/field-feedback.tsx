export function FieldFeedback({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (!error && !hint) return null;
  return <p id={id} className={error ? 'field-error' : 'field-help'} role={error ? 'alert' : undefined}>{error ?? hint}</p>;
}
