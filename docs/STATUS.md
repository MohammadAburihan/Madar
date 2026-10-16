# Madar — project status

_Last updated: 16 Oct 2026_

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
| #16 | **Record expense** (step 4a): category, amount, date, account, optional project and receipt photo; expenses in the Money history |
| #17 | **Projects** (step 4b-1): the list, creating and editing a project, its overview and material requirements; the Project manager persona |
| #18 | **Supply a project** (step 4b-2): plan an item, send stock to the project site, buy the shortfall booked to the project |
| #19 | **Site use and returns** (step 4b-3): materials at site, recording use, returning unused stock |
| #20 | **Desktop project workspace** (step 4b-4): tasks table, movement ledger per item, site stock and records |
| #21 | Step 4 batch review fixes |
| #22 | **Reports overview** (step 5a): profit and money in and out by period and month |

Every feature PR was built, reviewed, fixed and checked end to end on the ERPNext test site before merging.

## In progress — step 5 of 6: Reports

- **5a — Reports overview**: merged (#22). Deferred (low): an exchange-rate revaluation of a foreign-currency bank
  account counts as money in or out; a hand-made journal entry holding two unrelated payments is netted as a transfer.
- **5b — Customer and supplier statements** (this PR): from the reports page, pick a customer (search) or supplier
  (list) and a period; the statement shows the opening balance, each posted invoice, return, payment or journal entry
  in posting order with its running balance, and the outstanding amount, from the party ledger in the company
  currency. Invoices and supplier payments open their pages. Share and Download PDF render the statement on the ERPNext
  server (`report_to_pdf`) in the reader's language. On the phone apps Share and Download need the native share and
  file plugins (`@capacitor/share`, `@capacitor/filesystem`), not added yet: a dependency to decide. No mock exists for
  the supplier statement; it follows the customer one.
  Review pass 1 (1 medium, 2 low) fixed: a share the browser refuses after the PDF renders falls back to a download;
  Retry redoes whichever step failed (the date, the supplier list, the linked party); a fully paid invoice (POS, "is
  paid" bill) stays on the statement with both sides shown. Review pass 2 (2 low): Retry now redoes every failed step;
  deferred: a disabled customer or supplier can't be picked for a statement (opening one by link still works).
- **More page** (this PR): on phones the More tab lists the role's destinations the tab bar doesn't hold (Purchases,
  Contacts, Money, Projects, Reports, Settings, Switch business), following the same role rules as the desktop sidebar.
  "Items & services" from the mock is left out until that area exists.

## Step 4 of 6 — Record expense, then Supply a project: done (#16–#21)

Batch review of step 4 (2 medium, 5 low): fixed that a failed requirements or site-stock read no longer shows an empty
project (only a role that can't read stock sees none), a timed-out project create asks to check its result before
saving again, the ledger signs a return from the site as −, Home's supply action follows the supply capability, and
opening the supply plan without access creates no warehouse. Its review (1 medium, 3 low) fixed that the edit form,
saved page and requirement form read only the project record, so a stock failure can't block them; a check that finds
the lost project saves the latest edits over it; an expired session during the check goes back to sign-in; and only a
lost insert (not a failure before it) asks for a check. Deferred (low): a requirement draft whose submit failed is
not deleted when the user leaves; Money doesn't say when the expense list failed to load.

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
