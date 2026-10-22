import 'server-only';
const sensitive = /password|secret|token|csrf|cookie|authorization|recipient|phone|address|username|headers|body/i;
export function redact(value: unknown): unknown {
  if (value instanceof Error) return {type:'Error'};
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, sensitive.test(k) ? '[REDACTED]' : redact(v)]));
  return value;
}
export function logEvent(event: 'request_failed'|'service_ready'|'job_completed', context: Record<string,unknown> = {}) {
  console.log(JSON.stringify({event,...redact(context) as object}));
}
