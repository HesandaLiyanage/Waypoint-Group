# Hackathon checklist

Key: [x] verified, [~] built and type-checked but not yet run in a browser or Docker, [ ] still to do.

## Verified through the API (clean Postgres, Go tests green, `tsc` and `vite build` pass)
- [x] Official master data seeded; boot fails if the counts or IDs are wrong
- [x] Role accounts: dispatcher, loader (PIN 1234), driver (VEH035), a store manager per outlet; password from `BOOTSTRAP_PASSWORD`
- [x] Walkthrough day 2026-06-22, Peliyagoda: 36 orders, 29 served, 7 deferred, trips of at most 3 stops
- [x] Planner rules, golden 101/112 minute tests, delivery windows in Colombo time, truthful deferral reasons
- [x] Publish refuses an invalid plan; reassign and defer recompute the trip
- [x] Loader shortage: seal is refused until the dispatcher accepts it (new "Accept shortfall" action), then succeeds
- [x] Receipt flow: store shows a four-digit code on arrival, driver enters it, five wrong tries lock it, store confirms or disputes
- [x] Demo clock endpoints are dispatcher-only; sessions last 12 hours (refresh is not implemented); photos up to 2 MB accepted

## Run in the real app (Docker) next
- [~] `docker compose up` from scratch (web, ml and caddy have never started)
- [~] Click through all four roles; check loader and driver at 320 and 390px
- [~] Landing, login, registration; dispatcher review, record and publish; loader, driver and store screens

## Still to do
1. [ ] README walkthrough (numbered, four roles), architecture diagram and data model refresh, AI disclosure
2. [ ] Public deployment (use HTTPS) and the demo video
3. [ ] Set real `JWT_SECRET`, `POSTGRES_PASSWORD` and `BOOTSTRAP_PASSWORD` before going public
4. [ ] Offline: workspace is not cached (cold start offline shows nothing); a command refused for a changed plan is not resent
5. [ ] Driver: vehicle-level issue with no stop is not supported; photos are stored but not viewable
6. [ ] `/workspace`, `/workflow/commands` and the newer commands are not in `openapi.yaml`; the older `/sync/push` path still exists
7. [ ] Store stock-audit and telemetry screens are still sample data; Sinhala and Tamil strings for the new screens
