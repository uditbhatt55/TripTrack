import 'server-only';

export async function sendTripInvitation(input: {
  email: string;
  tripName: string;
  memberName: string;
  url: string;
  idempotencyKey: string;
}): Promise<'sent' | 'unconfigured' | 'failed'> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.TRIPTRACK_INVITE_FROM?.trim();
  if (!apiKey || !from) return 'unconfigured';

  const tripName = input.tripName.replace(/[\r\n]+/g, ' ').trim();
  const memberName = input.memberName.replace(/[\r\n]+/g, ' ').trim();
  const text = [
    `Hi ${memberName},`,
    '',
    `You've been invited to join ${tripName} on Splittrack.`,
    '',
    'Open this link to accept your invitation:',
    input.url,
    '',
    'If you weren’t expecting this invitation, you can ignore this email.',
  ].join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
        'User-Agent': 'Splittrack/1.0',
      },
      body: JSON.stringify({
        from,
        to: [input.email],
        subject: `You're invited to ${tripName} on Splittrack`,
        text,
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    void response.body?.cancel().catch(() => undefined);
    return response.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
