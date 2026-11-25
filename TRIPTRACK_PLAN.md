# RED Trip Splitter — TripTrack

## The situation

Six friends take a trip. One books the stay, another pays for transport, and only some people share dinner. After the trip, bill screenshots and partial repayments make it hard to tell who owes whom. TripTrack gives the group a shared expense ledger, a map of where they spent, and a settle-up list.

## What we are building

| Layer | Deliverable |
|---|---|
| Data | Five fictional group trips with 20–40 expenses each. Each bill captures who paid, how much, for whom, and the category. Compute top spending categories and who pays most often. |
| Backend API | Create trips, add members and expenses, split equally among all or selected members, return balances and settlement suggestions, and record external payments. |
| Creative UI | Aim for ten-second routine expense entry. Show who owes what, explain how it was calculated, and make it easy to settle up. Use the Splitwise screenshots as workflow references for groups, expenses, and activity. |

## Levels

- **Level 1 — Qualify.** Create a trip, members, and expenses in the UI. The API returns correct balances and a settle-up list that clears them.
- **Level 2 — Optimize.** Support splits among a subset and demonstrate the fewest possible transfers. During the sprint, the exact solver targets up to eight members with nonzero balances. Label larger results as suggestions.
- **Level 3 — Your twist.** Lead with Explain My Balance and the shared expense map. Add duplicate and high-spend warnings, Sponsor, Waive off, and uploaded UPI details.

## Data and insights

Generate five repeatable fictional trips with 20, 24, 28, 32, and 36 expenses. Use fictional names, venues, amounts, and payment details. Sum expense amounts by category and count expenses by payer. Bring one computed insight to the pitch.

## Creative UI and feature requirements

### Trips and expenses

The owner creates a trip, adds named members, and invites friends to link their Google accounts. Expenses record the payer, creator, date, category, amount, participants, and optional venue and city. Split equally among all members or a selected subset. The payer can be outside the split. The trip page has Expenses, Map, Balances, and Activity.

### Automatic shared Leaflet map

After saving or editing a venue, resolve its name and city or address. A clear match creates a pin automatically. Let the user select a branch if several match. If lookup fails, keep the expense and offer retry. On address edits, clear the old coordinates and ignore late results for superseded addresses. A pin shows who paid, amount, venue, description, and date to signed-in trip members. Example: **Dev paid ₹2,000 at Taj Hotel, Mumbai**. The payer can differ from the member who entered the bill. Use fictional locations for judge data.

### Sponsor and waive

For a ₹1,200 bill split equally between Dev, Isha, and Kabir, each share is ₹400.

- Sponsor at entry: Dev covers Isha’s share. Isha owes ₹0 and Kabir still owes ₹400.
- Waive after entry: Dev forgives Isha’s outstanding ₹400. Dev’s receivable and Isha’s liability fall by ₹400. The original bill amount and Kabir’s share stay the same.
- Only the payer can issue a waiver. Record it once per expense and member. For the sprint, allow waivers only before the first recorded settlement in a trip because recorded payments are trip-level.
- Dev and the other trip members can see the waiver in activity. Isha sees her updated balance and current due, with the waiver event, badge, and notification excluded. Filter her activity, expense, and explanation responses on the server.

### Profile and external UPI payments

The profile owner enters a UPI ID and uploads their existing QR image from their UPI app. Accept PNG or JPEG up to 2 MB. Allow preview, replace, and remove. Display the uploaded image as supplied. Serve it using a short-lived authorized URL and keep the bucket private.

On Settle up, show the recipient’s UPI ID, uploaded QR, and amount separately. The friend scans or copies the ID and pays in their own UPI app. **Record payment** adds a manual ledger entry afterward. Viewing a QR does not change balances. Use fictional payment details for the demo.

### Warnings and Explain My Balance

- Duplicate: same trip and amount, date within one day, and matching normalized description or venue. Check across payers. Example: “A similar ₹1,200 dinner expense already exists. Please verify.” Offer Cancel and Save anyway.
- High spend: with at least three previous bills in the category, flag an amount at least 3× the median and ₹1,000 above it. With less history, flag ₹5,000 or more. Show why.
- Explain My Balance: show exact expense shares and recorded payments. Use deterministic templates. AI phrasing is optional.

## Backend API and ledger

