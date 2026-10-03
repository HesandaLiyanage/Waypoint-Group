# Waypoint Delivery Platform - Architecture & Operational Assumptions

This log records every operational and engineering assumption made across the platform, following the format:
`[Assumption] | [Rationale/Why] | [How to Change]`

| ID | Assumption | Why | How to Change |
|---|---|---|---|
| ASM-001 | Fuel consumption includes return journey distance (`2 * depot_to_district_km + inter_stop_km * (n - 1)`). | Vehicles must return to home depot at the end of the run; excluding return would underestimate fuel quotas and leave trucks stranded. | Modify `TripDistanceForFuel()` in `planning/calculator.go`. |
| ASM-002 | Trip time budget calculation excludes return leg (`depot_to_district_freeflow_min + inter_stop_freeflow_min * (n - 1) + sum(service_allowance)`). | Golden tests A & B and Section 5.4 state that operational trip duration budgets already account for return journey. | Adjust `CalculateTripMinutes()` in `planning/calculator.go`. |
| ASM-003 | Second Fresh trip departs after Trip 1 ends + return leg duration (`depot_to_district_freeflow_min`) + 15 min turnaround/reload buffer. | Section 5.7 explicitly recommends 15-minute reload buffer as standard depot dock turnaround. | Change `DefaultReloadBufferMin` in configuration or planning parameters. |
| ASM-004 | Default departure time for Fresh trips is 03:30; default departure time for Style/Tech is 07:00. | Fresh requires delivery before 08:00 store opening; Style/Tech operate during daytime trading hours (Section 5.7). | Configurable via `PLAN_FRESH_DEPART_DEFAULT` and `PLAN_STYLETECH_DEPART_DEFAULT` in `.env`. |
| ASM-005 | Monsoon weather condition applies a 1.15x travel time multiplier across inter-stop and depot-to-district travel. | Monsoon rainfall severely impacts Sri Lankan road infrastructure and traffic congestion (Section 14). | Update `MonsoonTravelMultiplier` in `planning/calculator.go`. |
| ASM-006 | Physical quantities stored as exact integers: weight in grams (`weight_g`), volume in microlitres / millilitres (`volume_ul` or `volume_mm3`), fuel in millilitres (`liters_ml`). | Avoids floating-point rounding errors and non-deterministic capacity comparisons (ADR-8). | Adjust conversion multipliers in catalog loader and unit conversions in `platform/units`. |
| ASM-007 | Deferred Fresh orders carry over to the next operating day, rather than an evening run. | Section 20 Item 4 reconciles the Day 5 design: Fresh outlets only accept delivery inside 03:30-08:00 window. | Configurable in order deferral carryover strategy. |
| ASM-008 | Offline proof-of-delivery (PoD) uses 6-digit HMAC-SHA256 receipt codes as proof of physical presence, not bank-grade non-repudiation. | Store manager phone/desktop displays the 6-digit code, driver enters it without network connection; verified on sync (Section 10). | Pluggable signature or QR code verification in `delivery/pod.go`. |
| ASM-009 | ML service latency budget is 300 ms with zero retries and circuit-breaker fallback to deterministic heuristic rules. | Unresponsive ML inference must never stall plan generation or sync processing (Section 2, Section 13). | Adjust `ML_TIMEOUT_MS` and breaker thresholds in `config`. |
