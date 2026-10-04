# Hackathon checklist (state at ~18:30, 4 Oct 2026)

Key: [x] done and verified, [~] built but not verified in a browser or Docker, [ ] left to do.

## Verified (API run against a clean local Postgres 17, Go tests green, `tsc` + `vite build` pass)
- [x] Official outlets/vehicles/calendar/district_travel/service_allowance seeded; boot fails if counts or IDs are wrong. The two Datathon reference tables are kept because the planner needs travel and service time for windows, fuel and ETAs.
- [x] Four role logins plus a store account for every outlet (`store.out0NN@waypoint.local`; OUT001 = `store@`, OUT055 = `store.deferred@`); no session = 401, wrong outlet = 403
- [x] Business clock `BUSINESS_NOW` (default 2026-06-21 15:00), resets to its start
- [x] Demo day 2026-06-22 from official records, Peliyagoda only (36 orders, 10 vehicles in the workshop); the plan serves 29 and defers 7 (5 chilled Fresh waiting for refrigerated trips, 2 mall windows) in 17 trips; `PLAN_MAX_STOPS_PER_TRIP=3` keeps trips short
- [x] Planner and validator rules, including windows in Colombo time (regression test), golden 101 and 112 minute tests, monsoon buffer (ASM-HK-01)
- [x] Publish refuses an invalid plan (422); `reassign` validates then recomputes trip load, time, fuel and ETAs; `defer` recomputes
- [x] Full workflow over the API: publish, loader ack/check/seal, depart, arrive, store issues four-digit code, driver delivers (wrong code rejected, five wrong tries lock the stop), store confirms or disputes
- [x] Receipt codes: four digits, issued by the store on arrival only, 30-minute expiry judged at the driver's recorded time (`client_at`), attempts persisted
- [x] Store confirm/dispute command and `store_confirmations` table (migration 00003); deferrals visible to stores only after publish
- [x] Order creation: own outlet only (403 otherwise), no hardcoded user fallbacks

## Frontend wiring (built, type-checked and bundled; NONE clicked through in a browser yet)
- [~] Login, session and refresh, sign out; no role switcher; only the four roles
- [~] Dispatcher: queue, generate, reassign, defer, record deferrals, publish, tracking, incidents, capacity (live data)
- [~] Loader: live trips from the published plan, reverse stop order, item checks, shortage (note auto-generated), reload/ack plan, seal, offline outbox, refused actions shown
- [~] Driver: live trip, depart (needs sealed), arrive, four-digit code, full or short receipt by line, issue with photo, not-delivered, finish trip, outbox, refused actions shown
- [~] Store: live orders, ETA and deferral, real order placement (server clock; after the cutoff the order moves to the next operating date), show code, confirm or dispute receipt

## Still to do (priority order)
1. [ ] Click through all four roles in a browser (320 and 390px for loader and driver) and fix what breaks, including the dispatcher's reassign dialog. Biggest risk: nothing above was exercised through the UI.
2. [ ] `docker compose up` from scratch (Docker Desktop stopped responding earlier; the web image was only checked with `vite build`). The `ml` and `caddy` services never started.
3. [ ] README: setup, accounts, numbered judge walkthrough, departures from the Designathon design. Docs: architecture diagram, data model (add `store_confirmations` and workflow commands), AI disclosure.
4. [ ] Store home screen still shows fixture cards (DRY-8841, CHL-2094) and fake telemetry and stock-audit screens; the deferral "escalate" button is not sent anywhere
5. [ ] Loader: no bay or unit labels in the data; an item cannot be un-checked (by design); flagged items need a dispatcher `accept_shortfall` before sealing, and the dispatcher UI has no button for it yet
6. [ ] Driver: a trip-level or vehicle issue with no stop is not supported by the backend; photos are stored but cannot be viewed anywhere; a command rejected for a changed plan keeps its old plan version (no resend)
7. [ ] Offline: the workspace is not cached, so a cold start offline shows nothing; one rejected command does not stop later dependent ones
8. [ ] `/workspace`, `/workflow/commands`, `reassign` and store confirm are not in `openapi.yaml`; the older `/sync/push` path still exists in parallel and should be removed or merged
9. [ ] Outlets have no display names and drivers have no names or phones in the data; screens show brand, district and outlet ID
10. [ ] Dispatcher decision history is session-only; the capacity page shows one forecast week (the endpoint returns one)
11. [ ] i18n: Sinhala and Tamil strings for the new screens
12. [ ] Public deployment and the demo video
13. [ ] Cleanup: two Go test files still use old-style sample IDs; the unused `data/challenge` CSV copies in the web app
