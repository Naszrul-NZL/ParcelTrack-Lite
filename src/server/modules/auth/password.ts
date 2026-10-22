import 'server-only';
import argon2 from 'argon2';
import { AppError } from '@/server/core/errors';
import { passwordSchema } from '@/shared/schemas';
import commonPasswords from './common-passwords.json';
// Locally maintained starter denylist; expand and review it before production acceptance.
const common = new Set(commonPasswords);
export const HASH_OPTIONS = {type:argon2.argon2id, memoryCost:19456, timeCost:2, parallelism:1} as const;
export function validatePassword(value: string) {
  passwordSchema.parse(value);
  if (common.has(value.toLowerCase())) throw new AppError('VALIDATION_ERROR',{password:'Choose a less common password.'});
}
let active=0;
let dummy:Promise<string>|undefined;
export class PasswordService {
  private dummy: Promise<string>;
  constructor(private maximum = Number(process.env.HASH_CONCURRENCY??2)) {
    if(!Number.isInteger(maximum)||maximum<1||maximum>8)throw new Error('Invalid hashing concurrency limit.');
    this.dummy = dummy ??= argon2.hash('unused-dummy-value-for-timing', HASH_OPTIONS);
  }
  private async bounded<T>(work: () => Promise<T>) {
    if (active >= this.maximum) throw new AppError('BUSY');
    active++;
    try { return await work(); } finally { active--; }
  }
  hash(value: string) { validatePassword(value); return this.bounded(() => argon2.hash(value,HASH_OPTIONS)); }
  async verify(hash: string | null, value: string): Promise<boolean> {
    if (Array.from(value).length > 128) throw new AppError('VALIDATION_ERROR');
    const candidate = hash ?? await this.dummy;
    const result = await this.bounded(() => argon2.verify(candidate,value));
    return hash !== null && result;
  }
  needsRehash(hash: string) { return argon2.needsRehash(hash,HASH_OPTIONS); }
}
export const SYNTHETIC_ACCOUNTS = [
  ['admin','ADMIN',true,false],['seller.a','SELLER',true,false],['seller.b','SELLER',true,false],
  ['rider.a','RIDER',true,false],['rider.b','RIDER',true,false],['inactive','RIDER',false,false],['must.change','RIDER',true,true],
] as const;
