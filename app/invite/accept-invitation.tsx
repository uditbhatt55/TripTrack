'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function accept() {
    setBusy(true);
    setError('');
    try {
      const result = await fetch('/api/trips', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'accept-invite', token }),
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error);
      router.replace('/dashboard?trip=' + encodeURIComponent(body.tripId));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not join the trip.');
      setBusy(false);
    }
  }
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <button type="button" className="workspace-button primary" disabled={busy} onClick={accept}>{busy ? 'Joining…' : 'Accept invitation'}</button>
    </>
  );
}
