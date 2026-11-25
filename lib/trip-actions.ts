import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { categories } from './demo';
import { split, type Activity, type Expense, type Trip } from './ledger';
import { TripError } from './trip-store';
import type { Actor } from './trip-view';

export type Input = Record<string, unknown>;
export type LookupTask = { expenseId: string; version: string; venue: string; city: string };
export type MailTask = { token: string; memberName: string; email: string; tripName: string };
export const bank = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
export const dateNow = () => new Date().toISOString();
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
export const emailAddress = (value: unknown) => text(value).toLowerCase();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function access(trip: Trip | undefined, actor: Actor): Trip {
  if (!trip || (actor && !trip.members.some(member => member.userId === actor.id))) {
    throw new TripError('This trip is unavailable.', 404);
  }
  return trip;
}

export function activity(trip: Trip, kind: Activity['kind'], message: string, hiddenFrom?: string) {
  (trip.activity ??= []).push({ id: randomUUID(), kind, date: dateNow(), text: message, hiddenFrom });
}

function checkedName(value: unknown, field: string) {
  const name = text(value);
  if (!name || name.length > 100) throw new TripError('Enter ' + field + ' up to 100 characters.');
  return name;
}

export function tripIdForSubmission(actor: Actor, submission: string) {
  if (!submission) return randomUUID();
  const hash = digest((actor?.id ?? 'local-demo') + ':' + submission);
  return [hash.slice(0, 8), hash.slice(8, 12), '4' + hash.slice(13, 16), '8' + hash.slice(17, 20), hash.slice(20, 32)].join('-');
}

export function newTrip(id: string, body: Input, actor: Actor): Trip {
  const name = checkedName(body.name, 'a trip name');
  const city = text(body.city);
  if (city.length > 120) throw new TripError('Enter a destination up to 120 characters.');
  const yourName = text(body.yourName);
  if (yourName.length > 100) throw new TripError('Enter your name up to 100 characters.');
  const members = actor ? [{ id: randomUUID(), name: yourName || actor.email?.split('@')[0]?.slice(0, 100) || 'Trip owner', userId: actor.id }] : [];
  return { id, name, city, owner: actor?.id, members, expenses: [], payments: [] };
}

function manager(trip: Trip, actor: Actor) {
  if (actor && trip.owner !== actor.id) throw new TripError('Only the trip owner can manage invitations.', 403);
}

function validateMemberEmail(trip: Trip, actor: Actor, email: string, excluding?: string) {
  if (!email) return;
  if (email.length > 254 || !emailPattern.test(email)) throw new TripError('Enter a valid member email address.');
  if (trip.members.some(row => row.id !== excluding && row.email === email) || emailAddress(actor?.email) === email) {
    throw new TripError('That email is already on this trip.', 409);
  }
}
function issue(trip: Trip, member: Trip['members'][number]): MailTask {
  const token = randomBytes(32).toString('base64url');
  const invite = {
    memberId: member.id, hash: digest(token),
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  };
  trip.invites = [...(trip.invites ?? []).filter(record => record.memberId !== member.id), invite];
  return { email: member.email!, memberName: member.name, tripName: trip.name, token };
}

export function redeem(trip: Trip | undefined, actor: NonNullable<Actor>, hash: string) {
  const invite = trip?.invites?.find(record => record.hash === hash);
  const member = trip?.members.find(row => row.id === invite?.memberId);
  if (!trip || !invite || !member || !actor.email || member.email !== emailAddress(actor.email)) {
    throw new TripError('This invitation is unavailable for your Google account.', 404);
  }
  if (invite.redeemedAt && member.userId === actor.id) return { tripId: trip.id, changed: false };
  if (invite.redeemedAt || member.userId || Date.parse(invite.expiresAt) <= Date.now()) {
    throw new TripError('This invitation has expired or already been used.', 410);
  }
  if (trip.members.some(row => row.userId === actor.id)) {
    throw new TripError('Your account is already linked to a member of this trip.', 409);
  }
  member.userId = actor.id;
  invite.redeemedAt = dateNow();
  activity(trip, 'join', member.name + ' joined the trip.');
  return { tripId: trip.id, changed: true };
}

function amountInPaise(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > 100_000_000) {
    throw new TripError('Enter a valid amount up to ₹10,00,000.');
  }
  return value;
}

function location(task: Expense): LookupTask {
  return { expenseId: task.id, version: task.locationVersion!, venue: task.venue!, city: task.city ?? '' };
}

