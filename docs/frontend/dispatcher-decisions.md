# Dispatcher decisions and challenge alignment

Reviewed against the supplied Challenge Booklet, pages 4–7 and 12. Pages 16–17
provide forecasting context; pages 20–21 are specifically Datathon Task 2B rules,
not an additional hidden Hackathon specification. The booklet is a requirements
reference, not permission to publish datasets or implement other roles.

## Responsibility split

The planner may suggest an allocation and explain why an order did not fit. The
dispatcher decides whether to accept a deferral, move another order, try a compatible
trip or change the draft. The system must validate the resulting plan. The previous
fixture deferred the final four array entries and left their reasons blank; that
was not an adequate representation of this decision process.

The frontend now:
- Generates sample suggestions using previous skips, priority and access needs.
- Prefills an unassigned order's explanation with candidate-trip constraints.
- Allows manual whole-order deferral from Order Queue and Allocation Plan.
- Records a reason, operating date and decision note, releasing the assigned load.
- Allows reassigning a proposed deferral to any compatible sample trip.
- Requires explicit acceptance of each deferral, with an explanation for repeat skips.
- Invalidates the review when its assignments, dates or reasons change.
- Keeps a visible local decision history and locks confirmed plans.

Compatibility permits ambient goods on reefers, but never chilled goods on ambient
vehicles. The isolated demo checks its four sample trip slots for district, van access,
weight, volume, estimated time, the Fresh morning window and illustrative fuel usage.
All sample trips are at Peliyagoda and have one route each. The fuel allowance (12 L
remaining), route distances, service increments and candidate slots are demo inputs,
not authoritative fleet or routing data. It is not a replacement for the backend
validator, trip generation, exact outlet windows or shared-dataset seeding. Next-date
options are a snapshot of the repository's operating calendar. Backend calendar and
validation results must replace these inputs at integration.

## Capacity planning

Forecasts describe demand; they do not create orders or reserve resources. The UI
now supports editable scenarios for moving agreed Style/Tech volume into the preceding
week and requesting additional refrigerated/ambient capacity. It shows projected total
and chilled shortfalls and the impact on the preceding week, then saves the proposed
actions and note by depot. Saved plans survive navigation within the demo session.

These are proposals, not resource commitments. The original demand chart stays intact.
Shifting Fresh to another week, returning workshop vehicles to service, crossing home
depots or inventing vehicle leases are not automatic remedies. Existing vehicles already
have drivers, so the UI does not invent a separate driver constraint. Spare second trips
must be checked against the two-trip maximum, delivery windows, fuel and availability.
Requests are bounded demo scenario inputs, not a claim that the requested volume exists.
Production scheduling must identify actual vehicle/trip slots before confirming capacity.

## Blocked loading bay

Recommended first response: acknowledge, contact the safely stopped driver and outlet,
and check whether an approved alternative unloading point is available. Do not blindly
substitute a van, authorize an unsafe unload or mark delivery complete.

Selectable responses:
1. Agree an alternative unloading point after access and chilled-handling checks.
2. Hold briefly with an explicit review time before the Fresh delivery window closes.
3. Request a validated reattempt/revised sequence, considering remaining windows, fuel,
   travel time and physical access to goods already loaded.
4. Coordinate return of affected goods and next-run review if no feasible delivery remains.

The lifecycle is open → acknowledged → instructions recorded / awaiting outcome → closed
only after a confirmed driver/outlet outcome. Recording instructions does not send a
message. Closing an incident does not change delivery or receipt status; fleet tracking
shows that a driver update is still needed. The driver records the delivery/failure fact,
and the store records receipt. Offline acknowledgment must remain pending in production.

## Backend handoff (not implemented here)

Existing OpenAPI supports assignments, feasibility validation, deferral override,
explanations, publishing, forecasts and issue acknowledgment/resolution. It does not
currently define rich manual-deferral notes/dates, saved capacity action plans or typed
incident instructions/outcome payloads. Agree those request/response contracts with the
backend teammate before integration; do not send invented payloads to existing endpoints.
A published/loaded/departed plan needs versioned change handling and loader/driver
acknowledgment. The draft-edit UI must not silently mutate those runs.

## Design changes

The existing Figma structure and theme remain. Blank deferral reasons are replaced by
explainable suggestions plus dispatcher review; manual defer/restore actions are added.
The read-only buffer advice becomes a saved scenario/action panel. The one-click issue
closure becomes an acknowledgment/instruction/outcome flow. No marketing pages, other-role
screens or backend changes are included.
