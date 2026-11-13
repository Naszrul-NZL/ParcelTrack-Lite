import { apiHandler } from '@/server/core/handler';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET = apiHandler(() => Response.json({status:'ok'}));
