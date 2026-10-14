# Madar completion matrix

Updated 14 October 2026. The Pencil document contains **264 editable screen frames: 132 English + 132 Arabic**, with **80 reusable components/shared task bodies**. Every English screen has an Arabic counterpart. The two earlier Arabic samples were replaced, avoiding duplicate Home/review screens.

**Native clickable wiring: blocked for every screen.** Pencil's exposed schema and execute API provide no node-to-node transition, click event, overlay or interaction API. Layer contexts and the route manifest are specifications, not clickable wiring. No click-through test was claimed.

**Runtime for every row: not run—requires runnable application.** Repository inspection found design documents and previews, with no app source or package manifest. No substitute app was created.

## Workflow completion

| Workflow | English + Arabic design coverage | Desktop presentation | Wiring / runtime |
| --- | --- | --- | --- |
| Connect / sign in / invitation / recovery / switching | All corresponding screens, scoped draft guard, visible language action | Existing connection workspace + shared sign-in task | Annotated; native blocked / not run |
| Home / New / More / drafts | Owner, salesperson, warehouse, 320 px and tablet | Desktop Home and 1024 rail | Annotated; native blocked / not run |
| Catalog / item / service creation and editing | List/details; type-aware service form with no stock fields | Catalog workspace + shared item task | Annotated; native blocked / not run |
| Quick sale | Customer, items, basket, price/discount, stock error, paid/partial/unpaid review and corresponding outcomes, unresolved | Catalog/basket workspace and review; subsequent canonical task bodies stay in desktop host | Annotated; native blocked / not run |
| Purchasing | PO review/confirm, 6/10 receipt, remaining4 receipt, 10/10 outcome, supplier invoice and separate payment | Purchasing workspace + shared PO task; receipt/invoice/payment bodies reuse host | Annotated; native blocked / not run |
| Customer collections | Invoice allocation120, review, PAY-0156, cumulative240/due80 detail | Money workspace + shared collection task | Annotated; native blocked / not run |
| Expenses | Category/date/account, optional project/receipt, review and result | Money workspace + shared expense task | Annotated; native blocked / not run |
| Inventory | Transfer, count, damage, separate reviews/results and current balance snapshots | Inventory workspace + shared transfer task | Annotated; native blocked / not run |
| Reports | Overview (period, profit, money in and out by month, statements), profit by month, customer statement with PDF share; Reports entry in More | Reports workspace (period, key figures, by-month table) + customer statement; Reports added to the desktop navigation | Annotated; native blocked / not run |
| Projects | List/create/edit; requirements, issue8, consume5, return2; PO-2049 receive4 then separate issue4; internal project | Project workspace + shared project form | Annotated; native blocked / not run |
| Contacts | Customer/supplier list/detail/history; explicit supplier edit | Contacts workspace + shared contact task | Annotated; native blocked / not run |
| Quotes/orders/delivery/linked returns | QT-0084 → SO-0187; delivery independent from SI-1043; sale/supplier credit outcomes | Canonical task/detail bodies render in desktop host | Annotated; native blocked / not run |
| Selectors / validation / permissions / connection / unsaved changes | English and Arabic components + shared selection/error/guard screens; origin and business preserved | Same body/dialog contract in desktop host | Annotated; native blocked / not run |
| Auth / camera / scanner / upload / sharing | Explicit device/service preview; manual barcode alternative; no real service action | Same stub contract | Simulated specification; native blocked / not run |

Desktop avoids duplicating every task state: eight representative desktop task frames reuse the exact form bodies. Route contexts explicitly retain the desktop host and sidebar when rendering canonical mobile task/detail bodies. Those later desktop compositions are a rendering contract, not independently drawn desktop variants of every state.

## Screen-by-screen parity

“Design checked” means palette, enabled-node bounds, minimum annotated target dimensions, counterpart presence and route destinations checked across the document. Visual screenshot inspection was sampled; see ACCESSIBILITY-AUDIT.md. All wiring columns below mean annotations only, blocked from native activation.

