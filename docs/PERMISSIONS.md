# Madar roles and permissions

Release 1 roles, what each may do, and how they map to ERPNext. Approved defaults; change this file first when the
business rules change, then the code (`src/app/core/auth/persona.ts`, `capabilities.ts`).

## Roles

| Madar role | Who | ERPNext roles |
|---|---|---|
| **Owner** | Business owner or manager | System Manager, Accounts Manager, Sales Manager, Purchase Manager, Stock Manager, Projects Manager |
| **Salesperson** | Sells to customers and collects payments | Sales User, Accounts User |
| **Store associate** (موظف المتجر) | Sells at the counter *and* handles stock | Sales User, Accounts User, Stock User |
| **Warehouse worker** | Receives, moves, and counts stock | Stock User |
| **Purchasing officer** | Orders from suppliers and records supplier invoices | Purchase User, Stock User |
| **Project manager** | Runs projects and requests their materials | Projects User, Stock User |

Madar picks the role from the user's ERPNext roles: Owner if they have System Manager or Accounts Manager; otherwise
Store associate if they have both a sales and a stock role; otherwise Salesperson or Warehouse worker. Purchasing
officer and Project manager screens arrive with those workflows; until then they see the Owner layout limited by what
ERPNext lets them read.

## What each role may do

| Action | Owner | Salesperson | Store associate | Warehouse worker | Purchasing officer | Project manager |
|---|---|---|---|---|---|---|
| Make a sale (quick sale) | ✅ | ✅ | ✅ | — | — | — |
| Sell to the walk-in customer | ✅ | ✅ | ✅ | — | — | — |
| Give a discount | ✅ any | up to 10% | up to 10% | — | — | — |
| Change a selling price | ✅ | — | — | — | — | — |
| Receive customer payments (collections) | ✅ | ✅ | ✅ | — | — | — |
| Take payment into Cash or Card | ✅ | ✅ | ✅ | — | — | — |
| Take payment into other accounts | ✅ | — | — | — | — | — |
| See cost prices and profit | ✅ | — | — | — | ✅ | — |
| See today's money summaries | ✅ | own sales | own sales | — | — | — |
| See payment history (Money) | ✅ all | own payments | own payments | — | — | — |
| See reports (profit, money in and out, statements; Owner only, decided 14 Oct 2026) | ✅ | — | — | — | — | — |
| Add customers | ✅ | ✅ | ✅ | — | — | ✅ |
| Order from suppliers | ✅ | — | — | — | ✅ | — |
| Receive goods | ✅ | — | ✅ | ✅ | ✅ | — |
| Pay suppliers, record expenses | ✅ | — | — | — | — | — |
| Transfer, count, or adjust stock | ✅ | — | ✅ | ✅ | — | — |
| Supply a project | ✅ | — | ✅ | ✅ | — | ✅ |
| Create or edit items and prices | ✅ | — | — | — | ✅ | — |

## Enforcement

- **ERPNext** enforces which documents each role can read, create, and submit. Madar never relies on hiding a
  button for security.
- **Madar** adds the finer rules ERPNext has no per-role setting for: the 10% discount cap, price edits, and the
  allowed payment accounts. These are enforced in the app; enforcing them on the server as well needs a small ERPNext
  customization, planned for when more than one front end writes sales.
- Quick sales charge **no VAT**, the salesperson **picks the warehouse** on each sale, and anonymous sales use the
  shared **Walk-in Customer**.
