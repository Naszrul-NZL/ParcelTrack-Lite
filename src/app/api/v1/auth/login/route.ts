import { apiHandler } from '@/server/core/handler';
import { authService } from '@/server/modules/auth/service';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const POST = apiHandler((request, context) => authService().login(request, context));
