import { getSupabaseAuth, isSupabaseAuthConfigured } from '../../../lib/supabase';
import { appOrigin, authRedirect, returnPath, signInError } from '../navigation';

export async function POST(request: Request) {
  const origin = appOrigin(request);
  if (request.headers.get('origin') !== origin) return new Response(null, { status: 403 });
  if (isSupabaseAuthConfigured()) {
    const auth = await getSupabaseAuth();
    const { error } = await auth.auth.signOut({ scope: 'local' });
    if (error) return signInError(origin, 'sign-out');
  }
  const form = await request.formData().catch(() => null);
  const url = new URL('/auth', origin);
  if (form?.has('next')) url.searchParams.set('next', returnPath(form.get('next')));
  return authRedirect(url);
}

