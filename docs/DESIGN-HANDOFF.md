# Madar — مدار design handoff

## Status

Pencil is connected. The document now contains 254 editable screen frames: 127 English and 127 Arabic, plus foundations, product structure, implementation notes, and 80 reusable components/state patterns/shared task bodies. Screens retain the approved visual system and linked component instances.

Native clickable wiring is blocked by the exposed Pencil API. Route annotations are not clickable interactions. Runtime checks: **not run—requires runnable application**.

Current deliverables: [completion matrix](COMPLETION-MATRIX.md), [interaction contract](INTERACTION-CONTRACT.md), [route manifest](interaction-routes.json), [Arabic glossary](LOCALIZATION-GLOSSARY.md), and [accessibility audit](ACCESSIBILITY-AUDIT.md).

Editable document: `/Users/mohammadrehan/.pencil/documents/5809b391-3c80-4388-8b90-f78cc6e10e32/untitled.pen`

The canvas is the primary deliverable. This file records scope, assumptions, validation, and remaining work. Preview images are supplementary exports, not substitutes for editable screens.

## Verified connection

The user enabled the Pencil MCP connection and restarted Codex. App state confirmed the open document and sign-in. The schema and design instructions were inspected before editing. Keep the document open for further canvas work.

Official setup: https://docs.pencil.dev/getting-started/installation

The current tool schema has no prototype transition API. Button layer contexts and canvas interaction notes explicitly describe destinations and state changes. Clickable prototype wiring remains pending tool support.

## Document organization

1. Product structure and user flows.
2. Design foundations.
3. Reusable components.
4. Mobile screens.
5. Desktop screens.
6. Full Arabic counterparts of every English screen.
7. Interaction and implementation notes.
8. Arabic reusable components and states.
9. Completed workflow gaps and current-state details.
10. Accessibility and localization contract.
11. Shared desktop task panels.

## Proposed information architecture

| Surface | Navigation | Behavior |
| --- | --- | --- |
| Mobile | Home, Sales, Stock, More; labeled New action | More contains Purchases, Contacts, Money, Projects, Items & Services, and Settings according to access. |
| Desktop | Home, Sales, Purchases, Inventory, Contacts, Money, Projects, Settings | Items & Services lives under Inventory, with direct catalog access from Home/New for service businesses. |
| Connection | Connect business, Sign in, Connected businesses, Connection settings | Keep workspace/server details here. Show the active business throughout daily work. |

Hide unavailable modules and actions. For limited roles, retain useful destinations and prioritize permitted work. A service-only configuration uses Catalog in place of an irrelevant Stock destination. No inactive placeholder tabs.

## Created design coverage

| Group | Editable screens and variants created |
| --- | --- |
| Foundations | Teal brand, warm neutral surfaces, readable English/Arabic typography, spacing, borders, focus, status colors, currency formatting, responsive and RTL rules. |
| Components | Navigation; buttons; fields; search and filters; product/service, customer, and supplier selectors; item rows; quantity controls; money fields; totals; separate document/payment/delivery status labels; tables and mobile lists; dialogs; sheets; notifications; reusable transaction detail structure. |
| Business connections | Workspace address or invitation; sign-in; business list; add connection; switch business; save draft in original business or stay; connection failure; expired session and recovery. |
| Home | 390 px mobile and 1440 px desktop; owner, salesperson, and warehouse-worker views; pending tasks; drafts; restrained summaries; Sell, Buy, Receive payment, Pay supplier, Record expense, Transfer stock, and Supply a project as permitted. |
| Catalog | Search/filter list; stock item details with warehouse balances; service details without stock fields; add/edit item or service; simple variants; More options. |
| Quick sale | Customer or permitted walk-in; item/service selector; quick customer creation preserving basket; quantities and permitted price/discount edits; stock and fulfillment warehouse; review; paid/partially paid/unpaid; payment account; confirmation; receipt/invoice and sharing. |
| RTL | All127 English screens have Arabic counterparts, including desktop, dialogs, selectors, notifications and state patterns. Layout/order/alignment are mirrored; identifiers remain literal. Runtime bidi isolation is specified for implementation. |
| States | Loading; empty list; no results; inline validation; permission restriction; connection loss; session expired; saved draft; unsaved changes; insufficient stock; success; unresolved confirmation. |

Mobile sale steps use full-screen task flows and persistent totals where useful. Desktop uses a searchable catalog and basket split view with keyboard-friendly forms. Confirmation explains the records and stock/payment effects before finalizing.

## Responsive and accessibility assumptions

- Use representative 390 px mobile and 1440 px desktop frames.
- At 320–389 px, wrap names and labels, stack form columns, and keep totals and primary actions visible without horizontal page scrolling.
- At intermediate/tablet widths, use a collapsible navigation rail and stack split views when minimum content widths no longer fit.
- Use at least 44–48 px touch targets, visible keyboard focus, readable contrast, and status text alongside color.
- Treat RTL as a complete layout. Preserve natural direction for codes and numeric amounts; do not truncate essential transaction values.

## Expanded flows after visual inspection

