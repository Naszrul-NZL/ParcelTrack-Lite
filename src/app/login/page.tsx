import { SignInPreview } from '@/features/preview/sign-in-preview';
export const dynamic='force-dynamic';
export default async function Login({ searchParams }: { searchParams: Promise<{ workspace?: string | string[] }> }) {
  const params = await searchParams;
  const workspace = params.workspace === 'rider' || params.workspace === 'admin' ? params.workspace : 'seller';
  return <div className="page-width login-page"><SignInPreview initialWorkspace={workspace} /></div>;
}
