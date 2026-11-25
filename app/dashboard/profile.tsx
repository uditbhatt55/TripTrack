'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

type PaymentProfile = { upiId: string | null; qrUrl: string | null };

async function loadProfile(signal?: AbortSignal): Promise<PaymentProfile | null> {
  const response = await fetch('/api/profile', { cache: 'no-store', signal });
  if (response.status === 401) return null;
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body;
}

export default function ProfilePanel() {
  const [profile, setProfile] = useState<PaymentProfile | null>();
  const [upiId, setUpiId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    loadProfile(controller.signal).then((value) => {
      setProfile(value);
      setUpiId(value?.upiId ?? '');
    }).catch(() => {
      if (!controller.signal.aborted) setError('Could not load your payment profile.');
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function refresh() {
    setBusy(true);
    setError('');
    try {
      const value = await loadProfile();
      setProfile(value);
      setUpiId(value?.upiId ?? '');
    } catch {
      setError('Could not refresh your payment profile.');
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    setError('');
    const form = event.currentTarget;
    const body = new FormData();
    body.set('upiId', upiId);
    body.set('qrAction', file ? 'replace' : remove ? 'remove' : 'keep');
    if (file) body.set('qr', file);
    try {
      const response = await fetch('/api/profile', { method: 'PUT', body });
      if (response.status === 401) {
        setProfile(null);
        return;
      }
      if (!response.ok) throw new Error((await response.json()).error);
      form.reset();
      setFile(null);
      setRemove(false);
      setStatus('Payment profile saved.');
      try {
        setProfile(await loadProfile());
      } catch {
        setError('Could not refresh the saved QR. Use Refresh profile to retry.');
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Payment profile">
      <h2>Payment profile</h2>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {profile === undefined && (error
        ? <button type="button" disabled={busy} onClick={refresh}>Retry</button>
        : <p role="status">Loading profile…</p>)}
      {profile === null && <p><Link href="/auth">Sign in with Google</Link> to manage your UPI details.</p>}
      {profile && (
        <>
          <form onSubmit={save}>
            <fieldset disabled={busy}>
              <label>
                UPI ID
                <input value={upiId} onChange={(event) => setUpiId(event.target.value)}
                  placeholder="name@provider" maxLength={254} autoComplete="off" />
              </label>
              <label>
                Upload UPI QR (PNG or JPEG, up to 2 MB)
                <input type="file" accept="image/png,image/jpeg" onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  if (selected && (selected.size > 2 * 1024 * 1024 ||
                      !['image/png', 'image/jpeg'].includes(selected.type))) {
                    event.target.value = '';
                    setFile(null);
                    setError('Choose a PNG or JPEG image up to 2 MB.');
                    return;
                  }
                  setError('');
                  setFile(selected);
                  if (selected) setRemove(false);
                }} />
              </label>
              {(preview || (!remove && profile.qrUrl)) && (
                <p><img src={preview || profile.qrUrl || undefined} alt="UPI payment QR preview"
                  width={200} style={{ height: 'auto', maxWidth: '100%' }} referrerPolicy="no-referrer" /></p>
              )}
              {profile.qrUrl && (
                <label>
                  <input type="checkbox" checked={remove} disabled={Boolean(file)}
                    onChange={(event) => setRemove(event.target.checked)} />
                  Remove saved QR
                </label>
              )}
              <button type="submit">{busy ? 'Working…' : 'Save profile'}</button>{' '}
              <button type="button" onClick={refresh}>Refresh profile</button>
            </fieldset>
          </form>
          <form action="/auth/sign-out" method="post">
            <button type="submit">Sign out</button>
          </form>
        </>
      )}
    </section>
  );
}
