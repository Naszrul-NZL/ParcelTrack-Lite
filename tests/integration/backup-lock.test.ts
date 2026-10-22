import { it,expect } from 'vitest';
import { Client } from 'pg';
import { runtimePool } from '../harness/database';
import { transaction } from '@/server/core/db';
import { BACKUP_LOCK_KEY } from '@/shared/constants';
it('M3-PH1-TC06 drains shared writers before exclusive backup and rejects maintenance writes',async()=>{
 const writerA=new Client({connectionString:process.env.APP_DATABASE_URL});
 const writerB=new Client({connectionString:process.env.APP_DATABASE_URL});
 const backup=new Client({connectionString:process.env.BACKUP_DATABASE_URL});
 const operator=new Client({connectionString:process.env.MIGRATION_DATABASE_URL});
 const pool=runtimePool();
 await Promise.all([writerA.connect(),writerB.connect(),backup.connect(),operator.connect()]);
 try {
  for(const writer of [writerA,writerB]){await writer.query('BEGIN');await writer.query('SELECT pg_advisory_xact_lock_shared($1::bigint)',[BACKUP_LOCK_KEY]);}
  const canLock=async()=>(await backup.query<{locked:boolean}>('SELECT pg_try_advisory_lock($1::bigint) AS locked',[BACKUP_LOCK_KEY])).rows[0].locked;
  expect(await canLock()).toBe(false);
  await writerA.query('COMMIT');expect(await canLock()).toBe(false);
  const pid=(await backup.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const waiting=backup.query('SELECT pg_advisory_lock($1::bigint)',[BACKUP_LOCK_KEY]);
  let queued=false;const deadline=Date.now()+3000;
  while(!queued && Date.now()<deadline)queued=!!(await operator.query('SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted',[pid])).rowCount;
  expect(queued).toBe(true);
  await operator.query('BEGIN');await operator.query('SET LOCAL ROLE ops_fn_owner');await operator.query("UPDATE app.system_state SET maintenance_mode=true,set_until=now()+interval '1 minute' WHERE id=1");await operator.query('COMMIT');
  await expect(transaction(pool,{write:true},async()=>{throw new Error('Writer must not run');})).rejects.toMatchObject({code:'MAINTENANCE'});
  expect(await transaction(pool,{},async c=>(await c.query('SELECT 1 AS value')).rows[0].value)).toBe(1);
  await writerB.query('COMMIT');await waiting;
 } finally {
  await Promise.all([writerA.query('ROLLBACK'),writerB.query('ROLLBACK')]);
  await backup.query('SELECT pg_advisory_unlock_all()');
  await operator.query('BEGIN');await operator.query('SET LOCAL ROLE ops_fn_owner');await operator.query('UPDATE app.system_state SET maintenance_mode=false,set_until=NULL WHERE id=1');await operator.query('COMMIT');
  await Promise.all([writerA.end(),writerB.end(),backup.end(),operator.end(),pool.end()]);
 }
});
