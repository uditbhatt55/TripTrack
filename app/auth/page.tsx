import Link from 'next/link';
import { isSupabaseAuthConfigured } from '../../lib/supabase';
import { returnPath } from './navigation';

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const configured = isSupabaseAuthConfigured();
  return (
    <main className="account-page">
      <div className="account-card">
        <Link className="brand" href="/">splittrack.</Link>
        <h1>Sign in to Splittrack</h1>
        {error && <p role="alert">Could not complete sign-in or sign-out. Please try again.</p>}
        {configured ? (
          <>
            <p>Use Google to open your shared trips or accept an email invitation.</p>
            <form action="/auth/sign-in" method="post">
              <input type="hidden" name="next" value={returnPath(next)} />
              <button className="workspace-button primary" type="submit">Continue with Google</button>
            </form>
          </>
        ) : (
          <p>This server is running the local demo. Google sign-in is available after Supabase is configured.</p>
        )}
        <p><Link href="/dashboard">Back to dashboard</Link></p>
      </div>
    </main>
  );
}
