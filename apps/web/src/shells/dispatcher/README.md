# Dispatcher frontend

Open `/dispatcher.html` for the independent dispatcher demo. The same
`DispatcherShell` is used by the existing role router when the mock active role
is dispatcher. Other role shells retain their existing sync provider. The dispatcher
makes no backend requests and does not change authentication or backend code.

Implemented pages: Home, Order Queue, Allocation Plan, Reassign Stop dialog,
Deferral Review, deferrals-recorded confirmation, plan-confirmed confirmation,
read-only summary, Live Tracking, Trip Detail / Resolve Issue, and Capacity Planning.

The common header, footer, controls, cards and modal are reused. Figma references:
`206:607`, `211:1283`, `217:1116`, `246:2542`, `275:5318`, `275:5006`,
`217:1971`, `363:6392`, `180:2994`, `180:3416`, `180:3798`.
The interface retains the green/teal theme, card and table hierarchy, while removing
repeated inventory banners, unsupported vehicle telemetry and decorative metadata.

## Demo workflow

1. Review and prioritise orders, then close the queue.
2. Generate draft suggestions. Inspect capacity and explanations for unassigned orders.
3. Defer an assigned order with its reason, impact and next operating date, or try
   restoring an unassigned order to a compatible trip.
4. Review each proposed deferral, explain any repeated skip and explicitly accept it.
5. Record reviewed decisions, then confirm the validated demo draft.
6. In tracking, acknowledge the blocked-bay incident, select a response and record
   agreed instructions with a follow-up time. Confirm the outcome before closing it.
7. In capacity planning, compare changes to ambient timing and requested capacity,
   then save a proposed action plan. No orders or vehicles are changed automatically.

See `docs/frontend/dispatcher-decisions.md` for booklet references, design departures,
demo assumptions and backend contract gaps. State resets on reload; no backend calls,
notifications, reservations or manifest publication occur. Tracking remains a separate
morning-run snapshot. Header navigation supports the existing locales; workflow copy
is English.

## Validation

- `pnpm --filter web check:components` checks the dispatcher and common UI.
- `node apps/web/scripts/check-dispatcher.mjs` exercises workflow invariants without
  installing a test framework.
- `pnpm --filter web exec vite build` checks the production bundle including
  `dispatcher.html` (does not bypass or replace full-app TypeScript validation).
- Full app build still has the pre-existing SyncContext contract errors.
