import { describe, expect, it } from 'vitest';
import { auditQuerySchema, changePasswordSchema, createRiderSchema, registerSchema, userListQuerySchema, userStatusSchema } from '@/shared/schemas';
import { validatePassword } from '@/server/modules/auth/password';
import { lintSql } from '../../scripts/sql-lint';
import fs from 'node:fs';

const valid = { username: 'new.seller', displayName: 'New Seller', password: 'a-sufficiently-long-secret' };
const fieldOf = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) => result.error?.issues.map(issue => String(issue.path[0]));

describe('M1-PH3-TC04 registration validation', () => {
  it('accepts a normal registration and normalizes the username', () => {
    expect(registerSchema.parse({ ...valid, username: '  New.Seller ' })).toEqual(valid);
  });

  it.each([
    ['too short', 'a'], ['space', 'a b'], ['Cyrillic homoglyph', 'аlice'], ['51 characters', 'a'.repeat(51)], ['SQL characters', "a';--"], ['uppercase symbol', 'bob@home'],
  ])('rejects a %s username', (_name, username) => {
    expect(fieldOf(registerSchema.safeParse({ ...valid, username }))).toContain('username');
  });

  it.each([['empty', ''], ['whitespace only', '   '], ['81 characters', 'x'.repeat(81)]])('rejects a %s display name', (_name, displayName) => {
    expect(fieldOf(registerSchema.safeParse({ ...valid, displayName }))).toContain('displayName');
  });

  it('applies the 10 to 128 character password rule by characters, not bytes', () => {
    expect(registerSchema.safeParse({ ...valid, password: 'x'.repeat(9) }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: 'x'.repeat(10) }).success).toBe(true);
    expect(registerSchema.safeParse({ ...valid, password: 'é'.repeat(10) }).success).toBe(true);
    expect(registerSchema.safeParse({ ...valid, password: 'x'.repeat(129) }).success).toBe(false);
  });

  it('rejects common passwords with a field error', () => {
    expect(() => validatePassword('password123')).toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR', fieldErrors: { password: expect.any(String) } }));
    expect(() => validatePassword('a-sufficiently-long-secret')).not.toThrow();
  });
});

describe('M1-PH3-TC02 strict bodies reject fields the client must not choose', () => {
  it.each(['role', 'isActive', 'mustChangePassword', 'id', 'version'])('registration rejects %s', field => {
    const result = registerSchema.safeParse({ ...valid, [field]: field === 'role' ? 'ADMIN' : true });
    expect(result.success).toBe(false);
  });
  it('Rider creation, password change and status change are strict too', () => {
    expect(createRiderSchema.safeParse({ username: 'rider.new', displayName: 'Rider', initialPassword: 'a-sufficiently-long-secret', role: 'ADMIN' }).success).toBe(false);
    expect(createRiderSchema.safeParse({ username: 'rider.new', displayName: 'Rider', initialPassword: 'short' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'a-sufficiently-long-secret', userId: '1' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: '', newPassword: 'a-sufficiently-long-secret' }).success).toBe(false);
    expect(userStatusSchema.safeParse({ isActive: false, expectedVersion: 3, role: 'ADMIN' }).success).toBe(false);
    expect(userStatusSchema.safeParse({ isActive: 'false', expectedVersion: 3 }).success).toBe(false);
    expect(userStatusSchema.safeParse({ isActive: false, expectedVersion: 0 }).success).toBe(false);
    expect(userStatusSchema.parse({ isActive: false, expectedVersion: 3 })).toEqual({ isActive: false, expectedVersion: 3 });
  });
});

describe('M1-PH3-TC12 list queries', () => {
  it('defaults, converts and caps', () => {
    expect(userListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(userListQuerySchema.parse({ role: 'RIDER', isActive: 'true', page: '2', pageSize: '500' })).toEqual({ role: 'RIDER', isActive: true, page: 2, pageSize: 100 });
    expect(auditQuerySchema.parse({ eventType: 'LOGIN_FAILED', parcelId: '12' })).toEqual({ eventType: 'LOGIN_FAILED', parcelId: '12', page: 1, pageSize: 20 });
  });
  it('rejects unknown filters, roles, event types and bad pages', () => {
    for (const query of [{ role: 'ROOT' }, { isActive: 'yes' }, { page: '0' }, { pageSize: '0' }, { sort: 'password' }, { 'role[$ne]': 'x' }]) expect(userListQuerySchema.safeParse(query).success, JSON.stringify(query)).toBe(false);
    for (const query of [{ eventType: 'DROP_TABLE' }, { parcelId: '0' }, { parcelId: '1 OR 1=1' }, { payload: 'x' }]) expect(auditQuerySchema.safeParse(query).success, JSON.stringify(query)).toBe(false);
  });
});

describe('account_functions draft hardening', () => {
  it('passes the privileged SQL lint rules', () => {
    expect(lintSql(fs.readFileSync('db/drafts/account_functions.sql', 'utf8'))).toEqual([]);
  });
});
