import { explain, summarize, type Expense, type Trip } from './ledger';

export type Actor = { id: string; email: string | null } | null;

export function tripView(trip: Trip, actor: Actor) {
  const mine = trip.members.find(member => member.userId === actor?.id && actor !== null);
  const canManage = actor === null || trip.owner === actor.id;
  const waivers = trip.waivers ?? [];
  const hidden = new Set(waivers.filter(row => row.member === mine?.id).map(row => row.expenseId));
  const members = trip.members.map(({ id, name, userId, email }) => ({
    id, name, linked: Boolean(userId),
    ...(canManage && email ? { email } : {}),
  }));
  const expenses = trip.expenses.map((expense: Expense) => {
    const { locationVersion, createdBy, originalShares, sponsored, ...publicExpense } = expense;
    const privateAdjustment = hidden.has(expense.id);
    const shares = privateAdjustment ? {
      ...expense.shares,
      [mine.id]: expense.shares[mine.id] - waivers.find(row => row.expenseId === expense.id && row.member === mine.id).amount,
    } : expense.shares;
    const canEdit = actor === null || canManage || createdBy === actor.id || expense.payer === mine?.id;
    const waived = waivers.filter(row => row.expenseId === expense.id && row.member !== mine?.id).map(row => row.member);
    const canWaive = (actor === null || expense.payer === mine?.id) && trip.payments.length === 0;
    return {
      ...publicExpense, shares, canEdit, creatorName: createdBy ? trip.members.find(member => member.userId === createdBy)?.name : undefined, lookupVersion: locationVersion, financialLocked: privateAdjustment ? undefined : waivers.some(row => row.expenseId === expense.id),
      ...(privateAdjustment ? {} : { originalShares, sponsored }),
      waiverOptions: canWaive ? Object.keys(shares).filter(id => id !== expense.payer && shares[id] > 0 && !waived.includes(id)) : [],
      waived,
    };
  });

  return {
    id: trip.id,
    name: trip.name,
    city: trip.city,
    members,
    expenses,
    payments: trip.payments.map(({ id, from, to, amount, date }) => ({ id, from, to, amount, date })),
    canManage,
    myMemberId: mine?.id,
    demo: actor === null,
    summary: summarize(trip),
    explanations: Object.fromEntries(trip.members.map(({ id }) => [
      id, explain(trip, id, id === mine?.id).filter(line => line.amount !== 0)
        .map(line => mine && id !== mine.id && waivers.some(row => row.member === mine.id && row.payer === id && line.label === 'Waiver for ' + mine.name + ' on ' + trip.expenses.find(expense => expense.id === row.expenseId)?.title)
          ? { ...line, label: 'Balance adjustment' } : line),
    ])),
    activity: (trip.activity ?? []).filter(row => !mine || row.hiddenFrom !== mine.id)
      .map(({ id, kind, date, text }) => ({ id, kind, date, text })).reverse(),
    markers: expenses.filter(expense => expense.place).map(({ id, title, place, payer, amount, date, venue, city }) => ({
      id, title, place, payer, amount, date, venue, city,
    })),
  };
}
export type TripView = ReturnType<typeof tripView>;