function beginLookup(expense: Expense) {
  expense.place = undefined;
  expense.candidates = undefined;
  expense.locationVersion = expense.venue ? randomUUID() : undefined;
  expense.lookup = expense.venue ? 'pending' : undefined;
  return expense.venue ? location(expense) : undefined;
}

function canEdit(trip: Trip, expense: Expense, actor: Actor) {
  if (!actor || trip.owner === actor.id || expense.createdBy === actor.id) return;
  if (!trip.members.some(member => member.id === expense.payer && member.userId === actor.id)) {
    throw new TripError('Only the trip owner, expense creator or payer can edit this expense.', 403);
  }
}

function warningsFor(trip: Trip, expense: Expense) {
  const previous = trip.expenses.filter(row => row.id !== expense.id);
  const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const venue = normalize(expense.venue ?? '');
  const time = Date.parse(expense.date!);
  const description = normalize(expense.title);
  const similar = previous.find(row => row.amount === expense.amount &&
    Math.abs(Date.parse(row.date ?? expense.date!) - time) <= 86_400_000 &&
    (normalize(row.title) === description || (venue && normalize(row.venue ?? '') === venue)));
  const amounts = previous.filter(row => (row.category ?? 'Other') === expense.category)
    .map(row => row.amount).sort((left, right) => left - right);
  const median = (amounts[Math.floor((amounts.length - 1) / 2)] + amounts[Math.floor(amounts.length / 2)]) / 2;
  const warnings: string[] = [];
  if (similar) warnings.push('A similar expense already exists: ' + similar.title + '.');
  if (amounts.length >= 3 ? expense.amount >= 3 * median && expense.amount - median >= 100_000 : expense.amount >= 500_000) {
    warnings.push(amounts.length >= 3
      ? 'This expense is unusually high for ' + expense.category + ' (median ' + bank.format(median / 100) + ').'
      : 'This expense reaches the ₹5,000 warning threshold.');
  }
  return warnings;
}

function recordExpense(trip: Trip, body: Input, actor: Actor, previous?: Expense) {
  const title = checkedName(body.name, 'a description');
  const payer = text(body.payer);
  const amount = amountInPaise(body.amount);
  const memberIds = new Set(trip.members.map(member => member.id));
  const participants = Array.isArray(body.participants) ? [...new Set(body.participants)] : [];
  const sponsored = Array.isArray(body.sponsored) ? [...new Set(body.sponsored)] : [];
  if (!memberIds.has(payer) || !participants.length || !participants.every(id => typeof id === 'string' && memberIds.has(id))) {
    throw new TripError('Enter a description, a payer, and at least one participant.');
  }
  if (sponsored.some(id => id === payer || !participants.includes(id))) {
    throw new TripError('Choose a participant other than the payer to sponsor.');
  }
  const date = text(body.date) || dateNow().slice(0, 10);
  const stamp = Date.parse(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== date) {
    throw new TripError('Enter a valid expense date.');
  }
  const venue = text(body.venue);
  const city = text(body.city) || (venue ? trip.city ?? '' : '');
  if (venue.length > 150 || city.length > 120) throw new TripError('Enter a shorter venue or city.');
  const originalShares = split(amount, participants as string[]);
  const shares = { ...originalShares };
  for (const member of sponsored as string[]) {
    shares[payer] = (shares[payer] ?? 0) + shares[member];
    shares[member] = 0;
  }
  const category = categories.includes(text(body.category)) ? text(body.category) : 'Other';
  const hasWaiver = previous && trip.waivers?.some(row => row.expenseId === previous.id);
  if (hasWaiver && (previous.amount !== amount || previous.payer !== payer ||
      JSON.stringify(previous.shares) !== JSON.stringify(shares))) {
    throw new TripError('The amount, payer and shares on this expense cannot be changed.', 409);
  }
  const expense: Expense = {
    ...previous, id: previous?.id ?? randomUUID(), title, amount, payer, category, date, venue, city, shares,
    originalShares, sponsored: (sponsored as string[]).sort(),
    createdBy: previous?.createdBy ?? actor?.id,
    createdAt: previous?.createdAt ?? dateNow(),
  };
  const sameWarningFields = previous && previous.title === title && previous.venue === venue &&
    previous.category === category && previous.date === date && previous.amount === amount;
  if (!sameWarningFields && body.confirmed !== true) {
    const warnings = warningsFor(trip, expense);
    if (warnings.length) throw new TripError(warnings.join(' '), 409, true);
  }
  const changedLocation = !previous || previous.venue !== venue || previous.city !== city;
  const lookup = changedLocation ? beginLookup(expense) : undefined;
  if (previous) trip.expenses[trip.expenses.indexOf(previous)] = expense;
  else trip.expenses.push(expense);
  const payerName = trip.members.find(row => row.id === payer)!.name;
  activity(trip, previous ? 'edit' : 'expense', previous ? 'Updated ' + title + '.' : payerName + ' paid ' + bank.format(amount / 100) + ' for ' + title + '.');
  return lookup;
}

