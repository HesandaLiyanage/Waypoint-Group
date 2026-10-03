# ADR-007: UTC Storage with Asia/Colombo Business Timezone

## Status
Accepted

## Context
Waypoint Group operates strictly within Sri Lanka (UTC+05:30). Sri Lanka does not observe Daylight Saving Time (DST). System clocks on servers and containers often default to UTC. Missing timezone data in minimal container base images can cause runtime failures or incorrect date cutoff calculations.

## Decision
- All timestamps in the database are stored as `timestamptz` in UTC.
- All business logic, daily order cutoffs (16:00), calendar day matching, and delivery window checks operate in `Asia/Colombo` (+05:30).
- Go binaries embed tzdata using `import _ "time/tzdata"` to guarantee correct timezone evaluation even in minimal `scratch` or `alpine` containers.
- All JSON API responses serialize timestamps in ISO 8601 format with the explicit `+05:30` offset.

## Consequences
### Positive
- Reliable cutoff calculation regardless of the host server's local configuration.
- Clear separation between storage normalization (UTC) and business presentation (+05:30).
- Elimination of missing tzdata bugs in containerized deployments.
