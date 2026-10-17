# Madar — project status

_Last updated: 17 Oct 2026_

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
| #23 | **Statements** (step 5b): customer and supplier statements with Share and Download PDF |
| #24 | **More page** on phones |
| #25 | Step 5 batch review fixes |
| #26 | **Playwright end-to-end suite** for every happy path |
| #27 | Project sites kept out of the sale, receipt and move pickers |

Every feature PR was built, reviewed, fixed and checked end to end on the ERPNext test site before merging.

## Sales, Contacts and Settings (in progress)

- **Sales S1 — Sales records** (this PR): the Sales page lists invoices, orders and quotations (tabs), newest 30,
  searchable by number or customer, worded as on the mock ("Confirmed · Partially paid / Goods delivered · ILS 200.00
  due"); desktop shows them as a table. Invoices open their page; orders and quotes open with S2/S3. A role ERPNext
  doesn't let read a list sees that, per tab. e2e: a walk-in sale found on Sales as paid and opened; a sale on account
  shown unpaid with the amount due, then paid after its collection; orders and quotes tabs; the list in Arabic.
  Review pass 1 (2 medium, 1 low) fixed: salespeople and store associates see only their own sales (e2e: a store
  associate finds their sale but not someone else's); outstanding is converted only when the receivable account isn't
  in the company currency; a draft invoice shows its total, nothing delivered or due.
  Review pass 2 (3 medium, 2 low) fixed: a return reads "Goods returned"; an invoice billing a delivery note counts as
  delivered; orders read ERPNext's delivery and billing states (a services-only order has no goods to deliver); a row
  opens only if it is itself openable; sales roles see "Your sales". Review pass 3 (1 medium, 2 low) fixed: an invoice
  delivered later by a delivery note made from it counts as delivered; closed and held orders say so; the "newest 30"
  hint shows only once the tab has loaded. Review pass 4 (1 medium, 1 low) fixed: payment wording follows ERPNext's
  invoice status, so an invoice settled by a credit note reads "Credit note issued", not paid; orders and quotations
  show the rounded total, as invoices do. Review pass 5 (2 low): an unreadable delivery lookup leaves the goods wording
  out; deferred: an invoice partly delivered by a delivery note made from it reads "Goods delivered".
- **Sales S1**: merged (#32). Deferred (low): an invoice partly delivered by a delivery note made from it reads "Goods
  delivered".
- **Sales S2 — Quotations**: merged (#33). Quotations made, confirmed or drafted, opened from Sales and shared
  as a PDF Madar builds (ERPNext's print formats can't reach the site's host name from the container).
- **Sales S3a — Sales orders**: merged (#34). Orders made from confirmed quotations (`ORD-…` in `utm_content`), the
  order page with ERPNext's order, delivery and invoice states, and a movable expected delivery.
- **Sales S3b — Deliver and invoice an order**: merged (#35). "Prepare delivery" on an open order chooses the warehouse
  holding most of its goods, shows "Ordered · Previously delivered" and "Available · Deliver now" per line, refuses
  more than is open or in stock there, and posts a delivery note through ERPNext's mapper (`DEL-…` in
  `utm_content`; the mapper copies the order's). Services count as delivered in ERPNext, so the form also marks their
  work done (0 by default) and the order can complete. "Create invoice" (and "Review invoice from order" after a
  delivery) reviews what ERPNext's mapper would bill, then posts it without moving stock (`INV-…` in remarks); a
  different amount at confirm time asks for a new review; a draft left behind is submitted, not deleted (invoicing
  roles can't delete Sales Invoices). New capabilities `deliverOrders` and `invoiceOrders` check the ERPNext roles
  each needs. The mock's "Save draft" on the delivery form is left out, as on the purchase receipt.
  e2e: deliver one of two trees, then the rest with the consultation done, invoice the order (ILS 320.00, unpaid)
  and see it completed; the whole order, delivery and invoice in Arabic. Review pass 1 (1 high, 3 medium) fixed: after an
  earlier delivery turns out posted, Confirm stays off until the order is reloaded; a left-behind invoice draft is
  remembered per order and rebuilt in place from what is left to bill (re-checked against the review), never
  submitted stale; the recorded invoice's outstanding is converted to the company currency. Review pass 2 (2 medium, 1 low)
  fixed: a delivery is refused as "changed" when the order has less left than confirmed (delivered in Desk); a draft
  from an earlier visit that someone posted isn't taken as this invoice; nothing left to bill at confirm asks for a
  new review. Review pass 3 (2 low) fixed: rows of the same item share the warehouse's stock; drop-shipped rows aren't
  offered for delivery.
- **Sales S4 — Returns**: merged (#36). "Return items" on a confirmed sale whose goods left with the invoice (quick
  sales, or services only) opens "Return from sale": each line reads "Sold · Returned" and "Return n × price", with a
  return quantity (1 of the first line suggested), the warehouse the goods came from, and a reason. The summary says
  the credit, the payment that stays and the new balance; a credit larger than what is owed stays on the customer's
  account (ERPNext keeps it on the note), and no cash is refunded. The credit note comes from ERPNext's return
  mapper (`RET-…` and the reason in remarks), credits the original invoice, and is refused as "changed" when
  something was returned elsewhere meanwhile; a draft left behind is rebuilt in place (selling roles can't delete
  Sales Invoices). New capability `returnSales`; PERMISSIONS.md gains its row. Invoices billed from orders (goods
  left with a delivery note) don't offer returns yet: those need a delivery return too. The mock's "Save draft" is
  left out, as on the other confirmations.
  e2e: return an unpaid planter sale (credit ILS 45.00, due 45.00 → 0.00), then nothing is left and Sales reads
  "Credit note issued"; a paid walk-in sale returned in Arabic keeps the credit for the customer. Review pass 1 (3 medium,
  1 low) fixed: a posted note is this return's result only when it returned what is asked now; the preview credits
  each row with its share of the invoice's taxes and rounding; goods sold from several warehouses go back to each
  one ("Where each item was sold from") unless one is chosen; the suggested quantity is at most what is left. Review
  pass 2 (2 medium, 2 low): the return page itself refuses sales Madar can't return (opened by URL), and POS sales
  aren't returnable (their return would refund cash); an empty row counts as 0. Review pass 3 (1 high) fixed: a part
  return takes its share of a fixed invoice discount and of "Actual" charges (ERPNext's mapper copies them whole), so
  the posted credit matches the preview (checked on v16). Review pass 4 (1 low-medium) fixed: a carried-over draft that an
  earlier task's slow submit posted asks for a reload instead of a second credit note.
- **Contacts C1 — Lists and pages**: merged (#37). Contacts lists customers and suppliers (the kinds a role works
  with; PERMISSIONS.md gains both rows), searchable by name, phone or code, each with what they owe in the company
  currency (converted per currency and rate, as on their page). A customer's page shows how to reach them, invoice
  total, amount paid (after returns) and outstanding, the latest sale, and Receive payment / Sell to (both open
  with the customer chosen). A supplier's page shows the balance and oldest unpaid invoice (cost roles only), the
  open purchase order's progress, and Buy from (opens a new order with the supplier chosen) / Pay supplier. Desktop
  is a table with a side panel (contact, what is due, actions, recent invoices and payments). e2e: find Lina, check
  her list balance matches her page, start a sale with her; open Green Clay and start an order; Arabic; desktop
  panel. Review pass 1 (1 high, 1 medium, 2 low) fixed: salespeople and store associates see their own sales and
  payments on a customer's page and in the list balances; the table has an Outstanding column only when the rows
  have balances; a deep-linked customer doesn't replace one picked meanwhile; "Buy from" keeps its supplier after a
  retried load. Review pass 2 (1 medium, 2 low) fixed: a contact page opened by link checks the role works with that
  kind (e2e: a salesperson can't open a supplier); a full list says only the first 30 show and search finds others;
  switching kinds on desktop doesn't load a detail for the previous list's row. Review pass 3 (1 medium, 1 low) fixed: "Sell to"
  replaces a customer left from an earlier visit (e2e); "Buy from" a supplier disabled meanwhile says so. Review
  pass 4 (3 low): the missing-supplier note clears once another is chosen; a settled customer's desktop card shows the
  latest sale, not "ILS 0.00 due". Deferred (low): "Sell to" a customer deleted or disabled since their page opened
  starts the sale without them and says nothing.
- **Contacts C2 — Contact form and history**: merged (#38). "Add customer or supplier" (phone) / "+ Add contact"
  (desktop) opens Add contact: type (the kinds the role may add), Name *, Phone, Email (checked, but optional: many
  ERPNext contacts have none, unlike the mock's "Email *"), Address; ERPNext's quick entry makes the primary contact
  and address, and a `CON-…` reference in the party's details makes a lost create checkable. Edit contact / Edit
  supplier writes the name onto the party and phone, email and address onto its primary Contact and Address (made
  when missing), then saves the party read afresh so its shown details refresh. New capabilities `editCustomers`
  (Sales User), `addSuppliers` (Purchase Master Manager) and `editSuppliers` (Purchase Manager too); PERMISSIONS.md
  rows updated. View transactions lists a customer's invoices, returns, payments (account, invoices settled) and
  deliveries, or a supplier's (receipts only without cost access), newest first, searchable, own sales only for sales
  roles; invoices open their page. The mock's "More options" is left out.
  e2e: add a customer (name and email checks), edit phone and address, find them in the list, empty history; Lina's
  history opens an invoice; add a supplier on desktop; a salesperson may add customers only (Arabic). Review pass 1
  (3 medium, 2 low) fixed: history still shows deliveries when invoices or payments can't be read; clearing the
  address takes it off the contact (e2e); the contact type locks once a create is sent, so checking and saving again
  stay with it; a retry after a failed edit reuses the contact and address the first try linked; deliveries
  without a header warehouse read without one. Review pass 2 (2 medium, 2 low) fixed: history swallows only a role's 403, so a lost
  connection shows the load error, not an empty history; the own-sales filter applies to customers only; credit notes
  against an invoice don't count as paid; a contact or address Madar adds is made primary at once (no adopting
  someone else's on retry). Review pass 3 (3 low) fixed: refunds aren't listed as payments; same-day records keep
  the order they were made in; a supplier name already taken says so.
- **Settings**: merged (#39). Settings (desktop nav, mobile More) replaces the placeholder with Connection settings as on
  the mock: business name, workspace address (the configured ERPNext server, or this site for the web app), currency
  with its ERPNext name, and the language; "Separate business records". Sign out (not on the mock, but nowhere else
  in Madar) ends the ERPNext session and reloads the sign-in page so nothing of the user's half-done work stays in
  memory for the next person. Not built: "Save connection settings" (nothing on the page is editable yet) and "Add
  another business" / Connect business: connecting to another workspace address is the business-connection flow,
  which depends on the open authentication and multi-site decisions (overview section 12).
  e2e: the connection facts and language switch (phone); sign out and the next person signing in (desktop). Review
  pass 1 found only lows: the currency name now clears and ignores a late answer for another currency; a stale
  sign-out notice can't outlive the page (the shell's router-outlet makes each visit a new page).
- **E2E figures**: merged (#40). `e2e/15-figures.spec.ts` reads ERPNext directly (`erp()` in `e2e/support.ts`, through the
  dev server's proxy as the signed-in owner) and checks that the screens show the same numbers: Home's confirmed sales
  today and customer invoices due; every inventory quantity against its Bin; payment amounts on Money; each invoice's
  due or total on Sales; a customer's and a supplier's balance on Contacts (desktop and phone); an invoice page's
  total, paid and outstanding; a quotation's total; a sales order's ordered and delivered quantities. It found one
  real bug, fixed here: an invoice page counted a credit note as money paid ("Amount paid ILS 45.00" on an unpaid,
  returned sale). Paid now leaves out credits (read from the credit notes against it), a "Credited by returns" row
  shows them, and a sale settled by a return reads "Payment: Credit note issued". Review pass 1 (1 medium, 3 low)
  fixed: credits count at their rounded total, as ERPNext reduces what is owed; a negative outstanding (refund still
  owed) isn't called a credit settlement; an unreadable credit list fails the page instead of counting credits as
  paid (a role's 403 still passes); the invoice-page check skips with a reason when no returned sale exists. Review
  pass 2 (1 medium) fixed: credits come from the Payment Ledger (every credit note settling the invoice, also ones
  matched to it later), not only returns made against it. Pass 3 (1 medium): a credit note matched later is a "Credit
  Note" Journal Entry in the ledger, so those count too (bank journals stay money). Pass 4 (2 low): the row reads "Credited by
  credit notes" (journals entered by hand count too). Deferred (low, from before): on an invoice in another currency
  than its receivable account, total and outstanding are in different currencies.
- **Batch review fixes**: merged (#41), from one review of everything merged since #32 (3 medium, 1 low):
  - An invoice billed from an order reads "Goods delivered" (Sales list and its page) once the order's goods left on
    a delivery note made from the order. ERPNext links the two only through the order rows (e2e).
  - The return form's "Original payment" uses the same ledger credits as the invoice page (shared `creditsAgainst`),
    so a credit note matched later or a rounded credit isn't counted as paid.
  - Sign out is refused while any task has a confirmation running or unresolved (`OpenTasksService` in core/tasks;
    every task store registers its `busy`): the reload would lose its reference.
  - "Sell to" from a customer's page fills in their balance, refuses a disabled customer, and says so when the
    customer is gone.
  - Review pass 1 (lows): order rows are read in batches of 100; "Sell to" says nothing when no business is loaded
    and never over a customer picked meanwhile. Not changed: confirmations kept in a page's own state
    (project requirement, contact create) are lost when that page is left anyway, so sign out can't make it worse.
    Deferred (low, as before): an order's invoice reads "Goods delivered" once any of its order rows delivered.
- **One business per address**: merged (#42). decided 16 Oct 2026, each business gets its own Madar web address with its
  own ERPNext backend and database on their own containers and ports (CLAUDE.md, overview §12, README "One business
  per deployment"). Settings' "Add another business" opens **Your businesses** (`/businesses`, also the shell's
  business switcher): the current business with the user's role and currency, then other businesses' addresses
  saved on this device (`KnownBusinessesService`, per origin), each with Open (blocked while a confirmation is open,
  as signing out is) and Remove, and "Add business connection" (a domain address; this business's own and repeats are
  refused). Business names of other addresses can't be read across origins, so they show as their host.
  e2e: save an address, see it after a reload, remove it in Arabic. Review pass 1 (1 medium, 1 low) fixed: saved addresses are re-checked
  when read, so a bad or script entry can't break the page or be opened; in the native apps the page says other
  businesses open in a browser (the apps' connection flow is still open). Pass 2 (lows): Cancel clears the form; this
  business's own host is refused whatever scheme is typed; a refused storage write keeps the list for the visit.
- **Connect your business**: merged (#43). decided 16 Oct 2026, on the web and in the apps the user types the business's
  Madar address first (`/connect`, as on the mock). The web confirms it is this site's address, or goes to the other
  business's address (which confirms itself there); the apps check a Madar answers (`/api/method/ping`), keep the
  address and send their requests to it (the business's Madar proxies `/api` to its ERPNext). Until connected, every
  page leads to `/connect`; sign-in has "Change business" back to it, and "Connected to …". Release builds take only
  https domain addresses; dev builds also localhost and IPs. "Your businesses" in the apps now connects to the chosen
  address. "Use invitation" is left out (invitations belong to the open onboarding decision). Madar has no sign-up
  page, so the button is on sign-in. CLAUDE.md and the delivering-features skill now require every screen change to
  be made in `docs/Madar.pen` too; this PR's are (sign-in, connect, connection settings, Your businesses, en and ar).
  e2e: connect, a wrong address, sign-in's Change business and back, signing in; Arabic, and remembered next visit. Review
  pass 1 (1 medium, 3 low) fixed: non-Latin domain names (rehan.السعودية) are accepted; the page asked for survives
  connecting and sign-in (e2e); Your businesses in the apps says why an address can't be opened and ignores a second
  tap while connecting; in the apps the connected address wins over a bundled config.json server, so what is used and
  what is shown agree. The design changes are in docs/Madar.pen (saved in Pencil). Pass 2 (1 medium, 2 low): opening a
  saved business on the web lands on its Connect screen already confirmed; an unreachable ERPNext no longer sends a
  signed-in user to Connect; Change business keeps sign-in's return page. Pass 3 (4 low): an unreachable ERPNext never records a
  connection; switching business drops the old business's return page; the previous name is cleared only when another
  address was stored; Change business waits while signing in.
- **+ New**: merged (#45). Home's "+ New" opens **Create something** (`/new`, the New action menu mock): every task the
  role may start (Quick sale, Create quotation, Buy from supplier, Receive payment, Pay supplier, Receive goods,
  Record expense, Transfer stock, Supply a project, New project, Add contact), each opening its task. The mock gained
  the four actions built since (Madar.pen, en and ar). Home's salesperson shortcuts "Customers" and "Catalog" now open
  Contacts and Inventory instead of a placeholder. e2e: owner's menu starts a quotation; a warehouse worker's, in
  Arabic, has only their tasks.
- Next (agreed 17 Oct 2026, before step 6): Workers & HR on Frappe HRMS (installed into the local ERPNext image), then
  Advanced reports and approvals; then step 6.

## Workers & HR (in progress, before step 6)

Runs on Frappe HR (`hrms` v16.51.0) added to the local ERPNext image (`scripts/build-erpnext-image.sh`,
`madar-erpnext:v16.50.0-hrms`); both local sites have it installed (backed up first). Planned as H1 workers, H2
attendance, H3 leave and approvals, H4 shifts, H5 advances, H6 payroll and salary slips, H7 timesheets, each its own PR.

- **H1 — Workers**: merged (#46). Workers (`/workers`, in the sidebar and More for roles holding HR User or HR Manager; the
  Owner now holds HR Manager) lists the business's Employees on Active and Left tabs, searchable by name, job or phone,
  each with how they are today (attendance, or approved leave "until" its end). A worker's page shows phone, department
  and joining date, attendance this month, leave left (Frappe HR's balance), advances to repay and the latest salary
  slip, each only where the role can read it. Add and edit a worker (name, gender, date of birth, job title, department,
  phone, joining date; `EMP-…` reference in the bio for a lost create); "+ New" offers Add worker. Desktop: table with
  Today and a side panel. Designs: Workers 01–03 (mobile EN/AR), Workers workspace (desktop EN/AR), Workers in the
  sidebars, More and New action menus. The seed adds holiday list assignment, departments, job titles, four workers,
  today's attendance, leave allocations and an approved leave. e2e: the list and a worker as ERPNext has them, the
  Left tab, add (with ERPNext's required fields refused first) and edit, HR-only access, Arabic, the desktop panel.
  The mock's Mark attendance and Request leave buttons come with H2 and H3.
  Review pass 1 (1 medium, 2 low) fixed: editing keeps ERPNext's first, middle and last names unless the name changed
  (then the middle name is cleared so ERPNext doesn't add it back); today's attendance reads every record of the day
  (one per shift) and a day counts once; advances in another currency are converted to the company's (by what was paid in it, `base_paid_amount`: Employee Advance has no exchange rate field, and an unknown field fails the whole read).
  Review pass 2 (1 medium, 1 low) fixed: a day with several shift records reads as its best one, matching the month's
  count; a worker of another company on the same site isn't shown, loaded or saved by link.
  Review pass 3 (4 low): fixed recent attendance listing a day once per shift; attendance and leave degrading
  separately when one is forbidden (and "not marked" only when attendance was read); desktop showing Inactive and
  Suspended without readable attendance. Deferred: a user holding only HR User or HR Manager matches no Madar role and
  falls back to the Owner's screens (ERPNext still refuses what they can't do); an HR persona is needed.
- **H2 — Attendance**: merged (#47). **Mark attendance** (`/workers/attendance`, from Workers, a worker's page and "+ New")
  lists the business's active workers who had joined by the chosen day (up to today), each Present, Absent, Half day or
  Working from home (Present preselected). Workers already marked show "Marked: …" and those on approved leave "On leave
  until …"; saving submits one Frappe HR Attendance per open row. Frappe HR allows one record a day, so a repeat after a
  lost answer reads as already marked; Check result reads the day again. Design: Workers 04 Attendance (mobile EN/AR).
  e2e: a past day marked for a worker of the run's own, checked in ERPNext, then shown as marked; future days refused;
  from a worker's page and in Arabic; closed to roles without HR; from the desktop workspace.
  Review pass 1 (3 medium, 1 low) fixed: a save sends the choices made before it and the day can't change while it
  runs; reloading the same day keeps the choices of rows still to save (a failed row isn't reset to Present); the day's
  records are read by company and date, not by a list of worker ids that would outgrow the URL; a past day lists
  workers who have left since, by relieving date.
  Review pass 2 (1 medium, 1 low) fixed: a draft attendance saved in Desk shows on its row ("Draft in ERPNext …") instead
  of leaving a row that silently can't be saved; a save's notices can't land on another day picked during its reload.
  Review pass 3 (3 low) fixed: a refused save names the workers ERPNext refused (often a missing holiday list); a 403
  checks for an expired session; the day can't be changed before the site's today is known.
- **H3 — Leave and approvals**: merged (#48). **Leave requests** (`/workers/leave`, from Workers) lists open requests
  waiting for approval (oldest first) and decided ones (newest first), searchable by worker or leave type. **Request
  leave** (`/workers/leave/new`, from a worker's page, which preselects them, the list and "+ New") offers the worker's
  allocated leave types with days left (one allocated type is chosen) and unpaid types, counts the days with Frappe HR
  (holidays aside) and shows what is left after; it sends an open Leave Application with an `LEV-…` reference after the
  reason. Too little leave and overlapping leave get their own messages. A request's page shows days requested, left now
  and left after approval; **Approve leave** or **Reject** submits it with that status, and a request already decided
  (elsewhere or by a lost answer) is shown as it stands, never decided again. Leave pages need HR User or HR Manager,
  like Workers. Design: Workers 05–07 (mobile EN/AR). e2e: request from a worker's page and approve, checked in ERPNext;
  too much leave refused, then a request rejected from the list and found under Decided; Arabic; desktop entry.
  Review pass 1 (1 medium, 3 low; one dropped: pages under the shell aren't cached) fixed: a failed read of the leave
  types shows an error with a retry instead of "no leave allocated" (only a 403 means none); types and balances are
  read as of the leave's start and follow it; a request given a status in Desk but not submitted waits, says so, and
  can be decided; a 403 checks for an expired session.
  Review pass 2 (2 low) fixed: a cancelled request reads Cancelled; switching worker clears the last worker's leave
  types at once.
- **H4 — Shifts**: merged (#49). a worker's page shows their shift on the day ("Shift: Morning · 07:00–15:00", or none
  assigned) and the next one already saved ("From 26 Oct 2026: Evening …"). **Assign shift** (`/workers/shift/new`, from a
  worker's page or desktop panel, which preselect them, and "+ New") picks one of the business's Shift Types, a start and
  an optional end, and submits a Frappe HR Shift Assignment in one write. When the worker has a shift running over the new
  start, the form says so and offers **End {shift} on {day before}** first (one `set_value` of its end date, which stays
  editable after submit and is harmless to repeat); Assign shows once nothing runs over the start. A lost answer is
  looked up among active assignments by worker, shift and start, as Shift Assignment has no field for a reference.
  Overlaps Frappe HR refuses get their own message. Seed: Morning and Evening shifts, Khaled on mornings; shift types
  are set up in ERPNext. Design: Workers 08 Assign shift and 08b (a shift running over the start), the shift lines on
  Workers 02, the desktop workspace (tabs, Mark attendance and Leave requests above the table, Mark attendance, Request
  leave, Assign shift and Open worker in the panel). e2e: assign from a worker's page (checked in ERPNext, shown on the
  page), end the running shift then assign a later one (both checked in ERPNext, the next shift shown), a same-day one
  refused; Arabic; the seeded shift on the desktop worker page.
  Review: passes 1–5 found the one-save "end the old shift and add the new one" too fragile (partial failures, lost
  answers, temporary shifts, concurrent shifts); after pass 6 it became the two explicit, repeatable steps above.
  Review pass 7 (1 high, 1 medium, 2 low) fixed: a temporary shift over a running one ends it the day before and, after
  saving, reopens the form prefilled to put it back the day after (to its old end), saying so; a shift starting on or
  after the new start is shown and Save stays hidden until Until ends the new one before it; Save waits for the worker's
  shifts to load (with an error and retry if they can't); a lost answer when ending a shift says so and that repeating
  it is harmless. Deferred: concurrent shifts at other hours stay a Desk setup; leaving the form before putting the
  regular shift back leaves that to the user.
  Review pass 8 (2 medium, 1 low) fixed: the shift the form ended is tied to that worker and start, and remembered before
  the write (a lost answer may have ended it), so the put-back form opens for the right worker only; Save is hidden from
  the moment the worker or dates change until their shifts are read again, and refuses while later shifts remain.
  Pass 9: only low. Deferred: a shift starting on the chosen From can't be removed in Madar (change it in Desk); the
  put-back form remembers one ended shift, so ending two concurrent ones (a Desk setting) brings back only the last.
- **H5 — Advances** (this PR): **Give an advance** (`/workers/advance/new`, from a worker's page and "+ New", for roles
  with HR, Expense Approver and Accounts User or Manager: the Owner, who now holds Expense Approver) records a submitted
  Employee Advance (company default advance account, `ADV-…` reference after the purpose) and pays it from the chosen
  payment account (company-currency accounts only) with the Payment Entry Frappe HR prepares, `reference_no` = the
  reference. Giving the same advance again finds what was done and finishes the rest, so "Check result" after a lost
  answer and "Pay the advance again" after a failed payment are the same call; once recorded, the details are locked.
  The worker's page then shows the advance to repay. The seed makes ERPNext's Employee Advances account receivable (as
  Frappe HR requires) and pays Khaled ILS 300. Design: Workers 09 Give advance (mobile EN/AR). e2e: an advance given
  from a worker's page, checked in ERPNext and shown as owed; the form in Arabic; closed to a salesperson.
  Review pass 1 (1 high, 1 medium) fixed: "Check result" only looks the reference up (done, recorded but not paid, or
  not given), never records or pays; locked selects are disabled (a new `disabled` input on the shared select) rather
  than ignoring changes, and the paying account stays changeable after a failed payment. Seen once: `runtime-config.spec` failed in a full run and passed twice after
  (flaky, untouched).

## End-to-end happy paths: merged (#26)

`npm run e2e` runs 33 Playwright tests (`e2e/`) against the seeded test site, through its own dev server on :4321
(`ERPNEXT_DEV_URL=http://localhost:8081`, always started fresh so it can't reach `frontend`), at phone (390 px) and desktop (1440 px) widths, one at a time in file
order because they share the site's stock (moving stock restocks the Main warehouse the sales take from): sign-in and Arabic, the More tab and role navigation; a purchase order
through receipt, supplier invoice and payment; a walk-in cash sale, a sale on account and its collection, adding a
customer mid-sale; moving stock and the inventory page; an expense with a receipt photo; a project from creation
through requirement, supply, site use and return, buying for it, the desktop workspace and editing it; reports,
profit by month, customer and supplier statements and the PDF; the project manager's, warehouse worker's, purchasing
officer's and store associate's homes; a whole sale and the reports in Arabic. Repeatable: purchases restock what
sales and supply use, and new records get unique names. Not in CI, which has no ERPNext.
Review pass 1 (1 medium, 1 low) fixed: the suite runs its own dev server on :4321 pointed at the test site and never
reuses one (a server already on :4200 may proxy to `frontend`); the collection test requires its follow-up button.
Found while looping, fixed in #27: the Project sites warehouse was offered to sell from, receive into and move
through; only the project flows (supply, use, return) touch it now. The inventory page still shows its balances.
Review pass 1 (1 medium, 1 low) fixed: a move's "Company total" reads the same before and after (both leave the site
warehouse out); a stray doc comment removed. Merged (#27).
Also found while looping, fixed in #28: Money's history put all of a day's payments before that day's expenses and
cut the list at 50, so after a busy day a just-recorded expense could be missing from the page "Done" opens; a day's
payments and expenses now interleave by when they were entered.

## Step 5 of 6 — Reports: done (#22–#25)

- **5a — Reports overview**: merged (#22). Deferred (low): an exchange-rate revaluation of a foreign-currency bank
  account counts as money in or out; a hand-made journal entry holding two unrelated payments is netted as a transfer.
- **5b — Customer and supplier statements**: merged (#23). from the reports page, pick a customer (search) or supplier
  (list) and a period; the statement shows the opening balance, each posted invoice, return, payment or journal entry
  in posting order with its running balance, and the outstanding amount, from the party ledger in the company
  currency. Invoices and supplier payments open their pages. Share and Download PDF render the statement on the ERPNext
  server (`report_to_pdf`) in the reader's language. In the phone apps (#30) both write the PDF to the app's cache and
  open the native share sheet (`@capacitor/share`, `@capacitor/filesystem`): on iOS "Save to Files" keeps a copy; on
  Android the user picks Drive or a files app from the chooser. Deferred (low): saving straight to the phone's
  Documents folder on Android (needs storage permission on Android 10 and older). No mock exists for
  the supplier statement; it follows the customer one.
  Review pass 1 (1 medium, 2 low) fixed: a share the browser refuses after the PDF renders falls back to a download;
  Retry redoes whichever step failed (the date, the supplier list, the linked party); a fully paid invoice (POS, "is
  paid" bill) stays on the statement with both sides shown. Review pass 2 (2 low): Retry now redoes every failed step;
  deferred: a disabled customer or supplier can't be picked for a statement (opening one by link still works).
- Step 5 batch review (2 medium, 2 low, #25): fixed Profit by month's Retry after a clock failure; Change cancels a statement still
  loading. Deferred (low): disabled suppliers can't be picked for a statement either. When the site's time zone can't be
  read, "today" falls back to the device's date; since #31 the shell says so, with Try again; once
  read, it says dates shown before may still follow the device until the page is opened again (no reload: it would
  lose a task's in-memory reference).
- **More page**: merged (#24). On phones the More tab lists the role's destinations the tab bar doesn't hold (Purchases,
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
