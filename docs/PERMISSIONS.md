# Madar roles and permissions

Release 1 roles, what each may do, and how they map to ERPNext. Approved defaults; change this file first when the
business rules change, then the code (`src/app/core/auth/persona.ts`, `capabilities.ts`).

## Roles

| Madar role | Who | ERPNext roles |
|---|---|---|
| **Owner** | Business owner or manager | System Manager, Accounts Manager, Sales Manager, Purchase Manager, Stock Manager, Projects Manager, HR Manager, Expense Approver, Item Manager, Sales Master Manager |
| **Salesperson** | Sells to customers and collects payments | Sales User, Accounts User |
| **Store associate** (موظف المتجر) | Sells at the counter *and* handles stock | Sales User, Accounts User, Stock User |
| **Warehouse worker** | Receives, moves, and counts stock | Stock User |
| **Purchasing officer** | Orders from suppliers, receives goods, and records supplier invoices | Purchase User, Stock User, Accounts User, Item Manager |
| **Project manager** | Runs projects and requests their materials | Projects User, Stock User |

Madar picks the role from the user's ERPNext roles: Owner if they have System Manager or Accounts Manager; otherwise
Purchasing officer if they have Purchase User or Purchase Manager; otherwise Project manager if they have Projects User or
Projects Manager and no sales role; otherwise Store associate if they have both a sales and a stock role; otherwise
Salesperson or Warehouse worker.

Supplying a project reads the project, which ERPNext allows only Projects User or Manager. A store associate who
supplies projects therefore also needs **Projects User**; a warehouse worker given Projects User becomes a Project
manager, who supplies projects too. Roles that only supply see the project without its budget and costs, and can't
edit it. The plan reads the stock ledger, which v16 opens to Stock User and Accounts Manager but not Stock Manager.

Selling to a customer project needs both selling and reading the project, so it sits on the project page: the Owner, and a
store associate who holds Projects User. A salesperson has no project page in Madar, so no entry point, even though ERPNext lets Sales
User read projects. Only the Owner sees the project's billed total; the others see their own sales to it.

Workers & HR runs on Frappe HR (the `hrms` app) and is added to a role rather than being one: any user who holds
**HR User** or **HR Manager** sees, adds and edits workers, whatever their Madar role. Without one, not even the Owner does:
Frappe HR opens Employees to those roles only, so the Owner holds HR Manager. Advances stay with the Owner, like paying suppliers: Frappe HR lets only Expense Approver submit an Employee Advance, and paying it is a Payment Entry, so the Owner also holds Expense Approver. Attendance, leave, advances and pay show
only where the user's ERPNext roles can read them.

The purchasing officer holds **Accounts User** because ERPNext v16 lets only Accounts User/Manager create supplier
invoices (decided 14 Oct 2026). Accounts User could also record payments in ERPNext; Madar still keeps paying suppliers
to the Owner.

## What each role may do

