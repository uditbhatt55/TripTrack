import { split, type Trip } from './ledger';
import type { VenueMatch } from './venues';

export const categories = ['Stay', 'Food', 'Transport', 'Activities', 'Other'];

const demoDestinations = [
  { city: 'Coral Bay', latitude: 15.394, longitude: 73.817 },
  { city: 'Pine Ridge', latitude: 31.116, longitude: 77.165 },
  { city: 'Amber Dunes', latitude: 26.921, longitude: 70.913 },
  { city: 'Silver Lake', latitude: 24.573, longitude: 73.693 },
  { city: 'Fern Valley', latitude: 10.084, longitude: 77.055 },
];

// The venues and branch names are fictional, with coordinates placed near each demo destination.
const demoVenues = [
  { venue: 'Lantern Lodge', latitudeOffset: 0.005, longitudeOffset: -0.008 },
  { venue: 'Driftwood Cafe', branch: 'Harbour', latitudeOffset: 0.002, longitudeOffset: 0.004 },
  { venue: 'Copper Kite Cabs', latitudeOffset: -0.008, longitudeOffset: 0.007 },
  { venue: 'Paper Moon Studio', latitudeOffset: 0.01, longitudeOffset: 0.003 },
  { venue: 'Juniper Market', latitudeOffset: -0.004, longitudeOffset: -0.004 },
  { venue: 'Driftwood Cafe', branch: 'Hill Road', latitudeOffset: -0.004, longitudeOffset: 0.011 },
];

function demoPlace(destination: (typeof demoDestinations)[number], location: (typeof demoVenues)[number]): VenueMatch {
  const branch = location.branch ? ` (${location.branch})` : '';
  return {
    label: `${location.venue}${branch}, ${destination.city}`,
    latitude: Number((destination.latitude + location.latitudeOffset).toFixed(3)),
    longitude: Number((destination.longitude + location.longitudeOffset).toFixed(3)),
  };
}

const venueKey = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

export function demoVenueMatches(venue: string, city: string): VenueMatch[] | undefined {
  const parts = venue.split(',');
  const qualifiedCity = parts.length > 1 ? venueKey(parts[parts.length - 1]) : '';
  const locality = venueKey(city) || qualifiedCity;
  const destination = demoDestinations.find(item => venueKey(item.city) === locality);
  if (!destination) return undefined;

  const input = venueKey(qualifiedCity === locality && qualifiedCity ? parts.slice(0, -1).join(',') : venue);
  return demoVenues
    .filter(({ venue: name, branch }) => {
      return input === venueKey(name) || (branch && input === venueKey(`${name} (${branch})`));
    })
    .map(location => demoPlace(destination, location));
}

export function demoTrips(): Trip[] {
  return demoDestinations.map((destination, index) => {
    const id = 'demo-' + index;
    const members = ['Dev', 'Isha', 'Kabir', 'Mira'].map((name, member) => ({ id: id + '-' + member, name }));
    const expenses = Array.from({ length: 20 + index * 4 }, (_, bill) => {
      const categoryIndex = (bill + index) % categories.length;
      const category = categories[categoryIndex];
      const location = demoVenues[categoryIndex === 1 && bill % 2 ? 5 : categoryIndex];
      const amount = (250 + (bill * 379 + index * 97) % 2250) * 100;
      const participants = members.filter((_, member) => bill % 3 === 0 || member !== bill % 4);
      const date = new Date(Date.UTC(2026, index, 10 + Math.floor(bill / 8))).toISOString().slice(0, 10);
      return {
        id: id + '-expense-' + bill, title: category + ' bill ' + (bill + 1),
        category, amount, payer: members[(bill + Math.floor(bill / 5)) % members.length].id,
        shares: split(amount, participants.map(member => member.id)),
        date,
        venue: location.venue,
        city: destination.city,
        place: demoPlace(destination, location),
        lookup: 'matched' as const,
      };
    });
    return { id, name: destination.city + ' demo', city: destination.city, members, expenses, payments: [] };
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
