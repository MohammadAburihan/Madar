# Madar — مدار
## Project overview and first-release scope

Version: 1.2  
Date: 12 October 2026  
Purpose: A shared product brief for design, development, and scope decisions.

This document records the agreed product direction. It describes requirements, not completed implementation. Detailed interface patterns remain design proposals until reviewed.

## 1. What is Madar?

Madar is a simple business-management application connected to ERPNext. It gives users clear, task-focused screens for everyday work while ERPNext remains responsible for business records, inventory, accounting, and backend rules.

**Main purpose: Make daily business operations easy to manage from a phone or laptop.**

Madar should help users answer:
- What products and services do we offer?
- What stock do we have, and where is it?
- What did we sell or buy?
- Who owes us money, and whom do we owe?
- What do our projects need, and how much have they cost?

Madar is an independent, generic brand. Initial businesses include Rehan Nursery, Issam for building equipment, and a padel business. The product should also be suitable for unrelated customers in the future.

## 2. Platforms and languages

| Requirement | Direction |
|---|---|
| Mobile applications | Android and iOS |
| Website | Responsive experience for laptops, desktops, and mobile browsers |
| Languages | English and Arabic with complete right-to-left support |
| Backend | ERPNext, with a separate installation for each business |
| Design workspace | pen.dev/Pencil |
| Connectivity | Online-first for release 1 |
| Frontend framework | Angular, with Ionic and Capacitor for Android and iOS (see section 9.2) |
| Development | Frontend developed locally on the team's development machine |
| Deployment | Each release is shipped as a versioned Docker image running on an AWS server |
| Backend hosting | ERPNext runs as Docker containers on the AWS server |

Mobile layouts should emphasize touch-friendly actions and short forms. Desktop layouts should support efficient navigation, tables, search, and keyboard use. Both should provide the same underlying business capabilities.

## 3. Businesses, users, and access

A business connection represents a separate ERPNext installation. Users may connect to multiple businesses, but must always know which business is active.

- Connect using a workspace address or invitation, then sign in.
- Add and switch between authorized business connections.
- Keep records, searches, payments, stock, drafts, and permissions isolated by business.
- Save unfinished work in its original business before switching.
- Show modules and actions according to user permissions.
- Enforce access in the backend as well as the interface.

Target roles include owners/managers, sales staff, purchasing staff, warehouse staff, and project managers. These are product personas; exact permission sets still need definition.

**A business is not a project.** A nursery is a business; installing a customer's garden or expanding the nursery is a project within that business.

## 4. Main areas for release 1

| Main area | Main purpose | Core actions |
|---|---|---|
| Items & Services | Maintain what the business sells, buys, or uses | Browse, search, create, edit, categorize, price, and view stock |
| Customers & Suppliers | Manage business relationships and balances | Add contacts, view history, sell, buy, collect, and pay |
| Sales | Sell products and services | Quote, order, deliver, invoice, quick sell, and return |
| Purchasing | Buy products and services | Order, receive, record supplier invoices, and return |
| Inventory & Warehouses | Track available stock and movements | Check, transfer, count, adjust, issue, and record losses |
| Payments & Expenses | Track money received and paid | Collect, pay suppliers, allocate payments, record expenses, and attach receipts |
| Basic Projects | Organize customer and internal work and costs | Create, budget, assign tasks, request/supply materials, record consumption, and track costs |

### 4.1 Items & Services

Include:
- Name, description, photo, category, item code, and optional barcode.
- Units, buying/selling prices, and simple variants where needed.
- Stock availability by warehouse for stocked items.
- Search and filtering.
- Permission-controlled visibility of costs and price editing.

Services do not require a stock quantity or warehouse. Keep uncommon settings under additional options.

### 4.2 Customers & Suppliers

Include:
- Names, contact information, and addresses.
- Transaction history.
- Outstanding invoices and balances.
- Quick customer/supplier creation while entering a transaction.
- Shortcuts to sales, purchases, collections, and supplier payments.

Use “Supplier” for providers of both goods and services.

### 4.3 Sales

Include:
- Quick sales.
- Quotations and sales orders.
- Partial/full deliveries.
- Sales invoices.
- Paid, partially paid, and unpaid sales.
- Permitted discounts and price changes.
- Returns linked to the original transaction.
- Receipt/invoice viewing and sharing.

A quick sale should require only relevant information. Larger orders may use separate quotation, order, delivery, and invoice steps.

### 4.4 Purchasing

Include:
- Purchase orders for goods and services.
- Partial/full receipt of goods.
- Recording completion of purchased services where relevant.
- Supplier invoices.
- Purchase returns.
- Ordered, received, billed, and outstanding quantities.
- Links to related projects and payments.

Receiving goods, recording a supplier invoice, and paying the supplier are separate events.

