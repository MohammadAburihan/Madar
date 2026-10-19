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
| Add customers and edit their contact details | ✅ | ✅ | ✅ | — | — | ✅ |
| Add or edit suppliers (ERPNext needs Purchase Master Manager to add, Purchase Manager to edit) | ✅ | — | — | — | ✅ | — |
| Order from suppliers | ✅ | — | — | — | ✅ | — |
| Receive goods | ✅ | — | ✅ | ✅ | ✅ | — |
| Record supplier invoices | ✅ | — | — | — | ✅ | — |
| Pay suppliers, record expenses | ✅ | — | — | — | — | — |
| Transfer, count, or adjust stock | ✅ | — | ✅ | ✅ | — | — |
| Create and edit projects and their material requirements | ✅ | — | — | — | — | ✅ |
| Supply a project, record its site use and return unused stock | ✅ | — | ✅ | ✅ | — | ✅ |
| Add or edit items and services (Items & services; ERPNext needs Item Manager) | ✅ | — | — | — | ✅ | — |
| Set an item's selling price when adding or editing it (needs Sales Master Manager, and System Manager or Sales Manager to read the selling price list) | ✅ | — | — | — | — | — |
| See, add and edit workers (Workers & HR; needs HR User or HR Manager) | ✅ | with HR role | with HR role | with HR role | with HR role | with HR role |
| Give workers an advance, paid from a payment account (needs HR, Expense Approver and Accounts User or Manager) | ✅ | — | — | — | — | — |
| Approvals inbox (leave waiting, and steps ERPNext's workflows let the user's roles take) | ✅ | with HR role | with HR role | with HR role | with HR role | with HR role |
| See and set salaries, make and confirm salary slips (Pay; needs HR User or HR Manager, as in ERPNext) | ✅ | with HR role | with HR role | with HR role | with HR role | with HR role |
| Log a worker's hours (Timesheet; needs HR User or HR Manager, and a readable Activity Type, which HR Manager has) | ✅ | with HR role | with HR role | with HR role | with HR role | with HR role |

## Enforcement

- **ERPNext** enforces which documents each role can read, create, and submit. Madar never relies on hiding a
  button for security.
- **Madar** adds the finer rules ERPNext has no per-role setting for: the 10% discount cap, price edits, and the
  allowed payment accounts, and who sees buying prices. Store associates and warehouse workers receive goods by
  quantity only: purchase rates, order values and supplier balances are hidden from them (ERPNext's Stock User can
  still read order rates through the API). These are enforced in the app; enforcing them on the server as well needs a small ERPNext
  customization, planned for when more than one front end writes sales.
- Quick sales charge **no VAT**, the salesperson **picks the warehouse** on each sale, and anonymous sales use the
  shared **Walk-in Customer**.
