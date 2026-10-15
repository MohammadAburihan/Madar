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
| #16 | **Record expense** (step 4a): category, amount, date, account, optional project and receipt photo; expenses in the Money history |

Every feature PR was built, reviewed, fixed and checked end to end on the ERPNext test site before merging.

## In progress — step 4 of 6: Record expense, then Supply a project

- **4a — Record expense**: merged (#16).
- **4b — Projects and supplying them**, in three PRs:
  - **4b-1 — Projects** (this PR): the list, creating and editing a customer or internal project, and its overview
    (budget against actual cost, next tasks, material requirements against available stock, attachments, linked
    records), plus adding a material requirement. Owner and the new Project manager persona (Projects User or
    Manager without a sales role).
    Review pass 1 (2 high, 3 medium, 3 low) fixed: the Project manager persona exists; a changed requirement draft is
    replaced, never submitted stale; editing never saves over a project that didn't load; linked amounts are in the
    company currency and a split expense counts only its project's share; dated tasks come first; requirements count
    in the stock unit; Projects is hidden from roles that don't run them.
    Review pass 2 (1 high, 2 medium, 3 low) fixed: linked order and expense amounts are hidden from roles that don't
    see costs; the project type is set only where the site has it under that name (setup names them in its language);
    requirements count what is still to deliver and skip stopped requests; tasks are left out for roles that can't
    read them; a slow earlier load can't fill another project's edit form; small attachments show in KB.
    Review pass 3 (1 medium, 2 low) fixed: creating a project is safe to repeat (a reference in its notes is looked up
    before inserting), fully delivered requirements leave the overview, and customer names are fetched in batches.
    Review pass 4 (2 medium, 1 low) fixed: remaining needs subtract the delivered quantity in the stock unit (transfer
    requests only), a retried save writes the latest details over the project it finds, and a rounded quantity
    still matches its draft.
    Review pass 5 (3 low): two fixed (the list loads once the session recovers; an unassigned task shows only its date).
    Deferred: a project with 20 or more undated open tasks shows only those as next tasks.
  - **4b-2 — Supply**: send available stock to the project site and buy the shortfall.
  - **4b-3 — Site use and returns**, and the desktop project workspace.

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
