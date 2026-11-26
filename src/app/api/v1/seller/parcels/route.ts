import { createParcelReadHandlers } from '@/server/modules/parcels/read-handlers';

export const runtime = 'nodejs';
export const GET = createParcelReadHandlers().list;
