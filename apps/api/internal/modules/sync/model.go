package sync

import "time"

type MutationType string

const (
	MutationCreate MutationType = "CREATE"
	MutationUpdate MutationType = "UPDATE"
	MutationDelete MutationType = "DELETE"
)

type SyncEvent struct {
	EventID         string                 `json:"event_id"`
	EntityType      string                 `json:"entity_type"`
	EntityID        string                 `json:"entity_id"`
	Action          MutationType           `json:"action"`
	Payload         map[string]interface{} `json:"payload"`
	ClientTimestamp time.Time              `json:"client_timestamp"`
	Version         int                    `json:"version"`
}

type SyncPushRequest struct {
	ClientID string      `json:"client_id"`
	Events   []SyncEvent `json:"events"`
}

type SyncAck struct {
	EventID      string `json:"event_id"`
	Status       string `json:"status"` // ACK, CONFLICT, ERROR
	ErrorMessage string `json:"error_message,omitempty"`
}

type SyncPushResponse struct {
	Acks      []SyncAck `json:"acks"`
	NewCursor string    `json:"new_cursor"`
}

type SyncPullResponse struct {
	Events     []SyncEvent `json:"events"`
	NextCursor string      `json:"next_cursor"`
	HasMore    bool        `json:"has_more"`
}
