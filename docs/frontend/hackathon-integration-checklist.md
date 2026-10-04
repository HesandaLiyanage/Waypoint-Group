# Hackathon workflow integration checklist

Scope agreed 4 October 2026: finish the driver frontend; backend implementation belongs to the teammate. No native app required. Keep four-digit receipt codes. This checklist concerns Hackathon delivery workflows, not a requirement to implement every Datathon deliverable.

## Completed in the driver frontend

- [x] Figma-based responsive route, arrival, unload, four-digit handover, incident, confirmation and trip-summary screens using existing shared controls/header/footer.
- [x] Official outlet, vehicle and operating-calendar master records read from the published Drive CSVs. Full provenance is in `apps/web/src/data/challenge/README.md`.
- [x] Separate trip ID, stop ID, outlet ID and vehicle ID.
- [x] Explicit demo labels; no fake SMS, GPS, cold-chain measurements or server-synchronized claims.
- [x] Departure before arrival; safely parked confirmation; item-level received counts; handover cannot bypass checks.
- [x] Full receipt versus receipt with discrepancy; short quantities require a reason and retain accepted quantities.
- [x] Driver issue remains open for dispatcher action instead of automatically marking delivery complete or rerouting.
- [x] All Fresh delivery windows shown, including ambient Fresh; compatible refrigerated van used for van-only outlets.

## P0 — shared data and contracts (backend + frontend integration)

- [ ] Replace synthetic database seeds with verified official CSV imports. All three current seed files differ. Preserve OUT001/VEH001-style IDs without fabricating an ID mapping from unrelated synthetic rows.
- [ ] Replace loader/store/dispatcher mock adapters with shared API data. Driver `demo.ts` is the replacement boundary. Production API failures must show errors, not fake fallback records.
- [ ] Use one versioned manifest across roles: tripId, vehicleId, stopId, sequence, outletId, orderId, SKU, planned/loaded/accepted quantities, units and temperature. A vehicle can have multiple trips: never use vehicleId as tripId.
- [ ] Backend-assigned route order drives forward driver delivery and reverse loader loading. Verify identical stop/item quantities across the four roles.
- [ ] Validate both weight and volume, chilled compatibility, van-only access, home depot, delivery windows, route limits and fuel constraints for dispatcher actions.
- [ ] Apply Fresh arrival before 08:00 to ambient as well as chilled orders; use earlier outlet close times where applicable. Replace store's midday Fresh examples.
- [ ] Resolve calendar coverage (official data ends 2026-06-28). Use dataset scenario dates for judging or obtain an approved extension. Never invent operating-day flags for missing dates.
- [ ] Do not treat fixture schedules as a validated allocation. Validate travel/service feasibility and load capacities when the planner supplies real trips.

## P0 — loader shortfalls and departure

- [ ] Flag missing/damaged quantities with expected, usable, missing and damaged counts, SKU, reason, evidence and manifest version.
- [ ] Send notification to dispatcher and show pending acknowledgment to loader. Dispatcher chooses correction/replenishment, explicit acceptance of shortfall, reassignment or deferral; these are not automatic UI decisions.
- [ ] Gate sealing/departure on unresolved shortfalls according to the agreed decision. Preserve dispatcher acknowledgment, author, time and accepted quantities.
- [ ] Lock sealed loads. An authorized reopen/correction must increment version and require resealing; prevent silent checkbox edits after sealing.
- [ ] Preserve “Reload updated plan” as requested; wire it later to fetch/apply the new manifest and acknowledge the exact version. Current loader button only changes a local flag.

## P0 — order creation and deferrals (requested for backend connection)

- [ ] Create order on submission; retain requested date, all items/quantities and resulting order ID. Dismissing confirmation must not discard a submitted order.
- [ ] Publish the order to dispatcher and return allocation/deferral state to the originating store.
- [ ] “Tomorrow” means the next operating date in calendar.csv, not a hardcoded day label. Explicitly handle dates outside the dataset range.
- [ ] Respect previous-day 16:00 cutoff and explain the next eligible run.
- [ ] Dispatcher can intentionally defer with a reason. Distinguish unallocated recommendations from confirmed dispatcher decisions.
- [ ] Proposed deferred date must be operating and within that outlet's delivery window. Explain capacity/access/availability constraints; do not claim a confirmed new run before allocation.

## P0 — receipts and proof

