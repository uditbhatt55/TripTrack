import 'server-only';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Trip } from './ledger';
import { getSupabaseAdmin, getViewer, isSupabaseAuthConfigured } from './supabase';
import type { Actor } from './trip-view';

const path = resolve((process.env.NODE_ENV === 'development' && process.env.TRIPTRACK_TEST_DATA) || '.triptrack-data.json');
const load = (): Trip[] => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
export const saveLocalTrips = (trips: Trip[]) => {
  writeFileSync(path + '.tmp', JSON.stringify(trips), { mode: 0o600 });
  renameSync(path + '.tmp', path);
};

type StoredRow = { ledger: Trip; revision: number };
type Transition<T> = (trip: Trip | undefined) => { trip?: Trip; result: T };
const availableDemo = () => process.env.NODE_ENV !== 'production' || process.env.TRIPTRACK_LOCAL_DEMO === '1';

export class TripError extends Error {
  constructor(message: string, public status = 400, public warning = false) {
    super(message);
  }
}

export async function requestActor(): Promise<Actor> {
  if (!isSupabaseAuthConfigured()) {
    if (availableDemo()) return null;
    throw new TripError('Sign-in is unavailable. Configure Supabase to open shared trips.', 503);
  }
  const viewer = await getViewer();
  if (!viewer) throw new TripError('Sign in with Google to open your trips.', 401);
  return viewer;
}

export async function listTrips(actor: Actor) {
  if (!actor) return load();
  const admin = getSupabaseAdmin();
  const memberships = await admin.from('trip_members').select('trip_id').eq('user_id', actor.id);
  if (memberships.error) throw memberships.error;
  const ids = memberships.data.map(row => row.trip_id);
  if (!ids.length) return [];
  const { data, error } = await admin.from('trips').select('ledger').in('id', ids).not('ledger', 'is', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(row => row.ledger as Trip).filter(trip => trip.members.some(member => member.userId === actor.id));
}

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function mutateTrip<T>(actor: Actor, id: string, transition: Transition<T>): Promise<T> {
  if (!actor) {
    const trips = load();
    const index = trips.findIndex(row => row.id === id);
    const next = transition(index >= 0 ? trips[index] : undefined);
    if (next.trip) {
      if (index < 0) trips.push(next.trip);
      else trips[index] = next.trip;
      saveLocalTrips(trips);
    }
    return next.result;
  }
  if (!UUID.test(id)) throw new TripError('Choose an existing trip.', 404);
  const admin = getSupabaseAdmin();
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await admin.from('trips').select('ledger, revision').eq('id', id).maybeSingle<StoredRow>();
    if (error) throw error;
    if (data && !data.ledger) throw new TripError('This trip does not have a ledger.', 404);
    const next = transition(data?.ledger);
    if (!next.trip) return next.result;
    const saved = await admin.rpc('splittrack_save_trip', { snapshot: next.trip, expected_revision: data?.revision ?? null });
    if (saved.error) throw saved.error;
    if (saved.data) return next.result;
  }
  throw new TripError('This trip changed while saving. Try again.', 409);
}

export async function findInvitedTrip(hash: string) {
  const { data, error } = await getSupabaseAdmin().from('trip_invites').select('trip_id')
    .eq('token_hash', hash).maybeSingle();
  if (error) throw error;
  return data?.trip_id as string | undefined;
}
