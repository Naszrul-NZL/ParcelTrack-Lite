if(process.env.PTL_PROFILE!=='test')throw new Error('Integration tests require PTL_PROFILE=test and an isolated full Supabase project.');
await import('../../scripts/env');
if(process.env.APP_ENV!=='test')throw new Error('Integration tests refuse non-test application settings.');
export {};
