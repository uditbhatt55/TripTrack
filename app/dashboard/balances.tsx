'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { TripView } from '../../lib/trip-view';
import { money, paise, type TripAction } from './format';

type Settlement = { from: string; to: string; amount: number };
type Details = { upiId: string | null; qrUrl: string | null; qrExpiresIn?: number | null };
const demoPayment = { upiId: 'splittrack-demo@demo', qrUrl: '/splittrack-demo-qr.svg' };

function RecipientDetails({ trip, item, close }: { trip: TripView; item: Settlement; close: () => void }) {
  const [details, setDetails] = useState<Details>();
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (trip.demo) return;
    const controller = new AbortController();
    let refresh: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const query = new URLSearchParams({ tripId: trip.id, recipientMemberId: item.to });
        const response = await fetch('/api/profile?' + query, { signal: controller.signal });
        const body: Details & { error?: string } = await response.json();
        if (!response.ok) throw new Error(body.error);
        setDetails(body);
        if (body.qrExpiresIn) refresh = setTimeout(load, Math.max(5, body.qrExpiresIn - 10) * 1000);
      } catch (failure) {
        if (controller.signal.aborted) return;
        setDetails(undefined);
        setError(failure instanceof Error ? failure.message : 'Could not load payment details.');
      }
    }
    void load();
    return () => { controller.abort(); clearTimeout(refresh); };
  }, [trip.id, trip.demo, item.to]);
  const values = trip.demo ? demoPayment : details;
  return (
    <div className="payment-details">
      <h3>Pay {trip.members.find(member => member.id === item.to)?.name} {money(item.amount)}</h3>
      <p>{trip.demo ? 'Fictional payment details for the demo.' : 'Use your own UPI app, then record the payment below.'}</p>
      {error && <p role="status">{error}</p>}
      {!values && !error && <p>Loading payment details…</p>}
      {values && !values.upiId && !values.qrUrl && <p>This member has not shared UPI details.</p>}
      {values?.upiId && <p className="button-row"><code>{values.upiId}</code>
        {typeof navigator !== 'undefined' && navigator.clipboard && (
          <button className="workspace-button secondary" type="button" onClick={async () => {
            try { await navigator.clipboard.writeText(values.upiId); setCopied(true); }
            catch { setError('Select and copy the UPI ID shown above.'); }
          }}>{copied ? 'Copied' : 'Copy UPI ID'}</button>
        )}
      </p>}
      {values?.qrUrl && <img className="payment-qr" src={values.qrUrl} alt={trip.demo ? 'Fictional example QR' : 'Recipient’s uploaded UPI QR'} width={176} height={176} referrerPolicy="no-referrer" />}
      <button className="workspace-button secondary" type="button" onClick={close}>Close payment details</button>
    </div>
  );
}

export function Balances({ trip, busy, action }: { trip: TripView; busy: boolean; action: TripAction }) {
  const [recipient, setRecipient] = useState<Settlement | null>(null);
  const name = (id: string) => trip.members.find(row => row.id === id)?.name ?? 'Member';
  const allowedSenders = trip.canManage ? trip.members : trip.members.filter(member => member.id === trip.myMemberId);
  const fromDefault = trip.myMemberId ?? allowedSenders[0]?.id;
  const toDefault = trip.members.find(member => member.id !== fromDefault)?.id;

  async function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (await action({ kind: 'payment', from: data.get('from'), to: data.get('to'), amount: paise(data.get('amount')) })) {
      form.reset();
      setRecipient(null);
    }
  }

  return (
    <div className="workspace-stack">
      <section className="workspace-card">
        <h2>Explain my balance</h2>
        {!trip.members.length && <p>Add members to see their balances here.</p>}
        {trip.summary.balances.map(row => (
          <details className="workspace-detail" key={row.id}>
            <summary><strong>{row.name}</strong><strong className={row.amount < 0 ? 'balance-due' : 'balance-good'}>
              {row.amount === 0 ? 'Settled' : (row.amount < 0 ? 'Owes ' : 'Receives ') + money(Math.abs(row.amount))}
            </strong></summary>
            <ul className="ledger-rows">
              {trip.explanations[row.id]?.map((line, index) => <li key={index}><span>{line.label}</span><b>{money(line.amount)}</b></li>)}
            </ul>
          </details>
        ))}
      </section>
      <section className="workspace-card">
        <h2>{trip.summary.exact ? 'Minimum payments' : 'Suggested payments'}</h2>
        {trip.summary.suggestions.length ? (
          <ul className="ledger-rows settlement-rows">
            {trip.summary.suggestions.map(item => (
              <li key={item.from + '-' + item.to}>
                <span>{name(item.from)} pays {name(item.to)} <strong>{money(item.amount)}</strong></span>
                <button className="workspace-button secondary" type="button" onClick={() => setRecipient(item)}>Payment details for {name(item.to)}</button>
              </li>
            ))}
          </ul>
        ) : <p>Everyone is settled.</p>}
        {recipient && <RecipientDetails key={recipient.from + '-' + recipient.to} trip={trip} item={recipient} close={() => setRecipient(null)} />}
      </section>
      {allowedSenders.length > 0 && trip.members.length >= 2 && (
        <section className="workspace-card">
          <h2>Record an external payment</h2>
          <form className="workspace-form" onSubmit={record}>
            <label>From<select name="from" defaultValue={fromDefault}>{allowedSenders.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
            <label>To<select name="to" defaultValue={toDefault}>{trip.members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
            <label>Amount (₹)<input name="amount" inputMode="decimal" required /></label>
            <div className="field-wide"><button className="workspace-button primary" disabled={busy}>Record payment</button></div>
          </form>
        </section>
      )}
    </div>
  );
}
