import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type Viewer = { id: string; email: string | null };

export function isSupabaseAuthConfigured() {
  return Boolean(url && publishableKey);
}

export async function getSupabaseAuth() {
  if (!url || !publishableKey) throw new Error('Supabase Auth is unavailable.');
  const jar = await cookies();
  return createServerClient(url, publishableKey, {
    cookieOptions: { httpOnly: true, sameSite: 'lax' },
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try {
          for (const { name, value, options } of values) jar.set(name, value, options);
        } catch {
          // Server Components can read cookies. Use a Route Handler to persist refreshes.
        }
      },
    },
  });
}

export async function getViewer(): Promise<Viewer | null> {
  if (!isSupabaseAuthConfigured()) return null;
  const client = await getSupabaseAuth();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email_confirmed_at ? data.user.email ?? null : null };
}

export function getSupabaseAdmin() {
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error('Supabase server access is unavailable.');
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

