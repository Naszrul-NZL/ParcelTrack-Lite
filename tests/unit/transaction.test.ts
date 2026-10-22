import { it,expect,vi } from 'vitest';
import type { Pool } from 'pg';
import { transaction } from '@/server/core/db';
it('M2-PH1-TC04 commits before success and releases the same connection',async()=>{
 const statements:string[]=[];const client={query:vi.fn(async(sql:string)=>{statements.push(sql);return{rows:[]};}),release:vi.fn()};
 const pool={connect:vi.fn(async()=>client)} as unknown as Pick<Pool,'connect'>;
 expect(await transaction(pool,{actor:{userId:'1',sessionVersion:2}},async c=>{expect(c).toBe(client);await c.query('SELECT protected');return 'done';})).toBe('done');
 expect(statements.at(-1)).toBe('COMMIT');expect(client.release).toHaveBeenCalledOnce();expect(client.query).toHaveBeenNthCalledWith(2,expect.stringContaining('set_config'),['1','2']);
});
it('M2-PH1-TC04 rolls back and destroys unusable connections',async()=>{
 const client={query:vi.fn(async(sql:string)=>{if(sql==='ROLLBACK')throw new Error('connection lost');return{rows:[]};}),release:vi.fn()};
 const pool={connect:vi.fn(async()=>client)} as unknown as Pick<Pool,'connect'>;
 await expect(transaction(pool,{},async()=>{throw new Error('failure');})).rejects.toMatchObject({code:'INTERNAL_ERROR'});expect(client.release).toHaveBeenCalledWith(true);
});
