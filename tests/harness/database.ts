import '../../scripts/env';
import { Pool,type PoolClient } from 'pg';
import { assertConnectedRole } from '@/server/core/db';
export function runtimePool(role:'app_runtime'|'tracking_runtime'='app_runtime'){
 const url=process.env[role==='app_runtime'?'APP_DATABASE_URL':'TRACKING_DATABASE_URL'];
 if(!url)throw new Error('Initialize the isolated local test profile first.');
 return new Pool({connectionString:url,max:1,connectionTimeoutMillis:3000});
}
export async function checkedClient(pool:Pool,role:'app_runtime'|'tracking_runtime'='app_runtime'):Promise<PoolClient>{const client=await pool.connect();try{await assertConnectedRole(client,role);return client;}catch(error){client.release();throw error;}}
export class Barrier {
 private release!:()=>void;
 private ready=new Promise<void>(resolve=>{this.release=resolve;});
 wait(){return this.ready;}
 open(){this.release();}
}
