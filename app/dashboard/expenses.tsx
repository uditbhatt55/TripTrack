'use client';

import { useState, type FormEvent } from 'react';
import { categories } from '../../lib/demo';
import type { TripView } from '../../lib/trip-view';
import { money, paise, type ExpenseView, type TripAction } from './format';

type FormProps = { trip: TripView; expense?: ExpenseView; busy: boolean; action: TripAction; close?: () => void };

export function ExpenseForm({ trip, expense, busy, action, close }: FormProps) {
  const [payer, setPayer] = useState(expense?.payer ?? trip.myMemberId ?? trip.members[0]?.id ?? '');
  const participantIds = expense ? Object.keys(expense.originalShares ?? expense.shares) : trip.members.map(member => member.id);
  const title = expense ? 'Edit expense' : 'Add expense';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const saved = await action({
      ...Object.fromEntries(fields),
      kind: expense ? 'edit-expense' : 'expense',
      expenseId: expense?.id,
      amount: paise(fields.get('amount')),
      participants: fields.getAll('participants'),
      sponsored: fields.getAll('sponsored').filter(Boolean),
    });
    if (saved) {
      if (close) close();
      else {
        form.reset();
        setPayer(trip.myMemberId ?? trip.members[0]?.id ?? '');
      }
    }
  }

  return (
    <section className="workspace-card" id="expense-editor">
      <h2>{title}</h2>
      {expense?.financialLocked && <p>Amount, payer and shares are fixed for this expense. You can still update its description and venue.</p>}
      <form className="workspace-form" onSubmit={submit}>
        <label className="field-wide">Description<input name="name" maxLength={100} defaultValue={expense?.title} required /></label>
        <label>Amount (₹)<input name="amount" inputMode="decimal" defaultValue={expense ? (expense.amount / 100).toFixed(2) : ''} required /></label>
        <label>Category<select name="category" defaultValue={expense?.category ?? categories[0]}>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
        <label>Date<input name="date" type="date" defaultValue={expense?.date ?? new Date().toISOString().slice(0, 10)} required /></label>
        <label>Paid by<select name="payer" value={payer} onChange={event => setPayer(event.currentTarget.value)}>
          {trip.members.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}
        </select></label>
        <label>Venue or address<input name="venue" maxLength={150} defaultValue={expense?.venue} placeholder="Optional" /></label>
        <label>City<input name="city" maxLength={120} defaultValue={expense?.city ?? trip.city} placeholder="Optional" /></label>
        <fieldset className="field-wide participant-options">
          <legend>Split equally among</legend>
          {trip.members.map(member => (
            <label className="workspace-check" key={member.id}><input type="checkbox" name="participants" value={member.id} defaultChecked={participantIds.includes(member.id)} />{member.name}</label>
          ))}
        </fieldset>
        <label className="field-wide">Sponsor a friend
          <select name="sponsored" defaultValue={expense?.sponsored?.[0] ?? ''}>
            <option value="">No sponsorship</option>
            {trip.members.filter(member => member.id !== payer).map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
          <small>The payer covers this participant’s share.</small>
        </label>
        <div className="field-wide button-row">
          <button className="workspace-button primary" disabled={busy}>{expense ? 'Save changes' : 'Save expense'}</button>
          {close && <button className="workspace-button secondary" type="button" onClick={close}>Cancel edit</button>}
        </div>
      </form>
    </section>
  );
}

export function VenueControls({ expense, busy, action }: { expense: ExpenseView; busy: boolean; action: TripAction }) {
  const payload = { expenseId: expense.id, version: expense.lookupVersion };
  if (expense.lookup === 'matched') return <small>Pinned at {expense.place?.label}</small>;
  if (expense.lookup === 'choose' && expense.candidates) {
    return (
      <form className="workspace-inline" onSubmit={event => {
        event.preventDefault();
        const candidate = Number(new FormData(event.currentTarget).get('branch'));
        void action({ kind: 'choose-location', ...payload, candidate });
      }}>
        <label>Choose a venue match<select name="branch">{expense.candidates.map((option, index) => <option key={index} value={index}>{option.label}</option>)}</select></label>
        <button className="workspace-button secondary" disabled={busy}>Place pin</button>
      </form>
    );
  }
  if (!expense.canEdit || !expense.venue || !expense.lookup) return null;
  return (
    <div className="button-row">
      <small>{expense.lookup === 'pending' ? 'Looking up this venue.' : 'No map pin found.'}</small>
      <button className="workspace-button secondary" type="button" disabled={busy}
        onClick={() => void action({ kind: 'retry-location', ...payload })}>Retry venue lookup</button>
    </div>
  );
}

export function ExpenseList({ trip, busy, action, edit }: { trip: TripView; busy: boolean; action: TripAction; edit: (id: string) => void }) {
  const name = (id: string) => trip.members.find(member => member.id === id)?.name ?? 'Member';
  return (
    <section className="workspace-card">
      <h2>Expenses</h2>
      {!trip.expenses.length && <p>No expenses yet.</p>}
      {trip.expenses.slice().reverse().map(expense => (
        <details className="workspace-detail" key={expense.id}>
          <summary>
            <div><strong>{expense.title}</strong><small>{name(expense.payer)} paid{expense.venue ? ' · ' + expense.venue : ''}</small></div>
            <strong>{money(expense.amount)}</strong>
          </summary>
          <div className="expense-detail">
            <p>{[expense.category, expense.date, expense.city, expense.creatorName && 'Added by ' + expense.creatorName].filter(Boolean).join(' · ')}</p>
            <ul className="ledger-rows">{Object.entries(expense.shares).map(([id, amount]) => (
              <li key={id}><span>{name(id)}{expense.sponsored?.includes(id) && ' · Sponsored'}{expense.waived.includes(id) && ' · Waived'}</span>
                <strong>{money(expense.waived.includes(id) ? 0 : amount)}</strong></li>
            ))}</ul>
            {expense.canEdit && <VenueControls expense={expense} busy={busy} action={action} />}
            {expense.canEdit && <button className="workspace-button secondary" type="button" onClick={() => edit(expense.id)}>Edit expense</button>}
            {expense.waiverOptions.length > 0 && (
              <form className="workspace-inline" onSubmit={event => {
                event.preventDefault();
                const memberId = new FormData(event.currentTarget).get('memberId');
                if (window.confirm('Waive the selected member’s entire share for this expense?')) {
                  void action({ kind: 'waive', expenseId: expense.id, memberId });
                }
              }}>
                <label>Waive share for<select name="memberId">
                  {expense.waiverOptions.map(id => <option key={id} value={id}>{name(id)}</option>)}
                </select></label>
                <button className="workspace-button secondary" disabled={busy}>Waive share</button>
              </form>
            )}
          </div>
        </details>
      ))}
    </section>
  );
}


