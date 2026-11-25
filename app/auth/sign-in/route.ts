import { getSupabaseAuth, isSupabaseAuthConfigured } from '../../../lib/supabase';
import { appOrigin, authRedirect, returnPath, signInError } from '../navigation';

export async function POST(request: Request) {
  const origin = appOrigin(request);
  if (request.headers.get('origin') !== origin) return new Response(null, { status: 403 });
  if (!isSupabaseAuthConfigured()) return signInError(origin, 'unavailable');
  const form = await request.formData().catch(() => null);
  const next = returnPath(String(form?.get('next') ?? ''));
  const callback = new URL('/auth/callback', origin);
  callback.searchParams.set('next', next);
  const auth = await getSupabaseAuth();
  const { data, error } = await auth.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callback.href, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data.url) return signInError(origin, 'sign-in', next);
  return authRedirect(data.url);
}

