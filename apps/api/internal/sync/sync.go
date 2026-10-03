package sync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/ordering"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/auth"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/clock"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/outbox"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/sse"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrInvalidEvent = errors.New("invalid sync event payload")
)

type EventType string

const (
	TypeTripDeparted   EventType = "TRIP_DEPARTED"
	TypeStopArrived    EventType = "STOP_ARRIVED"
	TypeStopDelivered  EventType = "STOP_DELIVERED"
	TypeStopFailed     EventType = "STOP_FAILED"
	TypeIssueReported  EventType = "ISSUE_REPORTED"
	TypeTripCompleted  EventType = "TRIP_COMPLETED"
)

type DeviceEventInput struct {
	EventID         uuid.UUID              `json:"event_id"`
	DeviceID        string                 `json:"device_id"`
	DeviceSeq       int64                  `json:"device_seq"`
	Type            EventType              `json:"type"`
	StopID          *uuid.UUID             `json:"stop_id,omitempty"`
	PlanVersionSeen *int                   `json:"plan_version_seen,omitempty"`
	ClientTs        time.Time              `json:"client_ts"`
	Payload         map[string]interface{} `json:"payload"`
}

type EventAck struct {
	EventID        uuid.UUID              `json:"event_id"`
	Result         string                 `json:"result"` // accepted | duplicate | rejected
	RejectCode     *string                `json:"reject_code,omitempty"`
	ServerTs       time.Time              `json:"server_ts"`
	Conflict       bool                   `json:"conflict"`
	EntityVersions map[string]interface{} `json:"entity_versions,omitempty"`
}

type SyncService struct {
	pool   *pgxpool.Pool
	clock  clock.Clock
	outbox *outbox.Writer
	hub    *sse.Hub
}

func NewSyncService(pool *pgxpool.Pool, clk clock.Clock, ob *outbox.Writer, hub *sse.Hub) *SyncService {
	return &SyncService{
		pool:   pool,
		clock:  clk,
		outbox: ob,
		hub:    hub,
	}
}

