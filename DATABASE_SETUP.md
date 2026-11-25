# Supabase setup for Splittrack

1. Create a Supabase project. In **SQL Editor**, run `supabase/001_initial.sql` once against the new project.
2. Verify the seven tables appear in Table Editor and the `upi-qr` bucket appears in Storage as private with a 2 MB upload limit.
3. In Google Cloud, configure the OAuth consent screen and create a Web application client. Copy the callback from Supabase’s Google provider settings into Google’s authorized redirect URIs. If Google OAuth is in testing mode, add the team's test Google accounts.
4. In Supabase **Authentication → Sign In / Providers → Google**, enable Google and enter its client ID and secret. In **Authentication → URL Configuration**, allow `http://localhost:3000/auth/callback` for development. Add the deployed app callback when the deployment host is known.
5. Share the project URL and publishable key with the app developer. Store the server secret key in a private environment value. Keep the Google client secret in the Supabase provider settings and leave secrets out of Git and chat.
6. The starter currently uses local demo data. Auth callback handling, Supabase persistence, and server-side QR access are the next integration step. Database tables have RLS enabled and no browser policies. The future server routes must verify the caller’s session and trip membership before using privileged credentials.

Planned local variables for the integration: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`.
