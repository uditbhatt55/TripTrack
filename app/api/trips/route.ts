import { demoTrips } from '../../../lib/demo';
import { sendTripInvitation } from '../../../lib/invite-mail';
import { digest, access, newTrip, performAction, redeem, text, tripIdForSubmission, type Input, type LookupTask, type MailTask } from '../../../lib/trip-actions';
import { TripError, findInvitedTrip, listTrips, mutateTrip, requestActor, saveLocalTrips } from '../../../lib/trip-store';
import { tripView, type Actor } from '../../../lib/trip-view';
import { lookupVenue } from '../../../lib/venues';
import { appOrigin } from '../../auth/navigation';

function json(data: object, status = 200, headers?: Headers) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'private, no-store');
  return Response.json(data, { status, headers: responseHeaders });
}

async function views(actor: Actor, headers?: Headers) {
  return json((await listTrips(actor)).map(trip => tripView(trip, actor)), 200, headers);
}

function errors(error: unknown) {
  if (error instanceof TripError) return json({ error: error.message, warning: error.warning }, error.status);
  return json({ error: 'The trip service is temporarily unavailable.' }, 503);
}

export async function GET() {
  try {
    return await views(await requestActor());
  } catch (error) {
    return errors(error);
  }
}

async function resolveLocation(actor: Actor, tripId: string, task: LookupTask) {
  const candidates = await lookupVenue(task.venue, task.city).catch(() => []);
  await mutateTrip(actor, tripId, current => {
    const trip = access(current, actor);
    const expense = trip.expenses.find(row => row.id === task.expenseId);
    if (!expense || expense.locationVersion !== task.version || expense.lookup !== 'pending') return { result: null };
    expense.lookup = candidates.length === 1 ? 'matched' : candidates.length > 1 ? 'choose' : 'failed';
    expense.place = candidates.length === 1 ? candidates[0] : undefined;
    expense.candidates = candidates.length > 1 ? candidates : undefined;
    return { trip, result: null };
  });
}

async function deliver(request: Request, mail: MailTask, headers: Headers) {
  const invite = new URL('/invite', appOrigin(request));
  invite.searchParams.set('token', mail.token);
  headers.set('X-Invitation-Link', invite.href);
  const publicOrigin = process.env.APP_ORIGIN && invite.protocol === 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(invite.hostname);
  const result = publicOrigin ? await sendTripInvitation({
    email: mail.email, tripName: mail.tripName, memberName: mail.memberName,
    url: invite.href, idempotencyKey: 'trip-invite-' + digest(mail.token),
  }) : 'unconfigured';
  headers.set('X-Invitation-Status', result);
}

export async function POST(request: Request) {
  try {
    const actor = await requestActor();
    if (actor && request.headers.get('origin') !== appOrigin(request)) throw new TripError('Invalid request origin.', 403);
    const body = await request.json().catch(() => null) as Input | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TripError('Invalid request.');
    const headers = new Headers();
    if (body.kind === 'seed') {
      if (actor) throw new TripError('Fictional fixtures are available in local demo mode.', 403);
      const trips = await listTrips(actor);
      const fixtures = new Map(demoTrips().map(trip => [trip.id, trip]));
      const refreshed = trips.map(trip => {
        const fixture = fixtures.get(trip.id);
        if (!fixture) return trip;
        fixtures.delete(trip.id);
        const byId = new Map(fixture.expenses.map(expense => [expense.id, expense]));
        return {
          ...trip, city: trip.city ?? fixture.city,
          expenses: trip.expenses.map(expense => {
            const venue = byId.get(expense.id);
            if (!venue || expense.venue || expense.createdAt || expense.title !== venue.title) return expense;
            return { ...expense, ...{ date: expense.date ?? venue.date, venue: venue.venue, city: venue.city, place: venue.place, lookup: venue.lookup } };
          }),
        };
      });
      saveLocalTrips([...refreshed, ...fixtures.values()]);
      return await views(actor);
    }
    if (body.kind === 'accept-invite') {
      if (!actor) throw new TripError('Sign in to accept the invitation.', 401);
      const token = text(body.token);
      if (!/^[\w-]{43}$/.test(token)) throw new TripError('Invalid invitation.', 404);
      const hash = digest(token);
      const tripId = await findInvitedTrip(hash);
      if (!tripId) throw new TripError('This invitation is unavailable or has been replaced.', 404);
      const result = await mutateTrip(actor, tripId, trip => {
        const outcome = redeem(trip, actor, hash);
        return { trip: outcome.changed ? trip : undefined, result: outcome.tripId };
      });
      return json({ tripId: result });
    }

    const submission = text(body.submissionId);
    if (body.submissionId !== undefined && !/^[a-zA-Z0-9-]{1,80}$/.test(submission)) throw new TripError('Invalid submission ID.');
    const payload = Object.entries(body).filter(([key]) => key !== 'confirmed' && key !== 'submissionId');
    const fingerprint = submission ? digest(JSON.stringify(payload.sort(([left], [right]) => left.localeCompare(right)))) : '';
    const tripId = body.kind === 'trip' ? tripIdForSubmission(actor, submission) : text(body.tripId);
    const result = await mutateTrip(actor, tripId, current => {
      if (body.kind === 'trip' && !current) {
        const trip = newTrip(tripId, body, actor);
        if (submission) trip.submissions = [{ id: submission, fingerprint }];
        return { trip, result: {} as ReturnType<typeof performAction> };
      }
      const trip = access(current, actor);
      const previous = submission && trip.submissions?.find(row => row.id === submission);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new TripError('This submission ID was already used for different data.');
        return { result: {} as ReturnType<typeof performAction> };
      }
      if (body.kind === 'trip') throw new TripError('Could not create this trip.', 409);
      const outcome = performAction(trip, body, actor);
      if (submission) (trip.submissions ??= []).push({ id: submission, fingerprint });
      return { trip, result: outcome };
    });
    headers.set('X-Trip-Id', tripId);
    if (result.lookup) await resolveLocation(actor, tripId, result.lookup);
    if (result.previewInvite) headers.set('X-Invitation-Status', 'demo');
    if (result.mail) await deliver(request, result.mail, headers);
    return await views(actor, headers);
  } catch (error) {
    return errors(error);
  }
}

