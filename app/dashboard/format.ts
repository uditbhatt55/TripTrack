import type { TripView } from '../../lib/trip-view';

export type ExpenseView = TripView['expenses'][number];
export type TripAction = (data: Record<string, unknown>) => Promise<boolean>;
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
export const money = (paise: number) => currency.format(paise / 100);

export function paise(value: FormDataEntryValue | null) {
  const input = String(value ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(input)) return 0;
  const [rupees, fraction = ''] = input.split('.');
  return Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
}
