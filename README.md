# Splittrack

Run `npm ci` and `npm run dev`, then open the Local URL printed by Next.js. The local demo includes five fictional trips with 140 expenses, maps, balance explanations, settlement suggestions, and activity. Create a trip to try expense editing, subset splits, sponsorship, waivers, warnings, and external repayments. The demo ledger lives in `.triptrack-data.json`.

[Shared trips setup](DATABASE_SETUP.md) covers Google sign-in, email invitations, the Supabase migrations, real venue lookup, and private UPI QR storage. See [the project plan](TRIPTRACK_PLAN.md) and [the judging walkthrough](JUDGING.md).

## Automated tests

Run `npm test` for both suites. Use `npm test -- --project=integration` or `npm test -- --project=e2e` to run one suite. Tests start an isolated local server on port 3012 with a temporary ledger. Integration tests also execute the shared migrations against in-process PostgreSQL. Windows defaults to installed Microsoft Edge. On other platforms, install Chromium with `npx playwright install chromium`. Set `TRIPTRACK_TEST_BROWSER` to choose an installed Playwright channel.
