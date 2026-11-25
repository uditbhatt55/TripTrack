export type Member = { id: string; name: string };
export type Expense = { id: string; title: string; payer: string; amount: number; shares: Record<string, number>; category?: string; date?: string; venue?: string };
export type Payment = { from: string; to: string; amount: number };
export type Trip = { id: string; name: string; members: Member[]; expenses: Expense[]; payments: Payment[] };

export function split(amount: number, participants: string[]) {
  return Object.fromEntries([...participants].sort().map((id, index) => [
    id, Math.floor(amount / participants.length) + Number(index < amount % participants.length),
  ]));
}

export function explain(trip: Trip, member: string) {
  return [
    ...trip.expenses.map(expense => ({
      label: expense.title,
      amount: (expense.payer === member ? expense.amount : 0) - (expense.shares[member] ?? 0),
    })),
    ...trip.payments.flatMap(payment => {
      if (payment.from === member) return [{label: 'Payment sent', amount: payment.amount}];
      if (payment.to === member) return [{label: 'Payment received', amount: -payment.amount}];
      return [];
    }),
  ];
}

export function summarize(trip: Trip) {
  const balances = trip.members.map(member => ({
    ...member, amount: explain(trip, member.id).reduce((sum, row) => sum + row.amount, 0),
  }));
  const nonzero = balances.filter(row => row.amount !== 0);
  const exact = nonzero.length <= 8;
  const groups = exact ? zeroSumGroups(nonzero) : [nonzero];
  return { balances, suggestions: groups.flatMap(matchTransfers), exact };
}

type Balance = Member & { amount: number };

function zeroSumGroups(rows: Balance[]): Balance[][] {
  const limit = 1 << rows.length;
  const sums = new Array<number>(limit).fill(0);
  const best = new Array<number>(limit).fill(-1);
  const choice = new Array<number>(limit).fill(0);
  best[0] = 0;
  for (let mask = 1; mask < limit; mask++) {
    const first = mask & -mask;
    sums[mask] = sums[mask ^ first] + rows[31 - Math.clz32(first)].amount;
    if (sums[mask] !== 0) continue;
    for (let group = mask; group; group = (group - 1) & mask) {
      if (!(group & first) || sums[group] !== 0) continue;
      const remaining = best[mask ^ group];
      if (remaining >= 0 && remaining + 1 > best[mask]) {
        best[mask] = remaining + 1;
        choice[mask] = group;
      }
    }
  }
  const groups: Balance[][] = [];
  for (let mask = limit - 1; mask;) {
    const group = choice[mask];
    if (!group) throw new Error('Trip balances must sum to zero.');
    groups.push(rows.filter((_, index) => group & (1 << index)));
    mask ^= group;
  }
  return groups;
}

function matchTransfers(balances: Balance[]): Payment[] {
  const debtors = balances.filter(row => row.amount < 0).map(row => ({...row, amount: -row.amount}));
  const creditors = balances.filter(row => row.amount > 0).map(row => ({...row}));
  const suggestions: Payment[] = [];
  let debtor = 0;
  let creditor = 0;
  while (debtor < debtors.length && creditor < creditors.length) {
    const from = debtors[debtor];
    const to = creditors[creditor];
    const amount = Math.min(from.amount, to.amount);
    suggestions.push({from: from.id, to: to.id, amount});
    from.amount -= amount;
    to.amount -= amount;
    if (!from.amount) debtor++;
    if (!to.amount) creditor++;
  }
  return suggestions;
}
