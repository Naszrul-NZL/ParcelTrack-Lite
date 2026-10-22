export const ROLES = ['SELLER', 'RIDER', 'ADMIN'] as const;
export type Role = typeof ROLES[number];
export const STATUSES = ['REGISTERED', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED'] as const;
export type ParcelStatus = typeof STATUSES[number];
export const LIMITS = {
  passwordMin: 10, passwordMax: 128, proofBytes: 3 * 1024 * 1024,
  multipartBytes: 4 * 1024 * 1024, jsonBytes: 16 * 1024, imagePixels: 12_000_000,
  anonymousMinutes: 10, idleMinutes: 30, absoluteHours: 8,
} as const;
export const BACKUP_LOCK_KEY = '731092461';
export const AUDIT_TYPES = [
  'LOGIN_SUCCEEDED','LOGIN_FAILED','LOGIN_THROTTLED','LOGOUT','PASSWORD_CHANGED','PASSWORD_RESET',
  'USER_CREATED','USER_STATUS_CHANGED','ACCOUNT_LOCKED','ACCOUNT_RECOVERED','SESSIONS_PURGED',
  'PARCEL_REGISTERED','PARCEL_ASSIGNED','PARCEL_REASSIGNED','STATUS_CHANGED','PROOF_UPLOADED',
  'PARCEL_VIEWED','PROOF_VIEWED','RETENTION_ANONYMIZED','PROOF_PURGED',
] as const;
