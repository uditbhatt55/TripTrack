import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, test } from '@playwright/test';
import type { Trip } from '../lib/ledger';
import { tripView } from '../lib/trip-view';

const ids = Array.from({ length: 11 }, (_, index) => '5a290cf7-e5ee-41ca-8c61-a2d1cb0000' + String(index).padStart(2, '0'));
const [tripId, owner, isha, kabir, devMember, ishaMember, kabirMember, expenseId, paymentId, eventId, outsider] = ids;
const date = '2026-11-25T10:00:00.000Z';

function fixture(): Trip {
  const shares = { [devMember]: 40_000, [ishaMember]: 40_000, [kabirMember]: 40_000 };
  return {
    id: tripId, owner, name: 'Shared fictional trip', city: 'Coral Bay',
    members: [{ id: devMember, userId: owner, name: 'Dev' }, { id: ishaMember, name: 'Isha', email: 'isha@example.test' }, { id: kabirMember, userId: kabir, name: 'Kabir' }],
    expenses: [{
      id: expenseId, createdBy: owner, createdAt: date, date: date.slice(0, 10), category: 'Stay',
      payer: devMember, title: 'Stay', amount: 120_000, shares, originalShares: shares,
      venue: 'Lantern Lodge', city: 'Coral Bay', lookup: 'matched',
      place: { label: 'Lantern Lodge, Coral Bay', latitude: 15.399, longitude: 73.809 },
    }],
    invites: [{ memberId: ishaMember, hash: 'fixture-token-hash', expiresAt: '2099-01-01T00:00:00.000Z' }],
    payments: [],
  };
}

test('PostgreSQL saves shared records and serializes conflicting ledger updates', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit integer, allowed_mime_types text[]);
    `);
    for (const user of [owner, isha, kabir, outsider]) await db.query('insert into auth.users values ($1)', [user]);
    for (const file of ['001_initial.sql', '002_shared_ledger.sql']) {
      await db.exec(await readFile('supabase/' + file, 'utf8'));
    }
    const save = async (trip: Trip, revision: number | null) => {
      const result = await db.query<{ saved: boolean }>('select public.splittrack_save_trip($1::jsonb, $2) as saved', [JSON.stringify(trip), revision]);
      return result.rows[0].saved;
    };
    const draft = fixture();
    expect(await save(draft, null)).toBe(true);
    const token = await db.query('select member_id from public.trip_invites where token_hash = $1', ['fixture-token-hash']);
    expect(token.rows).toEqual([{ member_id: ishaMember }]);

    draft.members[1].userId = isha;
    draft.invites[0].redeemedAt = date;
    expect(await save(draft, 1)).toBe(true);
    const stale = structuredClone(draft);
    stale.payments = [{ id: paymentId, from: kabirMember, to: devMember, amount: 10_000, date, recordedBy: kabir }];
    draft.waivers = [{ expenseId, member: ishaMember, payer: devMember, amount: 40_000, date }];
    draft.activity = [{ id: eventId, kind: 'waiver', date, text: 'Dev waived Isha’s share of Stay.', hiddenFrom: ishaMember }];
    expect(await save(draft, 2)).toBe(true);
    expect(await save(stale, 2)).toBe(false);
    expect((await db.query('select payer_member_id from public.waivers')).rows).toEqual([{ payer_member_id: devMember }]);
    expect((await db.query('select id from public.settlements')).rows).toEqual([]);

    const sharedRows = await db.query<{ ledger: Trip }>(`
      select trips.ledger from public.trips
      join public.trip_members members on members.trip_id = trips.id
      where members.user_id = any($1::uuid[]) order by members.user_id
    `, [[owner, isha, outsider]]);
    expect(sharedRows.rows).toHaveLength(2);
    const ownerView = tripView(sharedRows.rows[0].ledger, { id: owner, email: 'dev@example.test' });
    const recipient = tripView(sharedRows.rows[1].ledger, { id: isha, email: 'isha@example.test' });
    expect(recipient.markers).toEqual(ownerView.markers);
    expect(ownerView.activity).toHaveLength(1);
    expect(recipient.activity).toHaveLength(0);
    expect(recipient.expenses[0].shares[ishaMember]).toBe(0);
    expect(recipient.expenses[0].originalShares).toBeUndefined();
    expect(recipient.expenses[0].waived).not.toContain(ishaMember);
    expect(recipient.explanations[ishaMember]).toEqual([]);
    expect(JSON.stringify(recipient)).not.toContain('waived Isha');
    expect(JSON.stringify(recipient)).not.toContain('fixture-token-hash');
    expect((await db.query("select public from storage.buckets where id = 'upi-qr'")).rows).toEqual([{ public: false }]);
    const grants = await db.query("select has_function_privilege('authenticated', 'public.splittrack_save_trip(jsonb,bigint)', 'execute') as allowed");
    expect(grants.rows).toEqual([{ allowed: false }]);
  } finally {
    await db.close();
  }
});
