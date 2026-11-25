# Three-minute judging walkthrough

- **0:00–0:30** — Describe six friends sharing a trip. Load the fictional trips, open Coral Bay, and point to the computed top category and most frequent payer in **Trip insights**.
- **0:30–1:15** — Create a blank Coral Bay trip with Dev, Isha, Kabir, and Mira. Use the first three bills below or prepare the fixture before presenting. Open **Map** to see the hotel pin with Dev’s payment and venue.
- **1:15–2:15** — Open **Balances** and record Isha’s ₹400 repayment to Dev. Open Isha’s explanation to show ₹1,600 + ₹600 + ₹600 − ₹400 = ₹2,400 due. Open a suggestion’s payment details to display the fictional demo QR, or use a fictional QR uploaded to a configured test profile.
- **2:15–3:00** — Show the prompt and regression below, then run or show the passing automated tests.

| Bill | Amount | Payer | People sharing it | Venue |
| --- | ---: | --- | --- | --- |
| Stay | ₹6,400 | Dev | Dev, Isha, Kabir, Mira | Lantern Lodge |
| Dinner | ₹1,200 | Dev | Isha, Kabir | Driftwood Cafe, choose a branch |
| Cab | ₹2,400 | Dev | Dev, Isha, Kabir, Mira | Copper Kite Cabs |

Confirm the high-spend warning for Stay. The prepayment balances are Dev +₹7,800, Isha −₹2,800, Kabir −₹2,800, and Mira −₹2,200.

## Prompt log

> do integerate testing and e2e testing

The first automated integration run found that replaying a recorded ₹400 payment created a second payment. The local starter generated a new record for every POST. The fix stores a stable submission ID and a fingerprint with successful writes. Integration coverage resends an identical payment and expense, then checks that each appears once and that the balances remain correct.

> i am seeing there is no option to add member email also and it should be sent to mail of that person you are added this project what to do there is no map addition and other featurea thatr in planmd file so complete and change the theme accordingly so that the out template and inner template matches and no sign in feature is there so complete plan

The earlier dashboard left the sign-in and payment profile routes disconnected, and the local ledger lacked email invitations and map actions. Browser tests now navigate through **Members**, **Map**, **Activity**, and **Sign in with Google**. Integration tests cover mapped venue edits, sponsorship, waiver visibility, and transactional revision checks. Use two configured Google accounts for the live invitation and UPI access rehearsal.