- [ ] Keep FOUR digits per user decision; update backend schemas, fixtures and documentation that currently specify six.
- [ ] Server verifies stop-bound receipt code, expiry, attempts and replay/idempotency; approved issuance/resend channel replaces the demo code. Do not store real codes in logs or fixtures.
- [ ] Store recipient identity, accepted quantity per SKU, discrepancy reason/evidence and verification outcome against the same stop/order.
- [ ] Separate received-in-full, received-with-discrepancy and not-received/failed outcomes. Example: 10 planned, 8 accepted means receipt of 8 plus a shortfall of 2; it does not mean all 10 arrived.
- [ ] StoreManager.finish currently marks issue and normal receipt as delivered. Preserve discrepancy state and quantity details instead; do not discard report attachments.
- [ ] Return receipt outcome to store, driver and dispatcher. Photo uploads must persist actual bytes and metadata rather than only filename.
- [ ] Driver demo currently retains all actions/photos only in component memory; replace this explicitly, not by claiming it is already durable.

## P0 — SyncProvider review when backend connects

- [ ] Review `apps/web/src/context/SyncContext.tsx` BEFORE wiring operational screens. It currently emits legacy waypoint mutations instead of the API event schema, reads obsolete pull fields and calls removed listWaypoints.
- [ ] Map TRIP_DEPARTED, STOP_ARRIVED, STOP_DELIVERED, STOP_FAILED, ISSUE_REPORTED and TRIP_COMPLETED to device ID, monotonic sequence, event ID, client timestamp and plan version.
- [ ] Implement a durable outbox and attachment storage; distinguish saved locally, queued, sending, acknowledged and rejected. “Online” alone does not mean “synced.”
- [ ] Retry idempotently; test refresh/restart offline, network loss during request, duplicate submit, partial server failure and reconnect. Loader's timer-based simulated synchronization must be replaced.
- [ ] Resolve stale-plan conflicts while retaining unsent proof. Preserve offline driver's original observations, surface dispatcher changes, and require explicit reconciliation where necessary.
- [ ] Remove driver header's temporary Demo status only when it reports the driver's actual outbox state. Recheck all roles' sync UI, including store.
- [ ] Fix existing SyncContext TypeScript errors and make the full web build pass; do not suppress errors or weaken types.

## Dispatcher decisions and capacity planning

- [ ] Rear loading bay blocked: acknowledge, contact outlet, confirm a safe compatible alternative bay/access; give driver recorded instructions. If unsafe/unavailable, choose a bounded wait, feasible resequencing or justified deferral with revised operating date/window. Driver cannot approve these decisions alone.
- [ ] Record incident instructions separately from confirmed resolution. Only close once driver/outlet verifies the outcome; update affected ETAs and store notification.
- [ ] Capacity “review buffer options” must open actionable proposals: compatible spare vehicle, feasible second trip within limits, approved capacity request, or reprioritization/deferral. Show impact, constraints and whether proposed or confirmed. Do not imply capacity was added by merely viewing forecasts.

## Judge walkthrough and acceptance

- [ ] One shared scenario: store submits → dispatcher plans/defers → loader follows sequence and flags shortage → dispatcher acknowledges/corrects → driver departs/arrives → recipient confirms full/partial receipt → all roles show the same result.
- [ ] Validate loader and driver at 320/390px, keyboard/focus handling, readable errors and 44px+ controls.
- [ ] Verify production auth/role boundaries separately from existing mock user selection.
- [ ] Wire verified contacts/coordinates before enabling navigation/call actions; these are absent from the three CSVs.
- [ ] Complete driver translations before presenting the shared language selector as translating all driver content.
- [ ] Run fresh-install seed validation, full build and cross-role/offline walkthrough. Current driver session alone is not the completed end-to-end challenge submission.

## Validation of this frontend change

Open `http://localhost:3000/?role=driver#/driver/route` after `pnpm --filter web dev`. Start the demo trip, mark arrival while parked, check each item, enter recipient name and demo code 4829. To exercise discrepancies, reduce a received quantity and supply a reason. To exercise a blocked bay, report an issue and verify that the current stop remains open.

Checked with local Chrome/CDP (no Playwright installed): full three-stop flow; departure/arrival guards; required item checks; shortfall reason; wrong and correct receipt codes; partial versus full receipt; incident retained without automatic delivery; finish-trip gating; zero accepted goods blocked. Seven screens checked at 320, 390, 768 and 1440px without horizontal overflow or runtime exceptions. Photo selection is implemented with a session-only File and preview; server upload is not implemented or validated.

Driver and shared dependencies pass an isolated TypeScript check; Vite production bundle succeeds. Full `pnpm --filter web build` remains blocked by the pre-existing SyncContext API type mismatches listed above. No backend files were changed. Cross-role synchronization and durable offline behavior remain integration work.
