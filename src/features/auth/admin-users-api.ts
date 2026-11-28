import { ApiFailure } from '@/shared/api-client';
import { auditListSchema, temporaryPasswordSchema, userListSchema, userSummarySchema, type AuditList, type UserList } from '@/shared/schemas';
import type { AUDIT_TYPES, Role } from '@/shared/constants';

export type AuditType = (typeof AUDIT_TYPES)[number];

export type UserFilters = { role?: Role; isActive?: boolean; page: number };
export type AuditFilters = { eventType?: AuditType; page: number };
export type UserSummary = UserList['items'][number];
export type AuditEvent = AuditList['items'][number];
export type NewRider = { username: string; displayName: string; initialPassword: string };

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
const json = { 'Content-Type': 'application/json' };

/** The five Admin account calls the screen needs, with every response checked against the shared strict schemas. */
export function createAdminUsersApi(request: Request) {
  return {
    async listUsers(filters: UserFilters, signal: AbortSignal): Promise<UserList> {
      const query = new URLSearchParams({ page: String(filters.page), pageSize: '20' });
      if (filters.role) query.set('role', filters.role);
      if (filters.isActive !== undefined) query.set('isActive', String(filters.isActive));
      return userListSchema.parse(await request('/admin/users?' + query, { signal }));
    },
    async setActive(userId: string, isActive: boolean, expectedVersion: number): Promise<UserSummary> {
      return userSummarySchema.parse(await request(`/admin/users/${encodeURIComponent(userId)}/status`, { method: 'PATCH', headers: json, body: JSON.stringify({ isActive, expectedVersion }) }));
    },
    async createRider(rider: NewRider): Promise<UserSummary> {
      return userSummarySchema.parse(await request('/admin/riders', { method: 'POST', headers: json, body: JSON.stringify(rider) }));
    },
    async resetPassword(userId: string): Promise<string> {
      return temporaryPasswordSchema.parse(await request(`/admin/users/${encodeURIComponent(userId)}/password-reset`, { method: 'POST' })).temporaryPassword;
    },
    async listAudit(filters: AuditFilters, signal: AbortSignal): Promise<AuditList> {
      const query = new URLSearchParams({ page: String(filters.page), pageSize: '20' });
      if (filters.eventType) query.set('eventType', filters.eventType);
      return auditListSchema.parse(await request('/admin/audit?' + query, { signal }));
    },
  };
}
export type AdminUsersApi = ReturnType<typeof createAdminUsersApi>;

export const isConflict = (error: unknown) => error instanceof ApiFailure && error.status === 409 && error.code === 'VERSION_CONFLICT';