| Screen | EN ID | AR ID | Mobile wiring | Desktop wiring | Design a11y | Runtime | Tool limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 04 Mobile / 01 Connect business | xR27d | ZoFml | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / 02 Sign in | uF3Qx | iHsFE | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / 03 Connected businesses | XBVPW | SOqwG | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / 04 Switch while editing | Ravkg | XtOdQ | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / 05 Connection and session recovery | VyL0w | X4pbZ | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Connect Invitation | xjYER | fEdiN | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Connection settings | n2NC0h | SSPnt | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Home Owner | Lqpaw | cB7Nm | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Home Salesperson | xdios | zjT7A | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Home Warehouse | nY8Mq | Oa8Lc | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / New action menu | UJ4TG | KdTYW | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Drafts | hJseP | f0you | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / More navigation | yqgux | gGafI | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Catalog Items and Services | h08BHE | f5dDgL | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Catalog Item detail | o6Tct | cfjBm | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Catalog Service detail | uh6se | I2nORI | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Catalog Add edit | Wj8ai | A9g50X | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Quick sale 01 Customer | LZt1B | H7SYD | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Quick sale 02 Items | j792NO | pXJRK | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Quick sale 03 Basket | MNbv4 | xA2Bo | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Quick sale 04 Review and payment | aC31k | sYHhU | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Quick sale 05 Receipt | bAV42 | k9FKL | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Quick sale Unresolved | jQPbr | T3UYCt | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Quick sale Quick customer | b0TkP | DAGZ9 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Quick sale Price and discount | OPXEM | ewgkO | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Quick sale Insufficient stock | cCehV | BHSYH | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Quick sale Payment Paid | wXJWa | x3egbP | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Quick sale Payment Unpaid | t0AjEk | gYxEN | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Contacts Customer list | H5rpKX | Z1UL8 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Contacts Customer detail | E5NfVx | Z9Owk | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Contacts Supplier detail | wpsEe | f7rLiJ | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Contacts Add edit | ylrkE | WpA39 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Contacts History | oLs2q | M7y1J4 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Sales Records | qk3We | Wnz61 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Sales Quotation | gLucp | j2MTn | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Sales Order | u9Nym9 | eA6TR | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Sales Delivery | P6HSJO | ANJy6 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Sales Linked return | cPZ8m | kdetS | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Purchase Linked return | mGQFo | q5I1MS | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 05 Desktop / Home Owner | Pd5Js | C9G6N | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 05 Desktop / Quick sale workspace | sEKfr | E4QuO | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 05 Desktop / Quick sale review | Q0sRT8 | Atd8Q | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 05 Desktop / Catalog and item detail | tVJtO | vOXMP | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 05 Desktop / Contacts workspace | d95Ab | OsP1D | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 05 Desktop / Connect business | DVtBp | oLb4F | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 05 Desktop / Tablet Home 1024 | QfZBs | L80c2 | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Small phone 320 | AXx2G | N54vu | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Sales Invoice after collection | q7SU4x | Mui1s | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Purchase 01 Create PO | CHgyq | d0V8Km | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Purchase 02 Confirmed | nrQjb | Ydw4Q | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Purchase 03 Receive items | x0Kvl | HMUsT | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Purchase 04 Supplier invoice | Zyn4v | T2Vfzb | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Purchase 05 Payment recorded | qm6my | zZ31b | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Purchase Invoice recorded | k7Ai6 | pRAr1 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Purchase Order review | yiMgW | TtUbk | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Purchase Confirmed invoice detail | dVsdv | EYiPX | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Purchase Received order detail | D7PZet | QeNQN | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Money 01 Receive payment | K0MB7 | ViEoW | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Money 02 Collection recorded | AUBZL | PiyDI | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Money 03 Supplier payment | Sscq8 | I33HN4 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Money 04 Expense form | xjNpD | K5INo | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Money 05 Review expense | IG5Xf | iVWTf | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Money 06 Expense recorded | zvoBy | nhDWx | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Money Collection review | bjI7S | QUKQw | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Money Pay supplier form | Y2qWpX | fmj9G | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Money Payment and expense history | Leztk | Iy72g | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Inventory 01 Stock overview | NTybC | h0Bmm | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Inventory 02 Move stock | KxHPU | hHzim | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Inventory 03 Review transfer | xpGXe | wCCSL | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Inventory 04 Transfer complete | K5TZnm | w32ue | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Inventory 05 Stock count | I6uep | y9LQT9 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Inventory 06 Damage and loss | dXeSv | OEm1d | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Projects 01 Garden installation | r3QqKG | k1fawA | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Projects 02 Materials and supply | Jrpjv | XYGw8 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Projects 03 Review site delivery | FsUQE | zUpiO | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Projects 04 Site materials | BfW1v | h2BVLT | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Projects 05 Usage recorded | X6CRFI | AE6mv | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Projects 06 Return posted | u3Ndfy | kKLQ1 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Projects Shortfall purchase | luEGl | v4yQ7r | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Projects Internal project | uYuRo | AQY6o | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 05 Desktop / Purchasing workspace | v2ZcU | I8xWyu | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 05 Desktop / Money workspace | UtoWK | ZuF0D | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 05 Desktop / Inventory workspace | g8ztZ | DPJa3 | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 05 Desktop / Project workspace | ruKe7 | LkMsx | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Projects | FYdEk | g94dSN | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Create or edit project | VYpxr | Mi3vr | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Project saved | SLZet | cTe1a | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Create or edit service | I5c8JH | MzzC8 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Create or edit supplier | eVnFt | Z9wMS | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Receipt recorded | w2yTZ7 | qqUBc | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Receive remaining items | xywoW | nw8Kz | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Fully received | cFdfG | NaxEt | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Project purchase order | RFcVE | aipvS | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Receive project purchase | C0fxLj | x2vbJa | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Project purchase received | Sc85i | ysH25 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Supply purchased materials | Uhsdo | D9T41 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Materials delivered | EgsFh | IZews | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Review stock count | XmogS | V7BP44 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Count adjustment posted | D2jVn | QwM97 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Review damage write-off | IyfMZ | oLJMa | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Damage write-off posted | m2llTt | jDU1x | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Choose an option | bDSok | b1c0RN | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Device and service preview | fQUHT | C0gfL | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Check required details | a2cCNb | prSKE | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Leave this task? | t7ZRF | Lv8so | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Sale paid | KTXVD | YSIu1 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Sale unpaid | TYYLm | ZGS3u | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Sales return posted | nVNBu | bePo2 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Supplier return posted | JKEXg | O1cOGy | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Quotation confirmed | qWm87 | xFHV0 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Delivery confirmed | xp2mQ | o512W | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Review order invoice | CUja7 | EH2lF | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Order invoice recorded | rQ5VW | i40E4 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Stock after transfer | zIzt1 | m4pqC3 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Stock after count | WDrtt | fbSFD | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Stock after damage | U6n5a0 | UEEvS | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Project after material return | xTZnw | olIRK | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Project after purchased supply | TttNI | YFSxJ | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 09 Mobile / Purchases after full receipt | X8y4J | G8dBY5 | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 11 Desktop task / Purchase order | cJtwF | KA4Yh | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 11 Desktop task / Receive payment | mhiXz | aTPtc | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 11 Desktop task / Transfer stock | L4cf1 | oqIR2 | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 11 Desktop task / Project form | W8vSwV | WKge3 | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 11 Desktop task / Expense | NyqFG | VAV12 | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 11 Desktop task / Contact form | uFIvf | VRmVz | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 11 Desktop task / Item form | Uu6kK | hedMi | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 11 Desktop task / Sign in | J1Q4r7 | r4qNsV | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Reports 01 Overview | LmHj5 | uuUcY | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Reports 02 Profit by month | NziRK | tBvvI | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 04 Mobile / Reports 03 Customer statement | N2LZ8 | f0uNfU | Annotated; blocked | Shared host contract; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 05 Desktop / Reports workspace | Thmid | sIyxx | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
| 05 Desktop / Customer statement | cjvib | Km7r7 | — | Annotated; blocked | Structure/palette checked | not run—requires runnable application | No transitions/semantics runtime |
