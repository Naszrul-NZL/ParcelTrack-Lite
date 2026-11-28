import type { PoolClient } from 'pg';
import { expect, it, vi } from 'vitest';
import { CommitUncertainError, transaction } from '@/server/core/db';

it('preserves commit uncertainty so published proof cleanup cannot delete a possibly committed object', async () => {
  const release = vi.fn();
  const query = vi.fn(async (sql: string) => {
    if (sql === 'COMMIT') throw new Error('connection lost after commit was sent');
    return { rows: [], rowCount: 0 };
  });
  const client = { query, release } as unknown as PoolClient;
  const pool = { connect: async () => client };
  await expect(transaction(pool, {}, async () => 'prepared')).rejects.toBeInstanceOf(CommitUncertainError);
  expect(query.mock.calls.map(call => call[0])).toEqual([
    'BEGIN', "SELECT set_config('app.user_id', $1, true), set_config('app.session_version', $2, true)",
    'COMMIT', 'ROLLBACK',
  ]);
  expect(release).toHaveBeenCalledWith(false);
});
