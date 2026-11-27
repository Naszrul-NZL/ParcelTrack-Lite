import { z } from 'zod';
import { idSchema, parcelSummarySchema, statusSchema } from '@/shared/schemas';

const positiveInteger = z.string().regex(/^[1-9][0-9]{0,9}$/).transform(Number);
const pgIntegerMax = 2_147_483_647;

export const assignedRiderSummarySchema = z.strictObject({
  id: idSchema,
  displayName: z.string(),
  isActive: z.boolean(),
});

export const adminParcelSummarySchema = parcelSummarySchema.extend({
  assignedRider: assignedRiderSummarySchema.nullable(),
});

export const adminParcelListQuerySchema = z.strictObject({
  status: statusSchema.optional(),
  riderId: idSchema.optional(),
  needsReassignment: z.enum(['true', 'false']).transform(value => value === 'true').optional(),
  page: positiveInteger.pipe(z.number().max(100_000)).default(1),
  pageSize: positiveInteger.transform(value => Math.min(value, 100)).default(20),
});

export const adminParcelListSchema = z.strictObject({
  items: z.array(adminParcelSummarySchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
});

export const assignmentSchema = z.strictObject({
  riderId: idSchema,
  expectedVersion: z.number().int().positive().max(pgIntegerMax),
});

export const dashboardSchema = z.strictObject({
  counts: z.strictObject({
    REGISTERED: z.number().int().nonnegative(),
    ASSIGNED: z.number().int().nonnegative(),
    OUT_FOR_DELIVERY: z.number().int().nonnegative(),
    DELIVERED: z.number().int().nonnegative(),
    FAILED: z.number().int().nonnegative(),
  }),
  total: z.number().int().nonnegative(),
  generatedAt: z.iso.datetime(),
});

export type AdminParcelList = z.infer<typeof adminParcelListSchema>;
