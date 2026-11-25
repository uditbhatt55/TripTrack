import Link from 'next/link';
import { getViewer } from '../../lib/supabase';
import { AcceptInvitation } from './accept-invitation';

export const metadata = { title: 'Trip invitation | Splittrack', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function InvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = typeof token === 'string' && /^[\w-]{43}$/.test(token);
  const viewer = valid ? await getViewer() : null;
  const next = valid ? '/invite?token=' + encodeURIComponent(token) : '/dashboard';
  return (
    <main className="account-page">
      <div className="account-card">
        <Link className="brand" href="/">splittrack.</Link>
        <h1>Join your trip</h1>
        {!valid ? <p>This invitation link is incomplete.</p> : viewer ? (
          <>
            <p>Signed in as <strong>{viewer.email ?? 'an unverified account'}</strong>. Use the Google account that received the invitation.</p>
            <AcceptInvitation token={token} />
            <form action="/auth/sign-out" method="post">
              <input type="hidden" name="next" value={next} />
              <button className="workspace-button secondary" type="submit">Use another Google account</button>
            </form>
          </>
        ) : (
          <>
            <p>Continue with the Google account that received the invitation.</p>
            <Link className="workspace-button primary" href={'/auth?next=' + encodeURIComponent(next)}>Continue with Google</Link>
          </>
        )}
      </div>
    </main>
  );
}

