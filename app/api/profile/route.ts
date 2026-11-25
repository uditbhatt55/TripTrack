import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin, getViewer } from '../../../lib/supabase';
import { appOrigin } from '../../auth/navigation';

const BUCKET = 'upi-qr';
const QR_MAX_BYTES = 2 * 1024 * 1024;
const QR_URL_TTL = 60;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const UPI_ID = /^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*$/i;
type Profile = { upi_id: string | null; qr_storage_path: string | null };
type Admin = ReturnType<typeof getSupabaseAdmin>;

function json(data: object, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

function unavailable() {
  return json({ error: 'Payment profile is temporarily unavailable.' }, 503);
}

async function profileResponse(admin: Admin, profile: Profile | null) {
  let qrUrl: string | null = null;
  if (profile?.qr_storage_path) {
    const { data, error } = await admin.storage.from(BUCKET)
      .createSignedUrl(profile.qr_storage_path, QR_URL_TTL);
    if (error) return unavailable();
    qrUrl = data.signedUrl;
  }
  return json({ upiId: profile?.upi_id ?? null, qrUrl, qrExpiresIn: qrUrl ? QR_URL_TTL : null });
}

export async function GET(request: Request) {
  try {
    const viewer = await getViewer();
    if (!viewer) return json({ error: 'Sign in to view payment profiles.' }, 401);
    const query = new URL(request.url).searchParams;
    const tripId = query.get('tripId');
    const memberId = query.get('recipientMemberId');
    let userId = viewer.id;
    const admin = getSupabaseAdmin();

    if (tripId !== null || memberId !== null) {
      if (!tripId || !memberId || !UUID.test(tripId) || !UUID.test(memberId)) {
        return json({ error: 'A valid trip and recipient member are required.' }, 400);
      }
      const { data, error } = await admin.from('trip_members')
        .select('id, user_id')
        .eq('trip_id', tripId)
        .or(`user_id.eq.${viewer.id},id.eq.${memberId}`);
      if (error) return unavailable();
      const recipient = data.find((member) => member.id === memberId.toLowerCase());
      if (!data.some((member) => member.user_id === viewer.id) || !recipient?.user_id) {
        return json({ error: 'Recipient payment details are unavailable for this trip.' }, 404);
      }
      userId = recipient.user_id;
    }

    const { data, error } = await admin.from('profiles')
      .select('upi_id, qr_storage_path')
      .eq('user_id', userId)
      .maybeSingle();
    return error ? unavailable() : await profileResponse(admin, data);
  } catch {
    return unavailable();
  }
}

async function imageExtension(file: File) {
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (file.type === 'image/png' &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte)) {
    return 'png';
  }
  if (file.type === 'image/jpeg' && signature[0] === 255 &&
      signature[1] === 216 && signature[2] === 255) {
    return 'jpg';
  }
  return null;
}

export async function PUT(request: Request) {
  if (request.headers.get('origin') !== appOrigin(request)) {
    return json({ error: 'Invalid request origin.' }, 403);
  }
  try {
    const viewer = await getViewer();
    if (!viewer) return json({ error: 'Sign in to edit your payment profile.' }, 401);
    if (Number(request.headers.get('content-length')) > QR_MAX_BYTES + 16 * 1024) {
      return json({ error: 'The QR image must be 2 MB or smaller.' }, 413);
    }
    const form = await request.formData().catch(() => null);
    const rawUpi = form?.get('upiId');
    const action = form?.get('qrAction');
    const file = form?.get('qr');
    if (typeof rawUpi !== 'string' || (action !== 'keep' && action !== 'replace' && action !== 'remove')) {
      return json({ error: 'Invalid profile update.' }, 400);
    }
    const upiId = rawUpi.trim();
    if (upiId.length > 254 || (upiId && !UPI_ID.test(upiId))) {
      return json({ error: 'Enter a UPI ID in the format name@provider.' }, 400);
    }
    let replacement: { file: File; path: string } | null = null;
    if (action === 'replace') {
      if (!(file instanceof File)) return json({ error: 'Choose a QR image.' }, 400);
      if (file.size > QR_MAX_BYTES) return json({ error: 'The QR image must be 2 MB or smaller.' }, 413);
      const ext = await imageExtension(file);
      if (!ext) return json({ error: 'Choose a PNG or JPEG image.' }, 415);
      replacement = { file, path: `${viewer.id}/${randomUUID()}.${ext}` };
    }

    const admin = getSupabaseAdmin();
    const { error: initError } = await admin.from('profiles')
      .upsert({ user_id: viewer.id }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (initError) return unavailable();
    const { data: previous, error: readError } = await admin.from('profiles')
      .select('qr_storage_path')
      .eq('user_id', viewer.id)
      .single();
    if (readError) return unavailable();

    const bucket = admin.storage.from(BUCKET);
    if (replacement) {
      const { error } = await bucket.upload(replacement.path, replacement.file, {
        contentType: replacement.file.type,
        cacheControl: '0',
      });
      if (error) return unavailable();
    }

    const updates: Partial<Profile> = { upi_id: upiId || null };
    if (replacement) updates.qr_storage_path = replacement.path;
    if (action === 'remove') updates.qr_storage_path = null;
    let update = admin.from('profiles').update(updates).eq('user_id', viewer.id);
    if (action !== 'keep') {
      // Compare the observed path so a concurrent replacement cannot leave a stale reference.
      update = previous.qr_storage_path === null
        ? update.is('qr_storage_path', null)
        : update.eq('qr_storage_path', previous.qr_storage_path);
    }
    const { data: saved, error } = await update.select('upi_id, qr_storage_path').maybeSingle();
    if (error) return unavailable();
    if (!saved) {
      if (replacement) await bucket.remove([replacement.path]);
      return json({ error: 'Your profile changed. Refresh it and try again.' }, 409);
    }
    if (action !== 'keep' && previous.qr_storage_path) {
      await bucket.remove([previous.qr_storage_path]);
    }
    return json({ saved: true });
  } catch {
    return unavailable();
  }
}