type TripAction = { lookup?: LookupTask; mail?: MailTask; previewInvite?: boolean };

export function performAction(trip: Trip, body: Input, actor: Actor): TripAction {
  const member = (id: unknown) => trip.members.find(row => row.id === id);

  if (body.kind === 'member' || body.kind === 'invite') {
    manager(trip, actor);
    if (body.kind === 'invite') {
      const target = member(body.memberId);
      if (!target || target.userId) throw new TripError('Choose an unlinked member.');
      const email = emailAddress(body.email) || target.email || '';
      validateMemberEmail(trip, actor, email, target.id);
      if (!email) throw new TripError('Enter the member’s Google email address.');
      target.email = email;
      return actor ? { mail: issue(trip, target) } : { previewInvite: true };
    }
    const name = checkedName(body.name, 'a member name');
    const email = emailAddress(body.email);
    validateMemberEmail(trip, actor, email);
    const target = { id: randomUUID(), name, ...(email ? { email } : {}) };
    trip.members.push(target);
    activity(trip, 'member', name + ' was added to the trip.');
    return email ? actor ? { mail: issue(trip, target) } : { previewInvite: true } : {};
  }

  if (body.kind === 'payment') {
    const from = member(body.from);
    const to = member(body.to);
    if (!from || !to || from.id === to.id) throw new TripError('Choose two different members.');
    if (actor && from.userId !== actor.id && trip.owner !== actor.id) {
      throw new TripError('Only the sender or trip owner can record this repayment.', 403);
    }
    const amount = amountInPaise(body.amount);
    trip.payments.push({ id: randomUUID(), from: from.id, to: to.id, amount, date: dateNow(), recordedBy: actor?.id });
    activity(trip, 'payment', from.name + ' paid ' + to.name + ' ' + bank.format(amount / 100) + '.');
    return {};
  }

  if (body.kind === 'expense') return { lookup: recordExpense(trip, body, actor) };

  if (!['edit-expense', 'retry-location', 'choose-location', 'waive'].includes(text(body.kind))) {
    throw new TripError('Unknown action.');
  }
  const expense = trip.expenses.find(row => row.id === body.expenseId);
  if (!expense) throw new TripError('Choose an existing expense.', 404);
  if (body.kind === 'waive') {
    const payer = member(expense.payer)!;
    if (actor && payer.userId !== actor.id) throw new TripError('Only the payer can waive a share.', 403);
    if (trip.payments.length) throw new TripError('Shares can only be waived before the first repayment.', 409);
    const target = member(body.memberId);
    const amount = target ? expense.shares[target.id] : 0;
    if (!target || target.id === payer.id || !amount || trip.waivers?.some(row => row.expenseId === expense.id && row.member === target.id)) {
      throw new TripError('Choose an outstanding share that has not been waived.', 409);
    }
    (trip.waivers ??= []).push({ expenseId: expense.id, member: target.id, payer: payer.id, amount, date: dateNow() });
    activity(trip, 'waiver', payer.name + ' waived ' + target.name + '’s share of ' + expense.title + '.', target.id);
    return {};
  }

  canEdit(trip, expense, actor);
  if (body.kind === 'edit-expense') return { lookup: recordExpense(trip, body, actor, expense) };
  if (body.version !== expense.locationVersion) throw new TripError('The venue changed. Refresh and try again.', 409);
  if (body.kind === 'retry-location') {
    if (!expense.venue) throw new TripError('Add a venue before finding a map pin.');
    return { lookup: beginLookup(expense) };
  }
  if (typeof body.candidate !== 'number' || !Number.isInteger(body.candidate)) throw new TripError('Choose a venue match.');
  const choice = expense.candidates?.[body.candidate];
  if (expense.lookup !== 'choose' || !choice) throw new TripError('Choose a venue match.');
  expense.place = choice;
  expense.candidates = undefined;
  expense.lookup = 'matched';
  return {};
}

