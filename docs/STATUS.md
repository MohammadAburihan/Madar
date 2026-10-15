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
| #15 | **Pay suppliers** (step 3c-2): the payment form with save draft, the recorded payment and its page; step 3 (Purchase) is complete |

Every feature PR was built, reviewed, fixed and checked end to end on the ERPNext test site before merging.

## In progress — step 4 of 6: Record expense, then Supply a project

- **4a — Record expense** (this PR): category (an operating expense account), amount, date, account, an optional
  project and receipt photo, then review and record. The expense is a Journal Entry from the expense account to the
  cash or bank account, with the project on the expense row and the receipt attached after recording. Expenses join
  the Money page's history; its "Pay supplier" and "Record expense" shortcuts now open the real tasks. Owner only.
  Review pass 1 (1 medium, 1 low) fixed: a task form reopened after its result was shown (browser Back) starts a new
  task instead of editing the recorded one (expense, and the receipt, supplier invoice and supplier payment forms), and
  a new expense's receipt is always attached.
- **4b — Supply a project.**

Deferred from step 3 (low): a timed-out first "Save draft" that isn't found yet can leave a second unsubmitted draft
(purchase orders, supplier payments); a leftover invoice draft the purchasing officer can't delete stays in ERPNext;
for a Desk invoice billing several orders, the order page's paid/outstanding lines are the whole invoice's.

Deferred from step 2 (low severity, display only): the movement history drops its oldest entry
when exactly 30 ledger rows come back, and the Inventory page ignores an `item` query change while open.

## Not started yet

| Step | What | Notes |
|---|---|---|
| 5 | **Reports**: profit, money in and out, customer and supplier statements, by month or date range (overview §4.8) | Added to release 1 on 14 Oct 2026. Designed in Pencil (10 frames, EN/AR, mobile/desktop; overview, profit by month, customer statement). The Owner-only Reports entry is in the app navigation and opens a placeholder until this step. Profit needs purchasing and expenses (steps 3–4) to mean anything |
| 6 | **First release and server**: tag `v0.1.0`, publish `madar-web:0.1.0`, set up deployment | Decided: GitHub Container Registry; one ERPNext stack with one site per business; tag and publish `v0.1.0` after steps 1–5. Still open: AWS server size, domain/HTTPS, backups, sign-in and onboarding |
| — | **Final review** of the whole `development` branch | After step 6 |

## Open decisions (from the project overview)

- AWS server type and size, domain names, HTTPS, backups
- Authentication and onboarding of businesses and users
- VAT, invoice and numbering setup per business (Quick sale currently charges no VAT, as agreed)
