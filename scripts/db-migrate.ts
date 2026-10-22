import './env';
import { runner } from 'node-pg-migrate';
import { required } from './env';
await runner({databaseUrl:required('MIGRATION_DATABASE_URL'),dir:'db/migrations',direction:'up',migrationsTable:'schema_migrations',schema:'app',createSchema:false,checkOrder:true,singleTransaction:true,log:()=>{}});
console.log('Application migrations applied.');
