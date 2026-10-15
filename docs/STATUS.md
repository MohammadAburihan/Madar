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
| #7 | **Move stock** between warehouses and the **Inventory** page (balances, low/out of stock, movement history) |
| #12 | **Purchase orders** (step 3a): the Purchasing officer role, the Purchasing workspace, creating and confirming an order, the order page |
| #13 | **Receive goods** (step 3b): part or all of an order into a warehouse, the remainder later; checking a timed-out result is now guarded in every task flow; buying prices hidden from receiving roles |

Every feature PR was built, reviewed, fixed and checked end to end on the ERPNext test site before merging.

## In progress — step 3 of 6: Purchase

Split into PRs, each through the delivery loop:
- **3a — Purchase orders**: merged (#12). Deferred (low): the first "Save draft" isn't looked up by its reference
  after a dropped connection, so tapping it again can leave a second unsubmitted draft.
- **3b — Receive goods**: merged (#13).
- **3c-1 — Supplier invoice** (this PR): record the supplier's invoice for the goods received and not yet billed,
  the invoice page with its payments, billing on the order page and in the workspace panel. Owner and purchasing
  officer (Accounts User or Manager in ERPNext).
  Review pass 1 (2 medium, 3 low) fixed.
  Review pass 2 (3 medium, 2 low) fixed: totals use ERPNext's rounded total, "Billed" is the order's own share,
  only this order's rows are billed, the preview keeps taxes when rows are left out, and recording refuses to post
  when the receipts were billed elsewhere meanwhile.
  Review pass 3 (1 high, 1 medium, 1 low) fixed: a leftover invoice draft is submitted, not deleted (Accounts User
  can't delete invoices), and receipts Madar can't bill exactly (shared with another order, or several carrying fixed
  charges) are sent to ERPNext with a message instead of being billed with a wrong total.
- **3c-2 — Pay supplier**: the payment form, the recorded payment and its page, and "Pay supplier" on the invoice.
  Owner only.

Deferred from step 2 (low severity, display only): the movement history drops its oldest entry
when exactly 30 ledger rows come back, and the Inventory page ignores an `item` query change while open.

## Not started yet

| Step | What | Notes |
|---|---|---|
| 3 | **Purchase**: order → receive goods (partial or full) → supplier invoice → pay supplier, plus the Purchasing workspace | Designs exported and studied; this is the largest step (about 12 screens) |
| 4 | **Record expense**, then **Supply a project** | Supply a project depends on stock (step 2) and purchasing (step 3) |
| 5 | **Reports**: profit, money in and out, customer and supplier statements, by month or date range (overview §4.8) | Added to release 1 on 14 Oct 2026. Designed in Pencil (10 frames, EN/AR, mobile/desktop; overview, profit by month, customer statement). The Owner-only Reports entry is in the app navigation and opens a placeholder until this step. Profit needs purchasing and expenses (steps 3–4) to mean anything |
| 6 | **First release and server**: tag `v0.1.0`, publish `madar-web:0.1.0`, set up deployment | Decided: GitHub Container Registry; one ERPNext stack with one site per business; tag and publish `v0.1.0` after steps 1–5. Still open: AWS server size, domain/HTTPS, backups, sign-in and onboarding |
| — | **Final review** of the whole `development` branch | After step 6 |

## Open decisions (from the project overview)

- AWS server type and size, domain names, HTTPS, backups
- Authentication and onboarding of businesses and users
- VAT, invoice and numbering setup per business (Quick sale currently charges no VAT, as agreed)
