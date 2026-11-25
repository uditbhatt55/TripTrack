export function returnPath(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') ||
      value.startsWith('//') || /[\\\x00-\x1f]/.test(value)) {
    return '/dashboard';
  }
  return value;
}

export function appOrigin(request: Request) {
  return new URL(process.env.APP_ORIGIN || request.url).origin;
}

export function authRedirect(url: URL | string) {
  return new Response(null, {
    status: 303,
    headers: { Location: String(url), 'Cache-Control': 'private, no-store' },
  });
}

export function signInError(origin: string, error: string, next?: string) {
  const url = new URL('/auth', origin);
  url.searchParams.set('error', error);
  if (next) url.searchParams.set('next', next);
  return authRedirect(url);
}