### 4.5 Inventory & Warehouses

Include:
- Stock balances by item and warehouse.
- Warehouse records and item movement history.
- Transfers between warehouses.
- Stock counts and adjustments with reasons.
- Damage and loss recording.
- Material issues and unused-material returns for projects.
- Low-stock indicators.

Moving stock changes its location. Consuming stock records its use. These must remain distinct actions.

### 4.6 Payments & Expenses

Include:
- Customer collections.
- Supplier payments.
- Allocation to one or more invoices.
- Partial payments and remaining balances.
- Operating expenses with category, date, amount, and payment account.
- Optional project links.
- Receipt attachments and transaction history.
- Selection of the relevant cash/bank account.

Show invoice total, amount paid, and outstanding amount separately. Recording a payment does not imply online card processing; a payment-gateway integration is not part of the agreed release.

### 4.7 Basic Projects

| Project type | Example | Key information |
|---|---|---|
| Customer project | Install a customer's garden | Customer, agreed work, budget, tasks, materials, costs, and linked sales |
| Internal project | Expand a warehouse or build a court | Budget, tasks, materials, purchases, services, expenses, and progress |

Include:
- Name, description, type, status, and dates.
- Customer where applicable.
- Budget and recorded costs.
- Simple tasks, assignees, and due dates.
- Material requirements and shortages.
- Supplied quantities, consumed quantities, and unused returns.
- Linked purchases, services, expenses, and sales records.
- Attachments and progress.

Project-site stock remains available stock until consumed or otherwise issued. Task assignment is included; full HR, payroll, and detailed labor costing are deferred.

## 5. Primary user workflows

| Workflow | Main steps |
|---|---|
| Quick sale | Select customer/walk-in option → add items/services → review quantities/prices → choose payment outcome → confirm → receipt/invoice |
| Purchase | Select supplier → add items/services → create order → record partial/full receipt → enter supplier invoice → pay when applicable |
| Customer collection | Select customer → choose unpaid invoices → enter amount → allocate payment → select account → confirm |
| Stock transfer | Select source/destination → select items and quantities → review → confirm |
| Project supply | Open requirements → supply available stock or purchase shortage → track site delivery → record consumption/returns |
| Expense | Select category → enter amount/date/account → optionally select project → attach receipt → review → save |

Confirmation screens should explain what is being created or finalized. The exact ERPNext document mappings must be verified during implementation.

## 6. Home and navigation

Home should prioritize quick actions and pending work over large numbers of charts.

Primary shortcuts:
- Sell.
- Buy.
- Receive payment.
- Pay supplier.
- Record expense.
- Transfer stock.
- Supply a project.

Proposed mobile navigation: **Home, Sales, Stock, More**, with a clearly labeled **New** action.

Proposed desktop navigation: **Home, Sales, Purchases, Inventory, Contacts, Money, Projects, Settings**.

Items & Services can live within Inventory, provided service-only businesses can access the catalog naturally. Navigation should adapt sensibly to permissions and enabled areas.

Home summaries and simple area-specific overviews are included. A full advanced reporting/analytics module is not part of release 1.

## 7. UX and shared requirements

- Plain wording, clear verbs, and one obvious primary action per screen.
- Searchable selectors and sensible defaults.
- Short forms with advanced options disclosed when needed.
- Save drafts and preserve input while navigating.
- Separate draft/final document status from payment and fulfillment status.
- Loading, empty, validation, permission, connection, and session-expiration states.
- Transaction history and receipt/document attachments where relevant.
- Configurable currency and locale-aware formatting; use ILS only as sample data.
- Arabic/English parity, including error messages and accessibility labels.
- Accessible contrast, keyboard focus, touch targets, text scaling, and screen-reader semantics.
- If confirmation times out, check transaction status before encouraging another submission.

Offline transaction completion and synchronization are outside release 1.

The starting visual direction is a light theme with deep teal, warm neutral backgrounds, restrained status colors, and readable Arabic/English typography. The approved design document should guide final styling.

## 8. Backend and implementation boundaries

- ERPNext will be introduced as part of the project; it was not already deployed when scope was agreed.
- Each business will use a separate installation.
- Madar should use supported backend APIs and preserve backend validation and permissions.
- Keep accounting, stock valuation, and authoritative business rules on the backend.
- Add custom backend methods only where needed for simplified workflows.
- Do not duplicate business data across installations through business switching.
- The ERPNext version, authentication approach, and exact API mappings remain to be selected. The frontend stack and hosting are defined in section 9.

Technical details should stay out of daily user flows unless users need them to make a decision.

## 9. Development and deployment

