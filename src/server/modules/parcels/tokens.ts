import 'server-only';
import { randomBytes, createHmac } from 'node:crypto';
import type { ParcelInput } from '@/shared/schemas';
export function makeTracking(random: (size:number) => Uint8Array = randomBytes): string {
  return 'PTL-' + Buffer.from(random(16)).toString('hex').toUpperCase();
}
export function creationFingerprint(input: ParcelInput, key: string) {
  return createHmac('sha256',key).update(JSON.stringify([input.recipientName,input.recipientPhone,input.recipientAddress,input.weightKg])).digest('hex');
}
export function escapeLike(input: string) { return input.replace(/[\\%_]/g, '\\$&'); }
