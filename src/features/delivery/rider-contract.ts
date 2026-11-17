import { z } from 'zod';
import { parcelSummarySchema, statusSchema } from '@/shared/schemas';

const positiveInteger = z.string().regex(/^[1-9][0-9]{0,9}$/).transform(Number);
const pgIntegerMax = 2_147_483_647;

export const riderListQuerySchema = z.strictObject({
  status: statusSchema.optional(),
  page: positiveInteger.pipe(z.number().max(pgIntegerMax)).default(1),
  pageSize: positiveInteger.pipe(z.number().max(100)).default(20),
});

export const riderListSchema = z.strictObject({
  items: z.array(parcelSummarySchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
});

export const riderStatusMultipartSchema = z.strictObject({
  status: statusSchema,
  expectedVersion: z.number().int().min(1).max(pgIntegerMax),
});

export const riderStatusFields = z.strictObject({
  status: statusSchema,
  expectedVersion: positiveInteger.pipe(riderStatusMultipartSchema.shape.expectedVersion),
});

export type RiderList = z.infer<typeof riderListSchema>;
