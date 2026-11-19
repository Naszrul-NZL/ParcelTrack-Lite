import { createRegistrationHandler } from '@/server/modules/parcels/register-handler';

export const runtime = 'nodejs';
export const POST = createRegistrationHandler();
