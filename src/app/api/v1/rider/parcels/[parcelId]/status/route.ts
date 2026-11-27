import { createRiderHandlers } from '@/server/modules/delivery/rider-handlers';

export const runtime = 'nodejs';
export const POST = createRiderHandlers().updateStatus;
