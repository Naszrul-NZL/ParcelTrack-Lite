import { createRiderHandlers } from '@/server/modules/delivery/rider-handlers';

export const runtime = 'nodejs';
export const GET = createRiderHandlers().list;
