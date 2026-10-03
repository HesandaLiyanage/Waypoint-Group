# ADR-008: Integer Arithmetic for Physical Quantities

## Status
Accepted

## Context
Vehicle capacity feasibility checks (weight and volume) and fuel quota calculations are critical hard constraints. Floating-point arithmetic introduces IEEE-754 binary representation inaccuracies (e.g., `0.1 + 0.2 != 0.3`), which can cause non-deterministic validator failures, false over-capacity rejections, or cumulative drift over multiple stops.

## Decision
All physical quantities are represented and manipulated as exact integers or fixed-point exact numbers:
- Weight: stored and computed in grams (`weight_g` as `bigint`). $1\text{ kg} = 1,000\text{ g}$.
- Volume: stored and computed in microlitres or cubic millimetres (`volume_ul` as `bigint`). $1\text{ m}^3 = 1,000,000,000\ \mu\text{l} = 1,000,000\text{ cm}^3\text{ (ml)}$.
- Fuel: stored and computed in millilitres (`liters_ml` as `bigint`). $1\text{ L} = 1,000\text{ ml}$.
- Distance: fixed-point kilometers with 2 decimal places or meters.
- Floating-point comparisons for trip capacity checks or fuel ledgers are strictly prohibited in the engine.

## Consequences
### Positive
- 100% deterministic validator and planner output across all platforms and architectures.
- Exact unit equality comparisons without epsilon tolerance hacks.
- Clean database constraints with integer arithmetic.
