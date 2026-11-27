import 'server-only';
import { readFile } from 'node:fs/promises';
import type { z } from 'zod';
import { AppError } from '@/server/core/errors';
import { LIMITS } from '@/shared/constants';
import { riderStatusFields } from '@/features/delivery/rider-contract';
import { sanitizeImage, validateProofFilename } from './images';
import { withStagedProof } from './staging';

const BODY_DEADLINE_MS = 10_000;
const MAX_PARTS = 10;
const MAX_BOUNDARY_CHARS = 70;
const activeByRider = new Map<string, number>();

export type RawProof = { filename: string; declaredType: string; bytes: Uint8Array };
export type PreparedProof = Awaited<ReturnType<typeof sanitizeImage>>;
export type StatusMultipart = { fields: z.infer<typeof riderStatusFields>; proofs: RawProof[] };

function multipartBoundary(contentType: string) {
  const match = /^multipart\/form-data\s*;\s*boundary=(?:"([^"]+)"|([^;\s]+))\s*$/i.exec(contentType);
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary || boundary.length > MAX_BOUNDARY_CHARS
    || Array.from(boundary).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new AppError('VALIDATION_ERROR');
  }
}

async function readBoundedBody(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  multipartBoundary(contentType);
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > LIMITS.multipartBytes)) {
    throw new AppError('PROOF_TOO_LARGE');
  }
  if (!request.body) throw new AppError('VALIDATION_ERROR');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const deadline = Promise.withResolvers<never>();
  const timer = setTimeout(() => deadline.reject(new AppError('BUSY')), BODY_DEADLINE_MS);
  try {
    for (;;) {
      const part = await Promise.race([reader.read(), deadline.promise]);
      if (part.done) break;
      total += part.value.byteLength;
      if (total > LIMITS.multipartBytes) throw new AppError('PROOF_TOO_LARGE');
      chunks.push(part.value);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('VALIDATION_ERROR');
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  return { bytes: Buffer.concat(chunks, total), contentType };
}

export async function readStatusMultipart(request: Request): Promise<StatusMultipart> {
  const { bytes, contentType } = await readBoundedBody(request);
  let form: FormData;
  try {
    form = await new Response(bytes, { headers: { 'content-type': contentType } }).formData();
  } catch {
    throw new AppError('VALIDATION_ERROR');
  }
  const entries = Array.from(form.entries());
  if (entries.length > MAX_PARTS) throw new AppError('VALIDATION_ERROR');
  if (entries.some(([name]) => !['status', 'expectedVersion', 'proof'].includes(name))) {
    throw new AppError('VALIDATION_ERROR');
  }
  const status = entries.filter(([name]) => name === 'status');
  const expectedVersion = entries.filter(([name]) => name === 'expectedVersion');
  if (status.length !== 1 || expectedVersion.length !== 1
    || typeof status[0][1] !== 'string' || typeof expectedVersion[0][1] !== 'string') {
    throw new AppError('VALIDATION_ERROR');
  }
  const proofEntries = entries.filter(([name]) => name === 'proof');
  if (proofEntries.length > 1) throw new AppError('PROOF_COUNT');
  const proofs: RawProof[] = [];
  for (const [, value] of proofEntries) {
    if (typeof value === 'string') throw new AppError('PROOF_INVALID');
    validateProofFilename(value.name);
    if (!value.size) throw new AppError('PROOF_INVALID');
    if (value.size > LIMITS.proofBytes) throw new AppError('PROOF_TOO_LARGE');
    proofs.push({ filename: value.name, declaredType: value.type, bytes: new Uint8Array(await value.arrayBuffer()) });
  }
  return {
    fields: riderStatusFields.parse({ status: status[0][1], expectedVersion: expectedVersion[0][1] }),
    proofs,
  };
}

export async function prepareProof(proof: RawProof): Promise<PreparedProof> {
  async function* source() { yield proof.bytes; }
  return withStagedProof(source(), async path => sanitizeImage(await readFile(path)));
}

export async function withRiderUploadSlot<T>(riderId: string, work: () => Promise<T>): Promise<T> {
  const active = activeByRider.get(riderId) ?? 0;
  if (active >= 1) throw new AppError('BUSY');
  activeByRider.set(riderId, active + 1);
  try { return await work(); }
  finally {
    const remaining = (activeByRider.get(riderId) ?? 1) - 1;
    if (remaining > 0) activeByRider.set(riderId, remaining);
    else activeByRider.delete(riderId);
  }
}
