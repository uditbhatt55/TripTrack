import { split, type Trip } from './ledger';

export const categories = ['Stay', 'Food', 'Transport', 'Activities', 'Other'];

export function demoTrips(): Trip[] {
  return ['Coral Bay', 'Pine Ridge', 'Amber Dunes', 'Silver Lake', 'Fern Valley'].map((place, index) => {
    const id = 'demo-' + index;
    const members = ['Dev', 'Isha', 'Kabir', 'Mira'].map((name, member) => ({ id: id + '-' + member, name }));
    const expenses = Array.from({ length: 20 + index * 4 }, (_, bill) => {
      const category = categories[(bill + index) % categories.length];
      const amount = (250 + (bill * 379 + index * 97) % 2250) * 100;
      const participants = members.filter((_, member) => bill % 3 === 0 || member !== bill % 4);
      return {
        id: id + '-expense-' + bill, title: category + ' bill ' + (bill + 1),
        category, amount, payer: members[(bill + Math.floor(bill / 5)) % members.length].id,
        shares: split(amount, participants.map(member => member.id)),
      };
    });
    return { id, name: place + ' demo', members, expenses, payments: [] };
  });
}

export function tripInsights(trip: Trip) {
  const byCategory = new Map<string, number>();
  const byPayer = new Map<string, number>();
  for (const bill of trip.expenses) {
    const category = bill.category ?? 'Other';
    byCategory.set(category, (byCategory.get(category) ?? 0) + bill.amount);
    byPayer.set(bill.payer, (byPayer.get(bill.payer) ?? 0) + 1);
  }
  return {
    category: [...byCategory].sort((left, right) => right[1] - left[1])[0],
    payer: [...byPayer].sort((left, right) => right[1] - left[1])[0],
  };
}
