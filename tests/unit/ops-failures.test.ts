import { expect, it } from 'vitest';
import { PasswordService } from '@/server/modules/auth/password';
import { describeFailure } from '../../scripts/ops-commands';

it('says the password was refused, not the database', () => {
  const passwords = new PasswordService(1);
  for (const value of ['password123', 'x'.repeat(129)]) {
    let failure: unknown;
    try { void passwords.hash(value); } catch (error) { failure = error; }
    expect(describeFailure(failure)).toBe('That password is too long or too common. Choose another.');
  }
});
