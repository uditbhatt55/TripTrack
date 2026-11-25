import { expect, test } from '@playwright/test';
import type { Trip, summarize } from '../lib/ledger';

type TripView = Trip & { summary: ReturnType<typeof summarize> };

test('judging ledger, warning cancellation, repayment and retry', async ({ request }) => {
  const post = (data: object) => request.post('/api/trips', { data });
  async function save(data: object) {
    const response = await post(data);
    expect(response.status(), await response.text()).toBe(200);
    return await response.json() as TripView[];
  }

  const tripId = (await save({ kind: 'trip', name: 'Judging fixture' })).at(-1)!.id;
  let trip!: TripView;
  for (const name of ['Dev', 'Isha', 'Kabir', 'Mira']) {
    trip = (await save({ kind: 'member', tripId, name })).find(row => row.id === tripId)!;
  }
  const [dev, isha, kabir, mira] = trip.members.map(member => member.id);
  const all = [dev, isha, kabir, mira];
  const expense = { kind: 'expense', tripId, payer: dev, date: '2026-11-25' };
  const stay = { ...expense, name: 'Stay', amount: 640_000, category: 'Stay', participants: all };
  const dinner = { ...expense, name: 'Dinner', amount: 120_000, category: 'Food', participants: [isha, kabir] };
  expect((await post(stay)).status()).toBe(409);
  await save({ ...stay, confirmed: true });
  await save(dinner);
  await save({ ...expense, name: 'Cab', amount: 240_000, category: 'Transport', participants: all });

  const duplicate = await post({ ...dinner, name: 'dinner!', payer: mira, date: '2026-11-26' });
  expect(duplicate.status()).toBe(409);
  expect((await duplicate.json()).error).toMatch(/similar expense/i);

  const high = await post({ ...expense, name: 'Tour', amount: 600_000, category: 'Activities', participants: all });
  expect(high.status()).toBe(409);
  expect((await high.json()).warning).toBe(true);

  const lookup = async () => ((await (await request.get('/api/trips')).json()) as TripView[]).find(row => row.id === tripId)!;
  trip = await lookup();
  expect(trip.expenses).toHaveLength(3);
  expect(trip.summary.balances.map(row => row.amount)).toEqual([780_000, -280_000, -280_000, -220_000]);
  expect(trip.summary.exact).toBe(true);
  expect(trip.summary.suggestions).toHaveLength(3);
  const remaining = new Map(trip.summary.balances.map(row => [row.id, row.amount]));
  for (const { from, to, amount } of trip.summary.suggestions) {
    remaining.set(from, remaining.get(from)! + amount);
    remaining.set(to, remaining.get(to)! - amount);
  }
  expect([...remaining.values()]).toEqual([0, 0, 0, 0]);

  const payment = { kind: 'payment', tripId, from: isha, to: dev, amount: 40_000, submissionId: crypto.randomUUID() };
  await save(payment);
  await save(payment);
  trip = await lookup();
  expect(trip.payments).toHaveLength(1);
  expect(trip.summary.balances.find(row => row.id === isha)?.amount).toBe(-240_000);

  const rounding = { ...expense, name: 'Rounding', amount: 10_000, participants: [mira, kabir, isha], submissionId: crypto.randomUUID() };
  await save(rounding);
  await save(rounding);
  trip = await lookup();
  expect(trip.expenses).toHaveLength(4);
  const shares = trip.expenses.at(-1)!.shares;
  expect([mira, kabir, isha].sort().map(id => shares[id])).toEqual([3334, 3333, 3333]);
  const invalid = await post({ ...rounding, submissionId: crypto.randomUUID(), participants: ['unrelated-member'] });
  expect(invalid.status()).toBe(400);
});

test('five demo trips have repeatable expense counts', async ({ request }) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await request.post('/api/trips', { data: { kind: 'seed' } });
    expect(response.ok()).toBe(true);
    const trips = (await response.json()) as TripView[];
    expect(trips.filter(trip => trip.id.startsWith('demo-')).map(trip => trip.expenses.length)).toEqual([20, 24, 28, 32, 36]);
  }
});

test('signed-out users cannot access UPI profiles', async ({ request }) => {
  const response = await request.get('/api/profile');
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ error: 'Sign in to view payment profiles.' });
});


test('sponsorship, venue branches, edits, retries, and waivers persist', async ({ request }) => {
  async function save(data: object, status = 200) {
    const response = await request.post('/api/trips', { data });
    expect(response.status(), await response.text()).toBe(status);
    return response;
  }
  const created = await save({ kind: 'trip', name: 'Fictional Coral Bay', city: 'Coral Bay' });
  const tripId = created.headers()['x-trip-id'];
  async function change(data: object) {
    return ((await (await save({ tripId, ...data })).json()) as Array<ReturnType<typeof import('../lib/trip-view').tripView>>)
      .find(trip => trip.id === tripId)!;
  }
  await change({ kind: 'member', name: 'Dev' });
  const memberResponse = await save({ kind: 'member', tripId, name: 'Isha', email: 'isha@example.test' });
  expect(memberResponse.headers()['x-invitation-status']).toBe('demo');
  let trip = await change({ kind: 'member', name: 'Kabir' });
  const [dev, isha, kabir] = trip.members.map(member => member.id);
  const expense = { payer: dev, participants: [dev, isha, kabir], amount: 120_000, category: 'Food', date: '2026-11-25' };

  trip = await change({ ...expense, kind: 'expense', name: 'Sponsored dinner', sponsored: [isha], venue: 'Lantern Lodge' });
  expect(trip.summary.balances.map(row => row.amount)).toEqual([40_000, 0, -40_000]);
  expect(trip.markers[0].place?.label).toBe('Lantern Lodge, Coral Bay');

  trip = await change({ ...expense, kind: 'expense', name: 'Cafe lunch', venue: 'Driftwood Cafe' });
  const cafe = trip.expenses.find(row => row.title === 'Cafe lunch')!;
  expect(cafe.lookup).toBe('choose');
  expect(cafe.candidates).toHaveLength(2);
  trip = await change({ kind: 'choose-location', expenseId: cafe.id, version: cafe.lookupVersion, candidate: 1 });
  expect(trip.markers.find(row => row.id === cafe.id)?.place?.label).toBe(cafe.candidates![1].label);

  trip = await change({ ...expense, kind: 'edit-expense', expenseId: cafe.id, name: cafe.title, venue: 'Unknown Venue' });
  const edited = trip.expenses.find(row => row.id === cafe.id)!;
  expect(edited.lookup).toBe('failed');
  expect(trip.markers.some(row => row.id === cafe.id)).toBe(false);
  await save({ kind: 'choose-location', tripId, expenseId: cafe.id, version: cafe.lookupVersion, candidate: 0 }, 409);
  trip = await change({ kind: 'retry-location', expenseId: cafe.id, version: edited.lookupVersion });
  expect(trip.expenses.find(row => row.id === cafe.id)?.lookup).toBe('failed');

  const waiver = { kind: 'waive', expenseId: cafe.id, memberId: isha, submissionId: crypto.randomUUID() };
  await change(waiver);
  trip = await change(waiver);
  expect(trip.summary.balances.map(row => row.amount)).toEqual([80_000, 0, -80_000]);
  expect(trip.activity.filter(item => item.kind === 'waiver')).toHaveLength(1);
  await change({ kind: 'payment', from: kabir, to: dev, amount: 10_000 });
  await save({ kind: 'waive', tripId, expenseId: cafe.id, memberId: kabir }, 409);
});
