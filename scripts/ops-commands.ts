import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { LIMITS } from '../src/shared/constants';
import { displayNameSchema, usernameSchema } from '../src/shared/schemas';

/** What `provision-admin` needs from a password service: the policy check and the hash. */
export type Hasher = { hash(value: string): Promise<string> };
export type Usage = { error: string };

const ERROR_MESSAGES: Record<string, string> = {
  PT007: 'That username already belongs to a Seller or Rider. Admin accounts are never converted.',
  '22023': 'The database refused the details. Check the username, display name, password and expiry.',
};
/** Turns a database failure into one safe sentence: a SQLSTATE we know, or a generic line. Never the driver's text. */
export function describeFailure(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  return ERROR_MESSAGES[code] ?? 'The database refused the command.';
}

/**
 * `provision-admin`: creates a named Admin who must change the first password at first sign-in. A rerun for an
 * existing Admin is a no-op. The password is supplied by the caller, hashed here, and never printed or logged.
 */
export async function provisionAdmin(client: Pick<Client, 'query'>, input: { username: string; displayName: string; password: string }, hasher: Hasher): Promise<{ created: boolean } | Usage> {
  const username = usernameSchema.safeParse(input.username);
  if (!username.success) return { error: 'The username must be 3 to 50 lowercase letters, numbers, dots, dashes or underscores.' };
  const displayName = displayNameSchema.safeParse(input.displayName);
  if (!displayName.success) return { error: 'The display name must be 1 to 80 characters.' };
  if (Array.from(input.password).length < LIMITS.passwordMin) return { error: `The password must be at least ${LIMITS.passwordMin} characters.` };
  const hash = await hasher.hash(input.password);
  const { rows: [row] } = await client.query<{ created: boolean }>('SELECT created FROM app.provision_admin($1, $2, $3, $4)', [username.data, displayName.data, hash, randomUUID()]);
  return { created: row.created };
}

export type MaintenanceState = { enabled: boolean; until: string | null; active: boolean };
export async function maintenanceState(client: Pick<Client, 'query'>): Promise<MaintenanceState> {
  const { rows: [row] } = await client.query<{ maintenance_mode: boolean; set_until: Date | null; active: boolean }>('SELECT * FROM app.get_maintenance_state()');
  return { enabled: row.maintenance_mode, until: row.set_until ? row.set_until.toISOString() : null, active: row.active };
}
/** Turns maintenance on for 1 to 1440 minutes, or off. The database also refuses an expiry beyond 24 hours. */
export async function setMaintenance(client: Pick<Client, 'query'>, minutes: number | null): Promise<MaintenanceState | Usage> {
  if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)) return { error: 'Choose a whole number of minutes from 1 to 1440.' };
  await client.query('SELECT app.set_maintenance_mode($1, $2)', [minutes !== null, minutes === null ? null : new Date(Date.now() + minutes * 60_000)]);
  return maintenanceState(client);
}