| Area | Connected workflow |
| --- | --- |
| Sales | Quotations, sales orders, deliveries, invoices, and returns linked to the original sale. Keep quick sale available without mandatory order stages. |
| Purchasing | Supplier → items/services → purchase order → partial/full receipt → supplier invoice → payment. Show ordered, received, billed, and outstanding quantities. Receiving, invoicing, and paying remain distinct events. |
| Contacts | Customer/supplier search and creation; contacts and addresses; history and balances; Sell, Buy, Receive payment, and Pay actions; quick creation during transactions. |
| Inventory | Warehouse balances; movement history; source/destination transfer → item quantities → review → confirmation → details; counts and adjustments; damage/loss; low stock; project issues. Distinguish movement from consumption/loss. |
| Customer collection | Customer → unpaid invoices → amount → allocation → cash/bank account → review → confirmation. Show invoice value, paid amount, and remaining balance. |
| Expenses | Category → amount/date/account → optional project → receipt attachment → review → save. Include payment and expense history. |
| Projects | Customer/internal overview; budget and recorded actual costs; tasks, assignees, dates, progress, attachments, linked records; requirements → supply available stock or purchase shortfall → delivery to site → consumption → unused returns. Keep site stock separate from consumption. |

Add partial delivery and partial payment patterns using the same components. Keep document status independent from delivery and payment status.

## Material product decisions and assumptions

1. Each connection maps to one operating company in a separate ERPNext installation. Scope records, search, baskets, balances, drafts, and notifications to that connection. Never carry a transaction across businesses or show combined financial totals.
2. Use fictional data. The primary sample business is Rehan Nursery with ILS; other examples include Issam and a padel business. Branding and workflows stay generic. Currency is configurable per business.
3. Stocked products require a fulfillment warehouse and availability. Services never require stock quantities or warehouses. Walk-in use and price/cost visibility follow permissions.
4. Role examples illustrate permitted work, not a finalized permission matrix. Owner, salesperson, and warehouse staff need representative navigation and Home views.
5. Save draft and final confirmation are separate actions. Business switching during editing offers to save in the original business or stay in the task.
6. A timeout after confirmation leaves the outcome unresolved. Offer Check result and preserve the operation context. Do not invite blind resubmission or imply offline completion/synchronization.
7. HR, payroll, production, nursery growth, bookings, rentals, and advanced accounting are outside this release.

## Integrated transaction decisions

- Purchase order PO-2048 uses 10 POT-30 ceramic planters at ILS 45.00. Receive 6 into Main warehouse, record PINV-0068 (supplier reference GC-8831) for ILS 270.00, then separately pay ILS 100.00 from Main bank. Invoice balance is ILS 170.00. Existing-invoice links open confirmed details rather than the recording form.
- Quick sale SI-1042 totals ILS 320.00 and receives ILS 120.00 in Main cash, leaving ILS 200.00. The collection flow records a second ILS 120.00 as PAY-0156, bringing cumulative payments to ILS 240.00 and leaving ILS 80.00. A separate post-collection invoice screen shows both payments.
- Expense EX-0091 pays ILS 36.50 from Main cash. Recording an expense does not increase cash.
- Project PRJ-018 supplies 8 of an original 12-planter requirement. Linked PO-2049 orders the shortfall of 4. Of the 8 supplied, 5 are consumed, 2 returned, and 1 remains at site. Returns prompt review of remaining requirements; returned units are not counted as consumed or still supplied.
- Back from a finalized transaction exits to its detail/list and closes the task. It never reopens a preserved confirmation form for resubmission. Back while editing preserves input and invokes the appropriate unsaved-change guard.

## Verification completed and remaining

Rendered and inspected the initial coherent set before expansion. Expanded screens were rendered section by section. Independent review findings were resolved: visible 48 px Back controls, visible mobile business switch controls, existing invoice routes, and safe navigation after confirmation. Corrected expense cash direction and reconciled sample codes, warehouses, invoice references, and payment totals. Fixed actual panel overflow in purchasing and project desktop views. Top-level frames were checked for overlap and completed placeholders were cleared.

Structural bounds reporting produces floating-point and disabled-descendant false positives; visual renders and actual parent extents were used alongside it. Keyboard, screen-reader, and runtime behavior are specified but cannot be tested in this design document.

Current audit covers all254 screen frames: no material enabled-node overflow, no annotated target below48×48px, no unresolved static destination IDs, and no currency variable tokens remain. Audited screen text contrast is at least5.16:1. Functional input boundaries were strengthened to at least3:1. Visual inspection was sampled; see the accessibility audit for exact scope.

Current entry points: mobile English Lqpaw / Arabic cB7Nm; desktop English Pd5Js / Arabic C9G6N. Search these layer IDs in Pencil. The previous Arabic sample roots were replaced.

Remaining blockers: native clickable transitions require a supported interaction API or prototype tool; runtime accessibility requires a runnable application. Desktop task states reuse canonical bodies inside the retained desktop shell; only representative desktop task compositions are drawn individually. Authentication, camera, uploading, scanning and sharing remain identified prototype stubs. No live backend is connected.