### 9.1 Development
- The frontend is developed locally on the team's development machine, in the Madar git repository.
- `development` is the default branch.
- Each release is marked with a version tag in git (for example `v1.0.0`).
- ERPNext for development runs locally in Docker using the official Frappe Docker setup (`frappe_docker`, started with `docker compose -f pwd.yml up -d`), so testing never touches business data on the AWS server.

### 9.2 Frontend stack and structure
One Angular codebase serves the website and the Android and iOS apps.

| Layer | Choice |
|---|---|
| Framework | Angular (TypeScript), standalone components and signals |
| Mobile apps | Capacitor wraps the same app for Android and iOS |
| Mobile-style UI | Ionic for Angular where native-feeling navigation and controls matter |
| Forms | Angular typed reactive forms |
| Translation | Runtime English/Arabic switching with full RTL |
| Web hosting | Static build served by nginx in the release Docker image |

The code follows the **container/presenter** pattern:
- **Containers** load and change data through services, hold screen state, and handle navigation. They pass data down to presenters and react to their events.
- **Presenters** only display what they receive and report user actions. They do not call services, the backend, or the router, which keeps them simple to reuse and test.
- Code is organized by business area (Sales, Purchasing, Inventory, and so on), with shared presenters and core services (sign-in, active business, backend access) kept separate.

### 9.3 Release images
- Every release produces a new Docker image of the web frontend.
- The image tag matches the release version (for example `madar-web:1.0.0`). Deployments always use a specific version tag, never only `latest`.
- Images are built for the AWS server's CPU architecture. The development machine (Apple Silicon) may differ from the server (often x86_64).
- Released images are immutable: a fix becomes a new version, not a rebuilt image under an existing tag.
- Configuration that differs per environment (backend addresses, keys) is supplied when the container starts, not built into the image.

### 9.4 AWS server
- The frontend container and the ERPNext backend containers run on the AWS server.
- ERPNext runs from Docker images (based on the official Frappe/ERPNext Docker setup), with its database, cache, and workers as containers.
- Each business remains a separate ERPNext installation (site) with isolated data, as required in section 8.
- Business data (database and uploaded files) lives in persistent volumes and is backed up. Deploying a new frontend image must never affect backend data.
- Previous image versions remain available so a release can be rolled back.

### 9.5 Mobile apps
The Docker image covers the web frontend. Android and iOS apps are distributed through the app stores and connect to the same ERPNext backend.

## 10. Future areas — outside release 1

| Future area | Potential purpose |
|---|---|
| Workers & HR | Attendance, shifts, leave, advances, payroll, and detailed time tracking |
| Workshop & Production | Work orders, input materials, outputs, waste, and labor |
| Nursery Operations | Growth batches, repotting, care tasks, and plant losses |
| Bookings & Reservations | Court availability, reservations, cancellations, and deposits |
| Rentals | Equipment availability, checkout, return, and deposits |
| Assets & Maintenance | Tools, vehicles, equipment custody, repairs, and maintenance |
| Service Jobs | Specialized installation, repair, and maintenance dispatch |
| Delivery Management | Driver assignment and delivery confirmation |
| Advanced reporting and approvals | Deeper analytics and configurable approval workflows |

Warehouse management is included in release 1. A broader branches/locations module for sales points, workshops, and staffing is future scope.

A padel business can use release 1 for general operations; court scheduling and bookings require the later module.

## 11. Design and release validation

Before implementation handoff:
- Verify mobile and desktop coverage for every agreed area.
- Verify complete English and Arabic/RTL flows.
- Connect prototype interactions where the design tool supports them.
- Label unsupported interactions and simulated external actions.
- Keep design canvas sections organized without unintended frame overlap.
- Preserve component references and prototype links during layout cleanup.

Before release:
- Verify the six primary workflows end to end.
- Verify company/installation isolation and role permissions.
- Verify partial deliveries, partial payments, returns, and draft recovery.
- Verify that movements, consumption, billing, and payments remain distinct.
- Run accessibility checks on the actual application.
- Verify that the release image runs on the AWS server against the ERPNext containers.

Design inspection does not establish runtime accessibility. Completion of external pen.dev work and runtime checks has not been independently verified in this brief.

## 12. Open decisions

- ERPNext version.
- Container registry for release images (for example Amazon ECR or Docker Hub).
- AWS server type and size, domain names, HTTPS/reverse proxy, and backup policy.
- One ERPNext setup hosting multiple business sites versus a separate container stack per business.
- Whether image build and deployment are manual or automated (CI/CD).
- Authentication and onboarding method.
- Detailed role/permission matrix.
- Business-specific tax, invoice, and numbering configuration.
- Exact transaction mappings and backend customization needs.
- Walk-in customer policy and warehouse defaults.
- Priorities within the agreed seven-area release.

Use this document as the product baseline. New modules or major actions should be treated as explicit scope changes.

