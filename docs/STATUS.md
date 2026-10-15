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
| #14 | **Supplier invoices** (step 3c-1): billing received goods with the supplier's number, the invoice page, billing on the order page and workspace |

Every feature PR was built, reviewed, fixed and checked end to end on the ERPNext test site before merging.

## In progress — step 3 of 6: Purchase

Split into PRs, each through the delivery loop:
- **3a — Purchase orders**: merged (#12). Deferred (low): the first "Save draft" isn't looked up by its reference
  after a dropped connection, so tapping it again can leave a second unsubmitted draft.
- **3b — Receive goods**: merged (#13).
- **3c-1 — Supplier invoice**: merged (#14). Deferred (low): leftover invoice drafts the purchasing officer can't
  delete, and whole-invoice paid/outstanding lines for Desk invoices that bill several orders.
- **3c-2 — Pay supplier** (this PR): the payment form with save draft, the recorded payment and its page, "Pay
  supplier" and "View payment record" on the invoice, and Home's "Pay supplier" (opens the purchasing workspace).
  Owner only.
  Review pass 1 (1 high, 1 medium, 2 low) fixed: the form never puts another invoice in place of the one opened
  (another currency, or already paid) and says why; the opened invoice is always listed; the payment page shows the
  invoice it was opened from; a timed-out draft save adopts the draft it inserted.
  Review pass 2 (2 medium, 1 low) fixed: a failed or timed-out "Save draft" ends cleanly and leaves the task usable,
  and the payment page shows the amount that paid this invoice.
  Review pass 3: "Pay supplier" no longer shows on a draft invoice. Deferred (low), as for purchase-order drafts: a
  "Save draft" whose insert times out and isn't found yet can leave a second unsubmitted draft.

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
