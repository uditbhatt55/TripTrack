import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextResponse } from 'next/server';
import { categories, demoTrips } from '../../../lib/demo';
import { split, summarize, type Trip } from '../../../lib/ledger';

const path = resolve('.triptrack-data.json');
const load = (): Trip[] => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
const open = () => process.env.NODE_ENV !== 'production' || process.env.TRIPTRACK_LOCAL_DEMO === '1';
const unavailable = () => NextResponse.json({ error: 'Local demo is disabled.' }, { status: 503 });
const view = (trips: Trip[]) => trips.map(trip => ({...trip, summary: summarize(trip)}));
const invalid = (error: string) => NextResponse.json({ error }, { status: 400 });

export function GET() {
  return open() ? NextResponse.json(view(load())) : unavailable();
}

export async function POST(request: Request) {
  if (!open()) return unavailable();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return invalid('Invalid request.');
  const trips = load();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const trip = trips.find(row => row.id === body.tripId);

  if (body.kind === 'seed') {
    const existing = new Set(trips.map(row => row.id));
    trips.push(...demoTrips().filter(row => !existing.has(row.id)));
  } else if (body.kind === 'trip') {
    if (!name || name.length > 100) return invalid('Enter a trip name up to 100 characters.');
    trips.push({id: randomUUID(), name, members: [], expenses: [], payments: []});
  } else {
    if (!trip) return invalid('Choose an existing trip.');
    const hasMember = (id: string) => trip.members.some(member => member.id === id);
    if (body.kind === 'member') {
      if (!name || name.length > 100) return invalid('Enter a member name up to 100 characters.');
      trip.members.push({id: randomUUID(), name});
    } else {
      const amount = body.amount;
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100_000_000) return invalid('Enter a valid amount up to ₹10,00,000.');
      if (body.kind === 'expense') {
        const participants = Array.isArray(body.participants) ? [...new Set<string>(body.participants)] : [];
        if (!name || name.length > 100 || !hasMember(body.payer) || !participants.length || !participants.every(hasMember)) {
          return invalid('Enter a description, a payer, and at least one participant.');
        }
        const category = categories.includes(body.category) ? body.category : 'Other';
        const date = typeof body.date === 'string' ? body.date : new Date().toISOString().slice(0, 10);
        const timestamp = Date.parse(date);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
          return invalid('Enter a valid expense date.');
        }
        const venue = typeof body.venue === 'string' ? body.venue.trim().slice(0, 150) : '';
        const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        const similar = trip.expenses.find(row => row.amount === amount &&
          Math.abs(Date.parse(row.date ?? date) - timestamp) <= 86_400_000 &&
          (normalize(row.title) === normalize(name) || (normalize(venue) && normalize(row.venue ?? '') === normalize(venue))));
        const amounts = trip.expenses.filter(row => (row.category ?? 'Other') === category)
          .map(row => row.amount).sort((left, right) => left - right);
        const median = (amounts[Math.floor((amounts.length - 1) / 2)] + amounts[Math.floor(amounts.length / 2)]) / 2;
        const warnings: string[] = [];
        if (similar) warnings.push('A similar expense already exists: ' + similar.title + '.');
        if (amounts.length >= 3 ? amount >= 3 * median && amount - median >= 100_000 : amount >= 500_000) {
          warnings.push(amounts.length >= 3
            ? 'This expense is unusually high for ' + category + ' (median ₹' + (median / 100).toFixed(2) + ').'
            : 'This expense reaches the ₹5,000 warning threshold.');
        }
        if (warnings.length && body.confirmed !== true) return NextResponse.json({ error: warnings.join(' '), warning: true }, {status: 409});
        trip.expenses.push({id: randomUUID(), title: name, payer: body.payer, amount, category, date, venue, shares: split(amount, participants)});
      } else if (body.kind === 'payment') {
        if (!hasMember(body.from) || !hasMember(body.to) || body.from === body.to) return invalid('Choose two different members.');
        trip.payments.push({from: body.from, to: body.to, amount});
      } else {
        return invalid('Unknown action.');
      }
    }
  }
  writeFileSync(path + '.tmp', JSON.stringify(trips), {mode: 0o600});
  renameSync(path + '.tmp', path);
  return NextResponse.json(view(trips));
}
