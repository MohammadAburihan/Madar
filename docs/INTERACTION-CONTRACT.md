# Madar interaction and transaction contract

The canvas and interaction-routes.json specify behavior. **They are not a clickable prototype.** Pencil's exposed schema has no node-to-node transition/click/overlay API. Text href is a URL field, not a screen-transition mechanism. Native semantics/focus are also unavailable. No substitute app was built.

## Entry points

| Surface | English | Arabic |
| --- | --- | --- |
| Mobile Home | Lqpaw | cB7Nm |
| Desktop Home | Pd5Js | C9G6N |
| Connect business | xR27d | ZoFml |
| Desktop connect | DVtBp | oLb4F |
| Quick sale | LZt1B | H7SYD |
| Desktop quick sale | sEKfr | E4QuO |

## Canonical flows

IDs below are English; interaction-routes.json maps each to its Arabic counterpart.

| Flow | Route sequence and state effects |
| --- | --- |
| Quick sale partial | LZt1B → j792NO → MNbv4 → aC31k → bAV42. SI-1042 total320,received120,due200. Two trees delivered; service execution remains separate. |
| Paid / unpaid | Review wXJWa → KTXVD (paid320,due0); review t0AjEk → TYYLm (paid0,due320,no cash receipt). These are alternative scenarios of the same example, not extra invoices. |
| Unresolved | Confirmation timeout keeps operation reference and shows jQPbr or the generic unresolved component for the current operation. Check result: found opens existing detail; pending stays; definite failure returns preserved review. Never blind resubmit. |
| Purchase | CHgyq → yiMgW → nrQjb → x0Kvl → w2yTZ7. PO-2048 ordered10,received6. Receipt creates stock movement only. Zyn4v → k7Ai6 records PINV-0068 total270; Y2qWpX → qm6my separately pays100; dVsdv due170. |
| Remaining receipt | D7PZet → xywoW → cFdfG → X8y4J. Receive remaining4:received10,billed6. Unbilled4 value180 is not existing invoice debt. |
| Customer collection | K0MB7 → bjI7S → AUBZL → q7SU4x. PAY-0156 is another120; prior paid120 becomes240,due80. Allocation cannot exceed remaining invoice balance; excess must be handled explicitly, not silently allocated. |
| Expense | xjNpD → IG5Xf → zvoBy. EX-0091 pays36.50 from Main cash. Optional project selector returns selected project ID; optional receipt stub returns sample attachment. No cash increase. |
| Transfer | KxHPU → xpGXe → K5TZnm → zIzt1. Main24→22,shop6→8,total30. |
| Count | I6uep → XmogS → D2jVn → WDrtt. Main22→20,shop8,total28. |
| Damage | dXeSv → IyfMZ → m2llTt → U6n5a0. Shop8→7,Main20,total27. Separate adjustment reason. |
| Project stock | r3QqKG → Jrpjv → FsUQE → BfW1v → X6CRFI → u3Ndfy → xTZnw. Supply8,consume5,return2,site1. Supply never implies consumption. |
| Project shortfall | luEGl → RFcVE → C0fxLj → Sc85i → Uhsdo → EgsFh → TttNI. PO-2049 receives4 into Main warehouse,then separately supplies4. Gross delivered12-returned2=net10=used5+site5. Original requirement12 still needs2. |
| Project creation/edit | FYdEk → VYpxr → SLZet. Customer projects require customer; Internal hides that requirement. Budget/project attachment optional. Existing project Edit preloads record and retains ID. |
| Catalog/service | h08BHE → o6Tct → Wj8ai for stock items; uh6se → I5c8JH for services. Type switch preserves common fields and removes warehouse/opening quantity from services. |
| Contacts | H5rpKX → E5NfVx/wpsEe. Customer form ylrkE; supplier form eVnFt. Save from a transaction returns new selection to that transaction, preserving its basket/allocation. |
| Quote/order/delivery | gLucp → qWm87 → u9Nym9 (QT-0084→SO-0187,Lina). P6HSJO → xp2mQ delivers only the2 trees. CUja7 → rQ5VW creates SI-1043 total320 without a second delivery/payment. |
| Linked returns | cPZ8m → nVNBu credits85,due200→115,paid120 unchanged; mGQFo → JKEXg credits45,due170→125,paid100 unchanged. No cash refund implied. These start from the original payment snapshots, not the later collection/full-receipt branches. |

## Selection, input and return contracts

bDSok is the shared selection host; its displayed options are parameterized by originating field and business. Use the existing localized selector component for the list. Customer: Lina Haddad; supplier: GreenClay Hebron; warehouse: Main warehouse/Garden shop; payment account: Main cash/Main bank; project: PRJ-018/PRJ-019; item type: Stock item/Service; contact type: Customer/Supplier. Load only allowed records for the active business. Search filters those options; clear filters resets query; choosing a result returns ID plus label; Cancel returns the previous selection. Preserve the rest of the task.

RETURN_ORIGIN/RETURN_PREVIOUS/RETURN_SELECTION and related placeholders in the manifest are dynamic origin-stack parameters, not missing screen IDs. Store originating route,focused field,intended destination,record ID,query,filters and draft ID. Save draft keeps it in business+user+document-type scope. Back within a task preserves input; leaving an edited task opens t7ZRF save/discard/stay. Finalized Back closes the task to a current-state detail/list, never to its confirmation form.

Failure branches reuse the localized permission,validation,connection,session and unresolved patterns in the same task. a2cCNb illustrates actionable errors and returns focus to the invalid field. Validate required values,stock availability,positive quantities,distinct warehouses,allowed price edits and allocation bounds before commitment. Permission denial keeps data and offers safe return. Re-authentication retains scoped draft and returns to origin.

## Desktop rendering

Desktop sidebar links use desktop workspace IDs. Eight task pairs use shared form bodies. Task review/details/outcomes keep the current desktop host/sidebar and render the canonical body at640px; narrow layouts use a full-page task. Back restores the originating desktop workspace. The route contexts explicitly state this; subsequent desktop compositions are a shared rendering specification, not separately drawn variants for every state.

## External capabilities

fQUHT/C0gfL identify authentication/password recovery,camera,upload,barcode scanning andsharing as prototype behavior. No real authentication,camera access,file transfer or sharing occurs. Manual barcode entry remains available. Stub return uses a sample attachment/result; cancellation preserves the task. Real integrations and permission-denial handling require the application.

## Completion boundary

Route specifications,English/Arabic designs and design audit are delivered. Native click-through wiring remains blocked by tool capability. Keyboard,focus,screen-reader,zoom,reflow andnative platform tests: **not run—requires runnable application**. Implement these contracts in the real application,then verify runtime behavior.

