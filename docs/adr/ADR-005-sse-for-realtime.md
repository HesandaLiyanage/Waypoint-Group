# ADR-005: Server-Sent Events (SSE) for Real-Time Updates

## Status
Accepted

## Context
Dispatchers, loaders, and store managers require real-time updates as trips depart and deliveries are confirmed. Polling wastes bandwidth and battery; full-duplex WebSockets introduce complex connection state management, stateful ping-pong keepalives, and proxy buffering issues.

## Decision
We adopt Server-Sent Events (SSE) over HTTP/1.1 and HTTP/2:
- Unidirectional server-to-client event stream at `GET /api/v1/events/stream`.
- Subscriber scope is extracted strictly from the verified JWT (not query parameters).
- Monotonic sequence IDs (`Last-Event-ID` header corresponding to `event_feed.seq`) enable automatic reconnection and lossless replay after network interruptions.
- Heartbeat comments every 20 seconds prevent intermediate proxy timeouts.
- Edge proxy (Caddy) is configured with `flush_interval -1` and `X-Accel-Buffering: no`.
- Slow consumers (buffered channel depth 64) are dropped gracefully, directing the client to perform a delta pull sync.

## Consequences
### Positive
- Standard web browser auto-reconnect behavior.
- Works seamlessly across firewalls and standard HTTP reverse proxies.
- Minimal server resource consumption (< 50 KB memory per idle subscriber).