// ProcessSyncBatch processes a batch of offline driver facts (Section 10).
// Each event is isolated via a PostgreSQL transaction savepoint.
func (s *SyncService) ProcessSyncBatch(ctx context.Context, actor *auth.AuthUser, events []DeviceEventInput) ([]EventAck, error) {
	if len(events) > 100 {
		return nil, fmt.Errorf("batch size %d exceeds maximum of 100", len(events))
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	now := s.clock.Now()
	var acks []EventAck

	for i, evt := range events {
		savepoint := fmt.Sprintf("sp_%d", i)
		_, err := tx.Exec(ctx, "SAVEPOINT "+savepoint)
		if err != nil {
			return nil, err
		}

		ack := s.processSingleEvent(ctx, tx, actor, evt, now)

		if ack.Result == "rejected" {
			// Roll back this individual event's sub-transaction
			_, _ = tx.Exec(ctx, "ROLLBACK TO SAVEPOINT "+savepoint)
		} else {
			_, _ = tx.Exec(ctx, "RELEASE SAVEPOINT "+savepoint)
		}

		acks = append(acks, ack)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	// Trigger real-time notifications via SSE hub for accepted physical events
	for _, ack := range acks {
		if ack.Result == "accepted" {
			s.hub.Broadcast(ctx, "depot:all", "SYNC_EVENT_ACCEPTED", map[string]interface{}{
				"event_id": ack.EventID,
				"server_ts": ack.ServerTs,
			})
		}
	}

	return acks, nil
}

func (s *SyncService) processSingleEvent(
	ctx context.Context,
	tx pgx.Tx,
	actor *auth.AuthUser,
	evt DeviceEventInput,
	serverTs time.Time,
) EventAck {

	// 1. Idempotency Check: check if event_id already exists
	var existingResult, rejectCode *string
	err := tx.QueryRow(ctx, `
		SELECT result, reject_code FROM device_events WHERE event_id = $1
	`, evt.EventID).Scan(&existingResult, &rejectCode)

	if err == nil && existingResult != nil {
		return EventAck{
			EventID:    evt.EventID,
			Result:     "duplicate",
			RejectCode: rejectCode,
			ServerTs:   serverTs,
		}
	}

	payloadJSON, _ := json.Marshal(evt.Payload)

	// Check clock skew > 5 minutes
	clockSkew := serverTs.Sub(evt.ClientTs)
	if clockSkew > 5*time.Minute || clockSkew < -5*time.Minute {
		slog.Warn("Device clock skew detected", "device_id", evt.DeviceID, "skew", clockSkew.String())
	}

	conflict := false

	// 2. Apply physical fact based on event type
	switch evt.Type {
	case TypeTripDeparted:
		if tripIDStr, ok := evt.Payload["trip_id"].(string); ok {
			tripID, err := uuid.Parse(tripIDStr)
			if err == nil {
				_, _ = tx.Exec(ctx, `
					UPDATE trips SET status = 'departed' WHERE id = $1 AND status != 'completed'
				`, tripID)
				_ = s.outbox.Write(ctx, tx, "notify.eta_change", map[string]interface{}{"trip_id": tripID}, nil)
			}
		}

	case TypeStopArrived:
		if evt.StopID != nil {
			_, _ = tx.Exec(ctx, `
				UPDATE trip_stops SET status = 'arrived' WHERE id = $1
			`, *evt.StopID)
			s.recomputeDownstreamETAs(ctx, tx, *evt.StopID, serverTs)
		}

	case TypeStopDelivered:
		if evt.StopID != nil {
			status := "delivered"
			if isShort, ok := evt.Payload["is_short"].(bool); ok && isShort {
				status = "delivered_short"
			}

			tag, _ := tx.Exec(ctx, `
				UPDATE trip_stops SET status = $1 WHERE id = $2
			`, status, *evt.StopID)

			if tag.RowsAffected() == 0 {
				// Conflict: stop was modified or missing in latest plan, accept physical fact!
				conflict = true
				slog.Warn("Sync conflict: delivered stop not found in active plan", "stop_id", evt.StopID)
			} else {
				// Update underlying order status
				_, _ = tx.Exec(ctx, `
					UPDATE orders
					SET status = $1, confirmed_at = $2
					WHERE id = (SELECT order_id FROM trip_stops WHERE id = $3)
				`, status, serverTs, *evt.StopID)

				// Verify 6-digit PoD receipt code if provided
				if codeVal, hasCode := evt.Payload["receipt_code"]; hasCode {
					if codeStr, ok := codeVal.(string); ok && codeStr != "" {
						var salt, hash string
						err := tx.QueryRow(ctx, `SELECT code_salt, code_hash FROM stop_receipts WHERE stop_id = $1`, *evt.StopID).Scan(&salt, &hash)
						if err == nil {
							if !ordering.VerifyReceiptCode(codeStr, salt, hash) {
								detailJSON, _ := json.Marshal(map[string]interface{}{
									"reason":        "PoD receipt code HMAC mismatch",
									"code_entered":  codeStr,
								})
								_, _ = tx.Exec(ctx, `
									INSERT INTO issues (kind, stop_id, raised_by, raised_role, status, detail, created_at)
									VALUES ('POD_INVALID_CODE', $1, $2, 'driver', 'open', $3, $4)
								`, evt.StopID, actor.ID, detailJSON, serverTs)
							}
						}
					}
				}
			}

			s.recomputeDownstreamETAs(ctx, tx, *evt.StopID, serverTs)
		}

	case TypeStopFailed:
		if evt.StopID != nil {
			reason, _ := evt.Payload["reason"].(string)
			_, _ = tx.Exec(ctx, `
				UPDATE trip_stops SET status = 'failed' WHERE id = $1
			`, *evt.StopID)
			_, _ = tx.Exec(ctx, `
				UPDATE orders SET status = 'failed'
				WHERE id = (SELECT order_id FROM trip_stops WHERE id = $1)
			`, *evt.StopID)

			_ = s.outbox.Write(ctx, tx, "issue.raised", map[string]interface{}{
				"kind":    "STOP_FAILED",
				"stop_id": *evt.StopID,
				"reason":  reason,
			}, nil)
		}

	case TypeTripCompleted:
		if tripIDStr, ok := evt.Payload["trip_id"].(string); ok {
			tripID, err := uuid.Parse(tripIDStr)
			if err == nil {
				_, _ = tx.Exec(ctx, `
					UPDATE trips SET status = 'completed' WHERE id = $1
				`, tripID)
			}
		}

	case TypeIssueReported:
		kind, _ := evt.Payload["kind"].(string)
		detailJSON, _ := json.Marshal(evt.Payload)
		_, _ = tx.Exec(ctx, `
			INSERT INTO issues (kind, stop_id, raised_by, raised_role, status, detail, created_at)
			VALUES ($1, $2, $3, 'driver', 'open', $4, $5)
		`, kind, evt.StopID, actor.ID, detailJSON, serverTs)
	}

	// 3. Persist into device_events table
	_, _ = tx.Exec(ctx, `
		INSERT INTO device_events (event_id, device_id, user_id, device_seq, type, payload, plan_version_seen, client_ts, server_ts, result)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'accepted')
	`, evt.EventID, evt.DeviceID, actor.ID, evt.DeviceSeq, string(evt.Type), payloadJSON, evt.PlanVersionSeen, evt.ClientTs, serverTs)

	return EventAck{
		EventID:  evt.EventID,
		Result:   "accepted",
		ServerTs: serverTs,
		Conflict: conflict,
	}
}

// recomputeDownstreamETAs propagates delays to subsequent stops along the trip (Section 10).
func (s *SyncService) recomputeDownstreamETAs(ctx context.Context, tx pgx.Tx, stopID uuid.UUID, actualTime time.Time) {
	var tripID uuid.UUID
	var seq int
	var plannedEta *time.Time
	err := tx.QueryRow(ctx, `
		SELECT trip_id, seq, eta FROM trip_stops WHERE id = $1
	`, stopID).Scan(&tripID, &seq, &plannedEta)
	if err != nil || plannedEta == nil {
		return
	}

	delay := actualTime.Sub(*plannedEta)
	if delay <= 0 {
		return // No delay to propagate
	}

	// Downstream stops delay propagation
	_, _ = tx.Exec(ctx, `
		UPDATE trip_stops
		SET eta = eta + $1,
		    late_risk = CASE WHEN (eta + $1)::time > window_close THEN 1.0 ELSE late_risk END
		WHERE trip_id = $2 AND seq > $3
	`, delay, tripID, seq)
}
