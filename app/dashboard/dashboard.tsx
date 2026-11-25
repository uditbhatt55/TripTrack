'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { tripInsights } from '../../lib/demo';
import type { TripView } from '../../lib/trip-view';
import { Balances } from './balances';
import ExpenseMap from './expense-map';
import { ExpenseForm, ExpenseList, VenueControls } from './expenses';
import { money, type TripAction } from './format';
import ProfilePanel from './profile';

const views = ['Expenses', 'Map', 'Balances', 'Activity'] as const;
type View = typeof views[number];
type InviteNotice = { status: string; link?: string };
const notices: Record<string, string> = {
  sent: 'Invitation email sent. Your friend can use it to sign in and join this trip.',
  unconfigured: 'Email delivery is unavailable. You can copy the invitation link.',
  failed: 'The email provider could not send this invitation. Copy the link or resend the invitation.',
  demo: 'Member added to the local demo. Email invites are available on signed-in shared trips.',
};

export default function Dashboard({ authConfigured, initialTrip }: { authConfigured: boolean; initialTrip: string }) {
  const [trips, setTrips] = useState<TripView[]>([]);
  const [selected, setSelected] = useState(initialTrip);
  const [view, setView] = useState<View>('Expenses');
  const [editing, setEditing] = useState('');
  const [profile, setProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [invite, setInvite] = useState<InviteNotice>();
  const [copied, setCopied] = useState(false);
  const pending = useRef(new Map<string, string>());
  const saving = useRef(false);
  const requestVersion = useRef(0);
  const trip = trips.find(row => row.id === selected) ?? trips[0];

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (saving.current) return;
    const version = ++requestVersion.current;
    try {
      const response = await fetch('/api/trips', { signal, cache: 'no-store' });
      const body = await response.json();
      if (version !== requestVersion.current || signal?.aborted) return;
      if (response.status === 401) {
        setSignedOut(true);
        setReady(true);
        return;
      }
      if (!response.ok) throw new Error(body.error);
      setTrips(body);
      setSignedOut(false);
      setReady(true);
      setError('');
    } catch (failure) {
      if (signal?.aborted || version !== requestVersion.current) return;
      setError(failure instanceof Error ? failure.message : 'Could not load trips.');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!authConfigured || signedOut || !ready) return;
    const reload = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [authConfigured, ready, signedOut, refresh]);

  const submit: TripAction = async fields => {
    if (saving.current) return false;
    saving.current = true;
    ++requestVersion.current;
    setBusy(true);
    setError('');
    if (fields.kind === 'member' || fields.kind === 'invite') {
      setInvite(undefined);
      setCopied(false);
    }
    const data = { tripId: trip?.id, ...fields };
    // Trip creation is independent of the current selection when retried.
    if (fields.kind === 'trip') delete data.tripId;
    const payload = JSON.stringify(data);
    let submissionId = pending.current.get(payload);
    if (!submissionId) {
      submissionId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
      pending.current.set(payload, submissionId);
    }
    const send = (confirmed = false) => fetch('/api/trips', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, confirmed, submissionId }),
    });

    try {
      let response = await send();
      let body = await response.json();
      if (response.status === 409 && body.warning && window.confirm(body.error + ' Save anyway?')) {
        response = await send(true);
        body = await response.json();
      }
      if (!response.ok) {
        if (response.status < 500) pending.current.delete(payload);
        if (response.status === 401) setSignedOut(true);
        throw new Error(body.error);
      }
      pending.current.delete(payload);
      setTrips(body);
      if (fields.kind === 'trip') {
        setSelected(response.headers.get('X-Trip-Id') ?? '');
        setView('Expenses');
        setProfile(false);
      }
      const inviteStatus = response.headers.get('X-Invitation-Status');
      if (inviteStatus) setInvite({ status: inviteStatus, link: response.headers.get('X-Invitation-Link') ?? undefined });
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save.');
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  async function submitForm(event: FormEvent<HTMLFormElement>, kind: string) {
    event.preventDefault();
    const form = event.currentTarget;
    if (await submit({ ...Object.fromEntries(new FormData(form)), kind })) form.reset();
  }

  const signIn = '/auth?next=' + encodeURIComponent('/dashboard' + (initialTrip ? '?trip=' + encodeURIComponent(initialTrip) : ''));
  const insights = trip && tripInsights(trip);
  const name = (id: string) => trip?.members.find(row => row.id === id)?.name ?? 'Member';
  const total = trip?.expenses.reduce((sum, expense) => sum + expense.amount, 0) ?? 0;
  const draft = trip?.expenses.find(expense => expense.id === editing);
  const unresolved = trip?.expenses.filter(expense => expense.venue && expense.lookup && expense.lookup !== 'matched') ?? [];

  return (
    <div className="workspace">
      <header className="workspace-hero">
        <nav aria-label="Dashboard navigation" className="workspace-nav">
          <Link className="brand" href="/">splittrack.</Link>
          <div className="button-row">
            {authConfigured && ready && !signedOut ? (
              <button className="workspace-button glass" type="button" onClick={() => setProfile(value => !value)}>{profile ? 'Back to trips' : 'Payment profile'}</button>
            ) : <Link className="workspace-button glass" href={signIn}>Sign in with Google</Link>}
          </div>
        </nav>
        <div className="workspace-heading">
          <span>{authConfigured ? 'Shared trips' : 'Local demo'}</span>
          <h1>{profile ? 'Payment profile' : trip?.name ?? 'Trip dashboard'}</h1>
          {trip?.city && !profile && <p>{trip.city}</p>}
        </div>
      </header>

      {signedOut ? (
        <main className="workspace-signin workspace-card">
          <h2>Open your shared trips</h2>
          <p>Sign in to see your trips, invite friends, and share expense pins.</p>
          <Link className="workspace-button primary" href={signIn}>Continue with Google</Link>
        </main>
      ) : (
        <main className="workspace-main">
          <aside className="workspace-card workspace-sidebar">
            <h2>Your trips</h2>
            <nav className="workspace-trip-list" aria-label="Trips">
              {trips.map(row => (
                <button type="button" aria-pressed={row.id === trip?.id && !profile} key={row.id} onClick={() => {
                  setSelected(row.id); setProfile(false); setView('Expenses'); setEditing(''); setInvite(undefined); setError('');
                }}>{row.name}</button>
              ))}
            </nav>
            <form className="workspace-form single" id="new-trip" onSubmit={event => void submitForm(event, 'trip')}>
              <label>Trip name<input name="name" maxLength={100} required /></label>
              <label>Destination city<input name="city" maxLength={120} placeholder="Optional" /></label>
              {authConfigured && <label>Your name<input name="yourName" autoComplete="name" maxLength={100} placeholder="Name friends will see" /></label>}
              <button className="workspace-button primary" disabled={!ready || busy}>Create trip</button>
            </form>
            {!authConfigured && <button className="workspace-button secondary" type="button" disabled={!ready || busy}
              onClick={() => void submit({ kind: 'seed' })}>Load five demo trips</button>}
          </aside>

          <article className="workspace-content">
            {error && <div className="workspace-alert" role="alert">{error}
              {!ready && <button type="button" className="workspace-button secondary" onClick={() => void refresh()}>Retry</button>}
            </div>}
            {profile ? <div className="workspace-card profile-card"><ProfilePanel /></div> : trip ? (
              <>
                <section className="workspace-metrics" aria-label="Trip totals">
                  <div><span>Total spent</span><strong>{money(total)}</strong></div>
                  <div><span>Expenses</span><strong>{trip.expenses.length}</strong></div>
                  <div><span>Travelers</span><strong>{trip.members.length}</strong></div>
                </section>

                <section className="workspace-card">
                  <h2>Members</h2>
                  <ul className="member-list">
                    {trip.members.map(member => (
                      <li key={member.id}>
                        <div><strong>{member.name}</strong>{member.email && <small>{member.email}</small>}</div>
                        {trip.canManage && !member.linked && !member.email && (
                          <form className="workspace-inline member-invite" onSubmit={event => {
                            event.preventDefault();
                            const form = event.currentTarget;
                            void submit({ kind: 'invite', memberId: member.id, email: new FormData(form).get('email') });
                          }}>
                            <label>Email for {member.name}<input name="email" type="email" maxLength={254} required /></label>
                            <button className="workspace-button secondary" disabled={busy}>{authConfigured ? 'Send invitation' : 'Save email'}</button>
                          </form>
                        )}
                        {authConfigured && (
                          <div className="button-row"><span className="workspace-tag">{member.linked ? 'Joined' : 'Pending'}</span>
                            {trip.canManage && member.email && !member.linked && (
                              <button className="workspace-button secondary" type="button" disabled={busy}
                                onClick={() => void submit({ kind: 'invite', memberId: member.id })}>Resend invite for {member.name}</button>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  {!trip.members.length && <p>Add the friends sharing this trip.</p>}
                  {trip.canManage && (
                    <form className="workspace-inline" onSubmit={event => void submitForm(event, 'member')}>
                      <label>Member name<input name="name" maxLength={100} required /></label>
                      <label>Member email<input name="email" type="email" maxLength={254} placeholder="Optional" /></label>
                      <button className="workspace-button primary" disabled={busy}>{authConfigured ? 'Add member / send invite' : 'Add member'}</button>
                    </form>
                  )}
                  {trip.canManage && authConfigured && <p>Enter your friend’s Google email to send an invitation.</p>}
                  {invite && (
                    <div className="workspace-notice">
                      <p role="status">{notices[invite.status]}</p>
                      {invite.link && <>
                        <label>Invitation link<input type="text" value={invite.link} readOnly onFocus={event => event.currentTarget.select()} /></label>
                        <button type="button" className="workspace-button secondary" onClick={async () => {
                          try { await navigator.clipboard.writeText(invite.link); setCopied(true); }
                          catch { setCopied(false); }
                        }}>{copied ? 'Link copied' : 'Copy invitation link'}</button>
                      </>}
                    </div>
                  )}
                </section>

                <nav className="workspace-views" aria-label="Trip views">
                  {views.map(item => (
                    <button key={item} type="button" aria-pressed={view === item} onClick={() => { setView(item); setEditing(''); }}>{item}</button>
                  ))}
                  {authConfigured && <button className="refresh-trips" type="button" disabled={busy} onClick={() => void refresh()}>Refresh</button>}
                </nav>

                {view === 'Expenses' && (
                  <>
                    {trip.members.length > 0 && <ExpenseForm key={trip.id + '-' + editing} trip={trip} expense={draft}
                      busy={busy} action={submit} close={draft ? () => setEditing('') : undefined} />}
                    <ExpenseList trip={trip} busy={busy} action={submit} edit={id => {
                      setEditing(id);
                      document.getElementById('expense-editor')?.scrollIntoView({ block: 'start' });
                    }} />
                    {insights?.category && insights.payer && (
                      <section className="workspace-card">
                        <h2>Trip insights</h2>
                        <ul className="ledger-rows">
                          <li><span>Top spending category</span><b>{insights.category[0]} · {money(insights.category[1])}</b></li>
                          <li><span>Most frequent payer</span><b>{name(insights.payer[0])} · {insights.payer[1]} bills</b></li>
                        </ul>
                      </section>
                    )}
                  </>
                )}
                {view === 'Map' && (
                  <section className="workspace-card">
                    <h2>Expense map</h2>
                    <ExpenseMap expenses={trip.expenses} members={trip.members} />
                    {unresolved.length > 0 && (
                      <ul className="ledger-rows map-unresolved">
                        {unresolved.map(expense => <li key={expense.id}>
                          <span>{expense.title} · {expense.venue}</span>
                          {expense.canEdit && <VenueControls expense={expense} busy={busy} action={submit} />}
                        </li>)}
                      </ul>
                    )}
                  </section>
                )}
                {view === 'Balances' && <Balances key={trip.id} trip={trip} busy={busy} action={submit} />}
                {view === 'Activity' && (
                  <section className="workspace-card">
                    <h2>Trip activity</h2>
                    {trip.activity.length ? <ol className="ledger-rows">{trip.activity.map(item => (
                      <li key={item.id}><span>{item.text}</span><time dateTime={item.date}>{new Date(item.date).toLocaleDateString('en-IN')}</time></li>
                    ))}</ol> : <p>New expenses, updates and payments will appear here.</p>}
                  </section>
                )}
              </>
            ) : (
              <section className="workspace-card">
                <h2>{ready ? 'Split your next trip' : 'Loading trips'}</h2>
                {ready && <p>Create a trip to start adding friends and expenses.</p>}
              </section>
            )}
          </article>
        </main>
      )}
    </div>
  );
}