| Action | Owner | Salesperson | Store associate | Warehouse worker | Purchasing officer | Project manager |
|---|---|---|---|---|---|---|
| Make a sale (quick sale) | ✅ | ✅ | ✅ | — | — | — |
| Quote, take sales orders, deliver and invoice them | ✅ | ✅ | ✅ | — | — | — |
| Take back sold items against their invoice (credit note, no cash refund) | ✅ | ✅ | ✅ | — | — | — |
| Sell to the walk-in customer | ✅ | ✅ | ✅ | — | — | — |
| Give a discount | ✅ any | up to 10% | up to 10% | — | — | — |
| Change a selling price | ✅ | — | — | — | — | — |
| Receive customer payments (collections) | ✅ | ✅ | ✅ | — | — | — |
| Take payment into Cash or Card | ✅ | ✅ | ✅ | — | — | — |
| Take payment into other accounts | ✅ | — | — | — | — | — |
| See cost prices and profit | ✅ | — | — | — | ✅ | — |
| See today's money summaries | ✅ | own sales | own sales | — | — | — |
| See payment history (Money) | ✅ all | own payments | own payments | — | — | — |
| See reports (profit, money in and out, statements, breakdowns; Owner only, decided 14 Oct 2026) | ✅ | — | — | — | — | — |
| See customers and what they owe (Contacts) | ✅ | ✅ | ✅ | — | — | ✅ |
| See suppliers (Contacts; their balances only with cost prices) | ✅ | — | ✅ | ✅ | ✅ | — |
| Add customers and edit their contact details (including the optional About text) | ✅ | ✅ | ✅ | — | — | ✅ |
| Add or edit suppliers, including the optional About text (ERPNext needs Purchase Master Manager to add, Purchase Manager to edit) | ✅ | — | — | — | ✅ | — |
| Contact bank details: see, add and edit a customer's or supplier's bank, IBAN and account number (a Bank Account in ERPNext; needs Accounts User or Accounts Manager, and only the Owner has it by default) | ✅ | — | — | — | — | — |
| Add a bank that isn't in the list while entering bank details (a Bank record; ERPNext lets only System Manager create one) | ✅ | — | — | — | — | — |
| Deactivate or reactivate customers and suppliers (the roles that edit each kind; history and balances stay) | ✅ | ✅ customers | ✅ customers | — | ✅ suppliers | ✅ customers |
| Order from suppliers | ✅ | — | — | — | ✅ | — |
| Receive goods | ✅ | — | ✅ | ✅ | ✅ | — |
| Record supplier invoices | ✅ | — | — | — | ✅ | — |
| Pay suppliers, record expenses | ✅ | — | — | — | — | — |
| Transfer, count, adjust, or add stock without buying it (opening stock, grown or made here; cost per unit only for roles that see costs) | ✅ | — | ✅ | ✅ | — | — |
| Create and edit projects and their material requirements | ✅ | — | — | — | — | ✅ |
| Supply a project, record its site use and return unused stock | ✅ | — | ✅ | ✅ | — | ✅ |
| Sell to a customer project (a quick sale billed to the project; quotations and sales orders can't carry a project in ERPNext) | ✅ | — | ✅ | — | — | — |
| Add or edit items and services (Items & services; ERPNext needs Item Manager) | ✅ | — | — | — | ✅ | — |
| Set an item's selling price when adding or editing it (needs Sales Master Manager, and System Manager or Sales Manager to read the selling price list) | ✅ | — | — | — | — | — |
| See, add and edit workers (Workers & HR; needs HR User or HR Manager) | ✅ | with HR role | with HR role | with HR role | with HR role | with HR role |
| Give workers an advance, paid from a payment account (needs HR, Expense Approver and Accounts User or Manager) | ✅ | — | — | — | — | — |
| Approvals inbox (leave waiting, and steps ERPNext's workflows let the user's roles take) | ✅ | with HR role | with HR role | with HR role | with HR role | with HR role |
| See and set salaries, make and confirm salary slips (Pay; needs HR User or HR Manager, as in ERPNext) | ✅ | with HR role | with HR role | with HR role | with HR role | with HR role |
| Log a worker's hours (Timesheet; needs HR User or HR Manager, and a readable Activity Type, which HR Manager has) | ✅ | with HR role | with HR role | with HR role | with HR role | with HR role |
| Change or remove item lines while a task is open (quantity, price and discount within the rules above) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Delete a draft (one they could make; salesperson and store associate their own sales drafts; only where ERPNext lets their roles delete it) | ✅ | own | own | own | own | own |
| Cancel a confirmed record (ERPNext reverses its stock and money; it stays as Cancelled) | ✅ | — | — | — | — | — |
| Cancel and edit (amend) a confirmed record: a corrected copy to confirm again | ✅ | — | — | — | — | — |
| Open ERPNext Desk from Settings (only where the business has a Desk address; ERPNext still decides what the user may do there) | ✅ | — | — | — | — | — |
| Use the assistant (looks things up with the user's own access; its proposals open the normal task filled in, and nothing is written until the user confirms there) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Enforcement

- **ERPNext** enforces which documents each role can read, create, and submit. Madar never relies on hiding a
  button for security.
- **Madar** adds the finer rules ERPNext has no per-role setting for: the 10% discount cap, price edits, and the
  allowed payment accounts, and who sees buying prices. Store associates and warehouse workers receive goods by
  quantity only: purchase rates, order values and supplier balances are hidden from them (ERPNext's Stock User can
  still read order rates through the API). These are enforced in the app; enforcing them on the server as well needs a small ERPNext
  customization, planned for when more than one front end writes sales.
- Confirmed records are never edited or deleted, in Madar or ERPNext: they are **cancelled**, and "Cancel and edit"
  opens a corrected copy (ERPNext's amend, linked through `amended_from`). A cancel ERPNext refuses because a later
  record depends on it (a payment against an invoice, a receipt of an order) shows that record, to cancel first;
  Madar never cancels a chain on its own (decided 20 Oct 2026).
- The assistant reads ERPNext with the signed-in user's own session, and is offered only the lookups the role's rules
  allow: sales figures and invoices for roles that sell (salespeople and store associates see their own sales only),
  customers for roles that see Contacts, drafts for roles that sell or order, purchase orders for roles that order or
  receive, and buying prices and order values only for roles that see costs. It changes nothing itself: it may propose a
  quick sale or quotation (roles that sell; walk-in only where walk-in sales are allowed), a purchase order (roles that
  order purchases), collecting a payment (roles that collect), a stock move (roles that move stock) and opening a record
  (roles that can read it). A proposal opens the same task a user would open, filled in, and the user confirms there
  with that task's own rules; a typed price counts only for a role that may set prices (buying prices: roles that see
  costs), and a discount is never proposed.
- Quick sales charge **no VAT**, the salesperson **picks the warehouse** on each sale, and anonymous sales use the
  shared **Walk-in Customer**.
