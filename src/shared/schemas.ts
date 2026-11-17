import { z } from 'zod';
import { AUDIT_TYPES, LIMITS, ROLES, STATUSES } from './constants';

const chars = (value: string) => Array.from(value).length;
export const roleSchema = z.enum(ROLES);
export const statusSchema = z.enum(STATUSES);
export const idSchema = z.string().regex(/^[1-9][0-9]{0,17}$/);
export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,50}$/);
export const passwordSchema = z.string().refine(v => chars(v) >= LIMITS.passwordMin && chars(v) <= LIMITS.passwordMax, 'Use 10 to 128 characters.');
export const displayNameSchema = z.string().trim().refine(v => chars(v) >= 1 && chars(v) <= 80, 'Use 1 to 80 characters.');
export const phoneSchema = z.string().transform(v => v.replace(/[\s()-]/g, '')).transform(v => v.startsWith('0') ? '+60' + v.slice(1) : v).pipe(z.string().regex(/^\+[1-9][0-9]{7,14}$/, 'Enter a valid local or international phone number.'));
export const weightSchema = z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,3})?$/, 'Use a decimal weight with up to three places.').refine(v => {
  const [whole, fraction = ''] = v.split('.');
  if (whole.length > 3) return false;
  const grams = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  return grams >= 1 && grams <= 100_000;
}, 'Use 0.001 to 100.000 kg.').transform(v => {
  const [whole, fraction = ''] = v.split('.');
  return whole + '.' + fraction.padEnd(3, '0');
});
export const principalSchema = z.strictObject({id: idSchema, username: usernameSchema, displayName: displayNameSchema, role: roleSchema, mustChangePassword: z.boolean()});
export type Principal = z.infer<typeof principalSchema>;
export const userSummarySchema = principalSchema.extend({isActive: z.boolean(), version: z.number().int().positive()});
export const registerSchema = z.strictObject({username: usernameSchema, displayName: displayNameSchema, password: passwordSchema});
export const loginSchema = z.strictObject({username: usernameSchema, password: z.string().refine(v => chars(v) <= 128)});
// M1 PH3 request bodies and query strings. Strict objects reject unknown fields such as role, isActive or
// mustChangePassword; the account role is decided by the endpoint, never by the request.
export const createRiderSchema = z.strictObject({username: usernameSchema, displayName: displayNameSchema, initialPassword: passwordSchema});
export const changePasswordSchema = z.strictObject({currentPassword: z.string().min(1).refine(v => chars(v) <= LIMITS.passwordMax), newPassword: passwordSchema});
export const userStatusSchema = z.strictObject({isActive: z.boolean(), expectedVersion: z.number().int().positive()});
const pageSchema = z.coerce.number().int().min(1).max(100_000).default(1);
// A list never errors on an oversized page: it is served at the cap.
const pageSizeSchema = z.coerce.number().int().min(1).transform(v => Math.min(v, 100)).default(20);
export const userListQuerySchema = z.strictObject({
  role: roleSchema.optional(),
  isActive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  page: pageSchema, pageSize: pageSizeSchema,
});
export const auditQuerySchema = z.strictObject({eventType: z.enum(AUDIT_TYPES).optional(), parcelId: idSchema.optional(), page: pageSchema, pageSize: pageSizeSchema});
export const parcelInputSchema = z.strictObject({
  recipientName: z.string().trim().refine(v => chars(v) >= 1 && chars(v) <= 120),
  recipientPhone: phoneSchema,
  recipientAddress: z.string().trim().refine(v => chars(v) >= 1 && chars(v) <= 500),
  weightKg: weightSchema,
  clientRequestId: z.uuid(),
});
export const trackingInputSchema = z.strictObject({trackingNumber: z.string().trim().toUpperCase().regex(/^PTL-[0-9A-F]{32}$/)});
export const historySchema = z.strictObject({status: statusSchema, changedAt: z.iso.datetime()});
export const publicTrackingSchema = z.strictObject({history: z.array(historySchema)});
export const parcelSummarySchema = z.strictObject({id: idSchema, trackingNumber: z.string().regex(/^PTL-[0-9A-F]{32}$/), currentStatus: statusSchema, weightKg: z.string().regex(/^[0-9]+\.[0-9]{3}$/), createdAt: z.iso.datetime(), version: z.number().int().positive()});
export const parcelDetailSchema = parcelSummarySchema.extend({
  recipient: z.strictObject({name: z.string().nullable(), phone: z.string().nullable(), address: z.string().nullable()}),
  assignedRider: z.strictObject({id: idSchema, displayName: z.string(), isActive: z.boolean()}).nullable(),
  history: z.array(historySchema.extend({changedBy: z.strictObject({id: idSchema, displayName: z.string()}).optional()})),
  hasProof: z.boolean(), anonymized: z.boolean(), terminalAt: z.iso.datetime().nullable(),
});
export type ParcelInput = z.infer<typeof parcelInputSchema>;
