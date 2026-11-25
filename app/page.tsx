'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { categories, tripInsights } from '../lib/demo';
import { explain, summarize, type Trip } from '../lib/ledger';

const currency = new Intl.NumberFormat('en-IN', {style: 'currency', currency: 'INR'});
const money = (value: number) => currency.format(value / 100);

function paise(value: FormDataEntryValue | null) {
  const input = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(input)) return 0;
  const [rupees, fraction = ''] = input.split('.');
  return Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
}

export default function Home() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    fetch('/api/trips').then(async response => {
      const body = await response.json();
      if (!response.ok) throw Error(body.error);
      setTrips(body);
      setReady(true);
    }).catch(() => setError('Could not load the local demo.'));
  }, []);
  const trip = trips.find(row => row.id === selected) ?? trips[0];
  const summary = trip && summarize(trip);
  const insights = trip && tripInsights(trip);
  const name = (id: string) => trip?.members.find(row => row.id === id)?.name ?? '';
  async function submit(event: FormEvent<HTMLFormElement>, kind: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const data = {...Object.fromEntries(values), kind, tripId: trip?.id, amount: paise(values.get('amount')), participants: values.getAll('participants')};
    const send = (confirmed = false) => fetch('/api/trips', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...data, confirmed}),
    });
    setBusy(true);
    setError('');
    try {
      let response = await send();
      let body = await response.json();
      if (response.status === 409 && body.warning && window.confirm(body.error + ' Save anyway?')) {
        response = await send(true);
        body = await response.json();
      }
      if (!response.ok) throw Error(body.error);
      setTrips(body);
      if (kind === 'trip') setSelected(body.at(-1).id);
      form.reset();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }
  return <>
    <header><b>Splittrack</b><span>Local demo</span></header>
    <main>
      <aside>
        <h2>Trips</h2>
        <nav>{trips.map(row => <button key={row.id} className={trip?.id === row.id ? 'active' : ''} onClick={() => setSelected(row.id)}>{row.name}</button>)}</nav>
        <form onSubmit={event => submit(event, 'trip')}><label>Trip name<input name="name" required maxLength={100}/></label><button disabled={!ready || busy}>Create trip</button></form>
        <form className="seed-form" onSubmit={event => submit(event, 'seed')}><button disabled={!ready || busy}>Load five demo trips</button></form>
      </aside>
      <article>
        {error && <p role="alert" className="error">{error}</p>}
        {trip && summary ? <>
          <h1>{trip.name}</h1>
          <section><h2>Members</h2><p>{trip.members.map(member => member.name).join(' · ') || 'Add the friends sharing this trip.'}</p>
            <form onSubmit={event => submit(event, 'member')}><label>Member name<input name="name" required maxLength={100}/></label><button disabled={busy}>Add member</button></form>
          </section>
          {trip.members.length > 0 && <div className="columns">
            <section key={trip.id}><h2>Add expense</h2>
              <form onSubmit={event => submit(event, 'expense')}>
                <label>Description<input name="name" required maxLength={100}/></label>
                <label>Amount (₹)<input name="amount" inputMode="decimal" required/></label>
                <label>Category<select name="category">{categories.map(category => <option key={category}>{category}</option>)}</select></label>
                <label>Date<input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required/></label>
                <label>Venue<input name="venue" maxLength={150}/></label>
                <label>Paid by<select name="payer">{trip.members.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
                <fieldset><legend>Split equally among</legend>{trip.members.map(member => <label className="check" key={member.id}><input type="checkbox" name="participants" value={member.id} defaultChecked/>{member.name}</label>)}</fieldset>
                <button disabled={busy}>Save expense</button>
              </form>
            </section>
            <section><h2>Balances</h2>{summary.balances.map(row => <details key={row.id}>
              <summary>{row.name} <b>{row.amount === 0 ? 'Settled' : row.amount < 0 ? 'Owes ' + money(-row.amount) : 'Receives ' + money(row.amount)}</b></summary>
              <ul>{explain(trip, row.id).filter(line => line.amount !== 0).map((line, index) => <li key={index}>{line.label} <b>{money(line.amount)}</b></li>)}</ul>
            </details>)}
              <h3>{summary.exact ? 'Minimum payments' : 'Suggested payments'}</h3>
              {summary.suggestions.length ? <ul>{summary.suggestions.map((item, index) => <li key={index}>{name(item.from)} pays {name(item.to)} <b>{money(item.amount)}</b></li>)}</ul> : <p>Everyone is settled.</p>}
            </section>
          </div>}
          {trip.members.length >= 2 && <section key={'payment-' + trip.id}><h2>Record an external payment</h2>
            <form onSubmit={event => submit(event, 'payment')}>
              <label>From<select name="from">{trip.members.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
              <label>To<select name="to" defaultValue={trip.members[1].id}>{trip.members.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
              <label>Amount (₹)<input name="amount" inputMode="decimal" required/></label>
              <button disabled={busy}>Record payment</button>
            </form>
          </section>}
          {insights?.category && insights.payer && <section><h2>Trip insights</h2>
            <p>Top spending category <b>{insights.category[0]} · {money(insights.category[1])}</b></p>
            <p>Most frequent payer <b>{name(insights.payer[0])} · {insights.payer[1]} bills</b></p>
          </section>}
          <section><h2>Expenses</h2>{trip.expenses.length ? <ul>{trip.expenses.map(row => <li key={row.id}>{row.title}{row.venue && ' · ' + row.venue} · {name(row.payer)} paid <b>{money(row.amount)}</b></li>)}</ul> : <p>No expenses yet.</p>}</section>
        </> : <section><h1>Split your next trip</h1><p>Create a trip to start adding friends and expenses.</p></section>}
      </article>
    </main>
  </>;
}
