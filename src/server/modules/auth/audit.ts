import 'server-only';
import type { PoolClient } from 'pg';

type Queryable = Pick<PoolClient, 'query'>;
// PH2 audit v1. Other event types are inserted by their owning SQL functions through the same table.
const ALLOWED_TYPES = ['LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGIN_THROTTLED', 'LOGOUT'] as const;
const ALLOWED_DETAILS = ['scope', 'reason', 'usernameDigest', 'usernameLength', 'retryAfter'] as const;
export type AuthAuditType = typeof ALLOWED_TYPES[number];
export type AuditDetails = Partial<Record<typeof ALLOWED_DETAILS[number], string | number>>;
export type AuditEvent = {
  type: AuthAuditType; outcome: 'SUCCESS' | 'FAILURE'; requestId: string;
  actorId?: string | null; targetUserId?: string | null; details?: AuditDetails;
};

/** Rejects unknown event types and detail keys so passwords, tokens and request bodies cannot reach the table. */
export async function recordAudit(client: Queryable, event: AuditEvent) {
  if (!ALLOWED_TYPES.includes(event.type)) throw new Error('Unsupported audit event type.');
  const details = event.details ?? {};
  for (const [key, value] of Object.entries(details)) {
    if (!(ALLOWED_DETAILS as readonly string[]).includes(key)) throw new Error('Unsupported audit detail.');
    if (typeof value === 'string' ? value.length > 128 : typeof value !== 'number') throw new Error('Unsupported audit detail value.');
  }
  await client.query(
    'INSERT INTO app.audit_event(actor_id,target_user_id,event_type,outcome,request_id,details) VALUES($1,$2,$3,$4,$5,$6)',
    [event.actorId ?? null, event.targetUserId ?? null, event.type, event.outcome, event.requestId, JSON.stringify(details)]);
}
