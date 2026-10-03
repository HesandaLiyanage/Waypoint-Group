# ADR-003: REST + OpenAPI Contract-First Development

## Status
Accepted

## Context
Multiple parallel work streams (Backend, Frontend React PWA, ML inference) require clear interface boundaries. API drift and hand-written server routes lead to synchronization bugs, unvalidated requests, and integration friction.

## Decision
The API specification in `contracts/openapi.yaml` is the single source of truth:
- Server stubs and request/response types are generated using `oapi-codegen` (strict-server mode).
- Handlers implement the generated interfaces directly; hand-written routes that diverge from OpenAPI are prohibited.
- Request payloads are validated against the OpenAPI schema using `kin-openapi` middleware.
- Error representations strictly adhere to RFC 9457 `application/problem+json` with stable machine-readable error codes and parameters.
- Example mock fixtures are provided in `contracts/fixtures/` for MSW mocking on the frontend.

## Consequences
### Positive
- Client and server contracts remain strictly synchronized.
- Zero manual boilerplate for request serialization and parameter decoding.
- Standardized error codes enable multi-lingual UI rendering (Sinhala, Tamil, English).

### Negative
- Code generation step required during build and development workflow.
