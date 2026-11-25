'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { explain, split, summarize, type Trip } from '../lib/ledger';

const members = ['Dev', 'Isha', 'Kabir', 'Mira'].map(name => ({ id: name.toLowerCase(), name }));
const allMembers = members.map(({ id }) => id);
const bills = [
  { id: 'hotel', title: 'Hotel', amount: 640_000, participants: allMembers },
  { id: 'dinner', title: 'Dinner', amount: 120_000, participants: ['isha', 'kabir'] },
  { id: 'cab', title: 'Cab', amount: 240_000, participants: allMembers },
];
const demo: Trip = {
  id: 'mountain-escape',
  name: 'Mountain escape',
  members,
  expenses: bills.map(({ id, title, amount, participants }) => ({ id, title, amount, payer: 'dev', shares: split(amount, participants) })),
  payments: [],
};
const total = demo.expenses.reduce((sum, expense) => sum + expense.amount, 0);
const shares = explain(demo, 'isha');
const maximumRepayment = -shares.reduce((sum, { amount }) => sum + amount, 0);
const tabs = [
  { id: 'expenses', title: 'Expenses' },
  { id: 'balance', title: 'My balance' },
  { id: 'settlement', title: 'Settle up' },
] as const;

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const rupees = (paise: number) => currency.format(paise / 100);

export function TripPreview({ dashboardLink }: { dashboardLink: ReactNode }) {
  const [active, setActive] = useState(0);
  const [repayment, setRepayment] = useState(40_000);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const { suggestions } = summarize({
    ...demo,
    payments: repayment ? [{ from: 'isha', to: 'dev', amount: repayment }] : [],
  });

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const positions: Record<string, number> = {
      ArrowLeft: (index + tabs.length - 1) % tabs.length,
      ArrowRight: (index + 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    const next = positions[event.key];
    if (typeof next !== 'number') return;
    event.preventDefault();
    setActive(next);
    buttons.current[next]?.focus();
  }

  return (
    <div className="landing-section preview-layout">
      <div>
        <h2>See the difference<br />in every rupee.</h2>
        <p className="preview-lead">Explore a fictional four-person trip. See how the bills are split and how a repayment changes what everyone owes.</p>
        <div className="preview-tabs" role="tablist" aria-label="Preview views">
          {tabs.map(({ id, title }, index) => (
            <button
              key={id}
              id={'preview-tab-' + id}
              ref={button => { buttons.current[index] = button; }}
              type="button"
              role="tab"
              aria-selected={active === index}
              aria-controls={'preview-panel-' + id}
              tabIndex={active === index ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={event => navigate(event, index)}
            >
              {title}
            </button>
          ))}
        </div>
        {dashboardLink}
      </div>

      <div className="preview-card">
        <header className="preview-header">
          <div><strong>{demo.name}</strong><small>{demo.members.length} travelers · {demo.expenses.length} expenses</small></div>
          <span className="preview-tag">Demo data</span>
        </header>

        <div className="preview-panel" role="tabpanel" id="preview-panel-expenses" aria-labelledby="preview-tab-expenses" hidden={active !== 0} tabIndex={0}>
          <div className="preview-metrics">
            <div><small>Total spent</small><strong>{rupees(total)}</strong></div>
            <div><small>Expenses</small><strong>{demo.expenses.length}</strong></div>
          </div>
          <ul className="preview-entries">
            {demo.expenses.map(({ id, title, amount }) => (
              <li key={id}><span><span className="preview-avatar" aria-hidden="true">{title[0]}</span>{title}</span><b>{rupees(amount)}</b></li>
            ))}
          </ul>
        </div>

        <div className="preview-panel" role="tabpanel" id="preview-panel-balance" aria-labelledby="preview-tab-balance" hidden={active !== 1} tabIndex={0}>
          <h3>Isha’s balance</h3>
          <ul className="preview-entries">
            {shares.map(({ label, amount }) => <li key={label}><span>{label} share</span><b>{rupees(-amount)}</b></li>)}
          </ul>
          <label className="preview-range" htmlFor="preview-repayment">Simulate repayment <b>{rupees(repayment)}</b></label>
          <input
            id="preview-repayment"
            type="range"
            min={0}
            max={maximumRepayment / 100}
            step={100}
            value={repayment / 100}
            aria-valuetext={rupees(repayment)}
            onChange={event => setRepayment(event.currentTarget.valueAsNumber * 100)}
          />
          <p className="preview-notice">Remaining due <strong>{rupees(maximumRepayment - repayment)}</strong></p>
        </div>

        <div className="preview-panel" role="tabpanel" id="preview-panel-settlement" aria-labelledby="preview-tab-settlement" hidden={active !== 2} tabIndex={0}>
          <h3>Suggested settlement</h3>
          <ul className="preview-entries">
            {suggestions.map(({ from, to, amount }) => (
              <li key={from + '-' + to}>
                <span>{members.find(member => member.id === from)?.name} pays {members.find(member => member.id === to)?.name}</span>
                <b>{rupees(amount)}</b>
              </li>
            ))}
          </ul>
          <p className="preview-notice"><strong>{suggestions.length} transfers</strong> clear the remaining balances in this demo.</p>
        </div>
      </div>
    </div>
  );
}
