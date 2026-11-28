import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPrincipalUow } from '@/server/core/authorized';
import { createAccountJournal, readJournal } from '@/server/modules/auth/account-journal';
import { PasswordService } from '@/server/modules/auth/password';
import { createUserAdminHandlers } from '@/server/modules/auth/user-handlers';
import { createDatabaseHarness, type IsolatedDatabase } from '../harness/isolated-database';
import { apiRequest, authHandlers, bootstrapCsrf, loginAs, origin } from '../harness/login-as';

let harness: Awaited<ReturnType<typeof createDatabaseHarness>>;
beforeAll(async () => { harness = await createDatabaseHarness(); });
afterAll(async () => { await harness?.dispose(); });

let directory: string;
let file: string;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ptl-journal-')); file = path.join(directory, 'journal.ndjson'); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); vi.restoreAllMocks(); });

const journal = () => createAccountJournal({ path: file });
const records = () => (fs.existsSync(file) ? readJournal(file).records.map(({ userId, event, isActive }) => ({ userId, event, ...(isActive === undefined ? {} : { isActive }) })) : []);
const admin = (database: IsolatedDatabase, target = journal()) => createUserAdminHandlers(createPrincipalUow(database.pool(), { APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev' }), new PasswordService(2), () => target);
const errorCode = async (response: Response) => (await response.json()).error.code as string;
const account = async (database: IsolatedDatabase, username: string) => (await (await database.migrationClient()).query<{ id: string; version: number }>('SELECT id, version FROM app.app_user WHERE username = $1', [username])).rows[0];

describe('M1-PH3 account journal wiring (D-16)', () => {
  it('records registration and a password change only after they succeed, and not when they are refused', async () => {
    await harness.run(async database => {
      const auth = authHandlers(database, { journal: journal() });
      const visitor = await bootstrapCsrf(auth);
      const bad = await auth.register(apiRequest('/auth/register', { method: 'POST', ...visitor, body: JSON.stringify({ username: 'j.seller', displayName: 'J', password: 'short' }) }));
      expect(bad.status).toBe(422);
      const taken = await auth.register(apiRequest('/auth/register', { method: 'POST', ...visitor, body: JSON.stringify({ username: 'seller.a', displayName: 'J', password: 'a-sufficiently-long-secret' }) }));
      expect([taken.status, await errorCode(taken)]).toEqual([409, 'USERNAME_TAKEN']);
      expect(records()).toEqual([]);

      const ok = await auth.register(apiRequest('/auth/register', { method: 'POST', ...visitor, body: JSON.stringify({ username: 'j.seller', displayName: 'J', password: 'a-sufficiently-long-secret' }) }));
      expect(ok.status).toBe(201);
      const created = (await ok.json()).id as string;
      expect(records()).toEqual([{ userId: created, event: 'USER_CREATED' }]);

      const session = await loginAs(database, 'seller.b', { handlers: auth });
      const wrong = await auth.changePassword(session.request('/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword: 'not-the-password', newPassword: 'a-brand-new-secret-1' }) }));
      expect(wrong.status).toBe(422);
      expect(records()).toHaveLength(1);
      const changed = await auth.changePassword(session.request('/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword: database.loginInput('seller.b').password, newPassword: 'a-brand-new-secret-1' }) }));
      expect(changed.status).toBe(204);
      expect(records()).toEqual([{ userId: created, event: 'USER_CREATED' }, { userId: database.accounts['seller.b'], event: 'PASSWORD_CHANGED' }]);
    });
  });

  it('records Rider creation, disable, reactivate and password reset, and nothing for refused or conflicting calls', async () => {
    await harness.run(async database => {
      const auth = authHandlers(database);
      const session = await loginAs(database, 'ADMIN', { handlers: auth });
      const handlers = admin(database);
      const create = (username: string, password = 'rider-first-secret-1') => handlers.createRider(session.request('/admin/riders', { method: 'POST', body: JSON.stringify({ username, displayName: 'New Rider', initialPassword: password }) }));
      expect((await create('rider.dup', 'short')).status).toBe(422);
      expect((await create('rider.a')).status).toBe(409);
      expect(records()).toEqual([]);

      const made = await create('j.rider');
      expect(made.status).toBe(201);
      const rider = await made.json();
      expect(records()).toEqual([{ userId: rider.id, event: 'USER_CREATED' }]);

      const status = (userId: string, isActive: boolean, expectedVersion: number) => handlers.updateStatus(
        session.request(`/admin/users/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ isActive, expectedVersion }) }), { params: Promise.resolve({ userId }) });
      expect((await status(rider.id, false, rider.version + 5)).status).toBe(409);
      expect((await status(database.accounts.admin, false, 1)).status).toBe(403);
      expect(records()).toHaveLength(1);
      const off = await status(rider.id, false, rider.version);
      const on = await status(rider.id, true, (await off.json()).version);
      expect([off.status, on.status]).toEqual([200, 200]);
      expect(records().slice(1)).toEqual([{ userId: rider.id, event: 'USER_STATUS_CHANGED', isActive: false }, { userId: rider.id, event: 'USER_STATUS_CHANGED', isActive: true }]);

      const reset = (userId: string) => handlers.resetPassword(session.request(`/admin/users/${userId}/password-reset`, { method: 'POST' }), { params: Promise.resolve({ userId }) });
      expect((await reset(database.accounts.admin)).status).toBe(403);
      expect((await reset('999999999')).status).toBe(404);
      const done = await reset(rider.id);
      expect(done.status).toBe(200);
      expect(Object.keys(await done.json())).toEqual(['temporaryPassword']);
      expect(records().at(-1)).toEqual({ userId: rider.id, event: 'PASSWORD_RESET' });
      expect(records()).toHaveLength(4);
    });
  });

  it('never writes a password, hash, token or username into the journal file', async () => {
    await harness.run(async database => {
      const auth = authHandlers(database, { journal: journal() });
      const session = await loginAs(database, 'ADMIN', { handlers: auth });
      const handlers = admin(database);
      const made = await handlers.createRider(session.request('/admin/riders', { method: 'POST', body: JSON.stringify({ username: 'secret.rider', displayName: 'Secret Rider', initialPassword: 'canary-initial-secret-9' }) }));
      const rider = await made.json();
      const reset = await handlers.resetPassword(session.request(`/admin/users/${rider.id}/password-reset`, { method: 'POST' }), { params: Promise.resolve({ userId: rider.id }) });
      const { temporaryPassword } = await reset.json();
      const text = fs.readFileSync(file, 'utf8');
      for (const forbidden of ['canary-initial-secret-9', temporaryPassword, 'secret.rider', 'Secret Rider', 'argon2', 'token', 'csrf', 'cookie']) expect(text, forbidden).not.toContain(forbidden);
      for (const line of text.trim().split('\n')) expect(Object.keys(JSON.parse(line)).every(key => ['t', 'userId', 'event', 'isActive'].includes(key))).toBe(true);
    });
  });

  it('still answers the request, and marks a gap, when the journal cannot be written', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await harness.run(async database => {
      fs.mkdirSync(file);
      const auth = authHandlers(database);
      const session = await loginAs(database, 'ADMIN', { handlers: auth });
      const target = await account(database, 'seller.b');
      const response = await admin(database).updateStatus(session.request(`/admin/users/${target.id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: false, expectedVersion: target.version }) }), { params: Promise.resolve({ userId: target.id }) });
      expect(response.status).toBe(200);
      expect((await account(database, 'seller.b')).version).toBe(target.version + 1);
      expect(readJournal(file).gap).toBe(true);
      expect(readJournal(file).unavailable).toBe(true);
    });
  });
});
