import { getSupabaseAuth, isSupabaseAuthConfigured } from '../../../lib/supabase';
import { appOrigin, authRedirect, returnPath, signInError } from '../navigation';

export async function GET(request: Request) {
  const origin = appOrigin(request);
  const { searchParams } = new URL(request.url);
  const next = returnPath(searchParams.get('next'));
  const code = searchParams.get('code');
  if (!code || !isSupabaseAuthConfigured()) return signInError(origin, 'callback', next);
  const auth = await getSupabaseAuth();
  const { error } = await auth.auth.exchangeCodeForSession(code);
  if (error) return signInError(origin, 'callback', next);
  return authRedirect(new URL(next, origin));
}
