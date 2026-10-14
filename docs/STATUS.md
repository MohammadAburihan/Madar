# Madar — project status

_Last updated: 14 Oct 2026_

## Done (merged into `development`)

| PR | What |
|---|---|
| #1 | Angular scaffold for web, Android and iOS; Docker release image |
| #2 | Sign-in, app shell and Home, built to the design and connected to ERPNext |
| #3 | GitHub Actions CI (format, tests, build, release image, Android build; iOS on demand) |
| #4 | Branch protection on `development` |
| #5 | **Quick sale** (customer or walk-in, items, basket, price/discount, stock check, payment, receipt) and the **Store associate** role |
| #6 | **Receive payment** (customer collections), the **Money** page (payment history) and the **sales invoice** page |

Every feature PR was built, reviewed, fixed and checked end to end on the ERPNext test site before merging.

## In progress — step 2 of 5: Move stock

**PR #7, "Add Move stock and the Inventory page"** (branch `feature/stock-transfer`) — open, CI green.

- **Working on the test site:**
  - Moving stock between warehouses, one ERPNext Stock Entry per move.
  - The Inventory page: balances per item and warehouse, low and out of stock, movement history.
  - Both on mobile and desktop, in English and Arabic.
  - The "Checking your transfer" screen after a timeout.
- **Reviews:** 9 passes. Every finding through pass 8 is fixed and pushed.
- **Pass 9 fixes (made and tested, not yet committed):**
  - Stock counts in the movement history showed a change of 0. They now show the counted balance, e.g. "Stock count: 20 Unit".
  - The browser Back button from Review reset an item the user had changed.
- **Left for step 2:**
  1. Commit and push the pass 9 fixes.
  2. Run another review pass; fix anything it finds.
  3. Merge PR #7 once a review comes back clean and CI is green.

## Not started yet

| Step | What | Notes |
|---|---|---|
| 3 | **Purchase**: order → receive goods (partial or full) → supplier invoice → pay supplier, plus the Purchasing workspace | Designs exported and studied; this is the largest step (about 12 screens) |
| 4 | **Record expense**, then **Supply a project** | Supply a project depends on stock (step 2) and purchasing (step 3) |
| 5 | **First release and server**: tag `v0.1.0`, publish `madar-web:0.1.0`, set up deployment | Decided: GitHub Container Registry; one ERPNext stack with one site per business; tag and publish `v0.1.0` after steps 1–4. Still open: AWS server size, domain/HTTPS, backups, sign-in and onboarding |
| — | **Final review** of the whole `development` branch | After step 5 |

## Open decisions (from the project overview)

- AWS server type and size, domain names, HTTPS, backups
- Authentication and onboarding of businesses and users
- VAT, invoice and numbering setup per business (Quick sale currently charges no VAT, as agreed)