| Table | Fields |
|---|---|
| profiles | user_id, upi_id, qr_storage_path |
| trips | id, owner_user_id, name, destination_city |
| trip_members and trip_invites | trip_id, member name, optional linked account, expiring invite |
| expenses | trip_id, payer_member_id, created_by_user_id, amount_paise, category, date, description, original and effective shares, venue, city, coordinates, lookup status |
| waivers | expense_id, waived_member_id, payer_member_id, amount_paise, timestamp |
| settlements | trip_id, sender, recipient, amount_paise, payment date, recorded_by |

Implement trip, members/invite, expense create/edit, waive, settlement, and profile payment routes. Trip reads return viewer-filtered expenses, activity, map markers, balances, explanations, and suggested payments. Authorize every request, validate same-trip references, and use stable submission IDs for retries. Check waiver eligibility and create it in a single transaction, serialized with settlement recording.

Store integer paise. Allocate leftover paise by stable member order and persist exact shares. Balance equals **expense payments − effective shares + settlements sent − settlements received + waivers received − waivers granted**. The group total must equal zero.

For the gate, match debtors and creditors and verify that all suggested transfers clear the ledger. For Level 2, find the maximum number of zero-sum subsets partitioning up to eight nonzero members using bitmask memoization. Minimum transfers equal nonzero members minus the number of groups. Above the cap use the baseline suggestion mode.

## Stack and setup

Use Next.js App Router, TypeScript, Tailwind, and Route Handlers. Use Supabase PostgreSQL, Google sign-in through Supabase Auth, and private Supabase Storage for uploaded QR images. Use Leaflet with an attributed basemap and a server-side geocoder that permits storing and displaying the results. Run locally for judging and deploy to Vercel if time permits.

Scaffold with `npx create-next-app@latest triptrack --ts --tailwind --eslint --app --src-dir --use-npm`. Install `@supabase/supabase-js`, `@supabase/ssr`, `leaflet`, and `@types/leaflet`. Test the Google callback on localhost. Set database and geocoding credentials server-side. If OAuth stalls, keep a local-only fictional demo mode for the gate.

## Team roles

| Role | Responsibility |
|---|---|
| Product lead and integrator | Agree on the API and fixture in the first 15 minutes. Wire the demo together. |
| Data analyst | Generate the five trips and verify category totals and payer counts. |
| Backend developer | Implement the routes, ledger, and settle-up algorithms. |
| UI designer | Build trip creation, bill entry, map, balances, and profile. |
| Quality and pitch lead | Test the gate fixture and feature access rules. Maintain the prompt log and rehearse the pitch. |

## Two-hour build order

| Minutes | Deliverable |
|---|---|
| 0–15 | Scaffold, agree API and fixture, start Auth and schema. |
| 15–50 | Trip and members, expense entry, subset splits, balances, suggested transfers. Generate seed data in parallel. |
| 50–75 | Explanations and recorded payments. In parallel, shared account access, venue lookup, Leaflet map. |
| 75–90 | Rehearse the gate with a blank trip. Verify results and seed insights. |
| 90–110 | QR profile, sponsorship, waiver privacy, and warnings. If targeting Level 2, prioritize the exact solver. |
| 110–120 | Access checks, prompt log, and three-minute pitch. |

The full scope is a stretch for two hours. Protect the judging gate first and parallelize independent features.

## Rules

The event allows any language, framework, and AI tool. Use fictional data throughout the judge demo. Keep the exact AI prompt, what the AI got wrong, the fix, and how it was verified. In-app AI is optional.

## The gate at 90 minutes

Dev pays ₹6,400 stay split among Dev, Isha, Kabir and Mira, ₹1,200 dinner split between Isha and Kabir, and ₹2,400 cab split among all four. The balances are **Dev +₹7,800, Isha −₹2,800, Kabir −₹2,800, Mira −₹2,200**. After Isha records a ₹400 payment to Dev, her explanation is **₹1,600 + ₹600 + ₹600 − ₹400 = ₹2,400 due**.

Verify that duplicate cancellation does not change balances, ₹6,000 triggers the sparse-history warning, and retrying a submission does not duplicate it. Verify that two accounts see the same map pin, venue edits change the pin, only trip members can see the recipient QR, and the waived friend’s API view excludes the waiver event. Check a ₹100 three-way split yields ₹33.34, ₹33.33, and ₹33.33.

## Three-minute pitch

1. **0:00–0:30** — Introduce the group-trip problem and show one computed data insight.
2. **0:30–2:15** — Enter a bill, show its map pin and payer, explain Isha’s ₹2,400, and show an uploaded demo UPI QR.
3. **2:15–3:00** — Show the best prompt, the actual mistake, and the verification that caught it.
