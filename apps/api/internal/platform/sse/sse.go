package sse

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/auth"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Event struct {
	ID    int64       `json:"id"`
	Scope string      `json:"scope"`
	Type  string      `json:"type"`
	Data  interface{} `json:"data"`
}

type Client struct {
	UserID  uuid.UUID
	Scope   string
	Channel chan Event
	ctx     context.Context
	cancel  context.CancelFunc
}

type Hub struct {
	mu          sync.RWMutex
	clients     map[string]map[*Client]bool // scope -> set of clients
	userStreams map[uuid.UUID]int          // count of open streams per user
	pool        *pgxpool.Pool
}

func NewHub(pool *pgxpool.Pool) *Hub {
	return &Hub{
		clients:     make(map[string]map[*Client]bool),
		userStreams: make(map[uuid.UUID]int),
		pool:        pool,
	}
}

// DeriveScope extracts the authoritative SSE scope from verified user identity.
func DeriveScope(u *auth.AuthUser) string {
	if u == nil {
		return "anonymous"
	}
	switch u.Role {
	case auth.RoleDispatcher:
		if u.Depot != nil {
			return fmt.Sprintf("depot:%s", *u.Depot)
		}
		return "depot:all"
	case auth.RoleLoader:
		if u.Depot != nil {
			return fmt.Sprintf("depot:%s", *u.Depot)
		}
		return "depot:all"
	case auth.RoleDriver:
		if u.VehicleID != nil {
			return fmt.Sprintf("vehicle:%s", *u.VehicleID)
		}
		return fmt.Sprintf("driver:%s", u.ID)
	case auth.RoleStoreManager:
		if u.OutletID != nil {
			return fmt.Sprintf("outlet:%s", *u.OutletID)
		}
		return fmt.Sprintf("store:%s", u.ID)
	default:
		return fmt.Sprintf("user:%s", u.ID)
	}
}

// Broadcast sends an event to all subscribers matching the scope and writes to event_feed.
func (h *Hub) Broadcast(ctx context.Context, scope, eventType string, payload interface{}) {
	payloadJSON, _ := json.Marshal(payload)

	var seq int64
	err := h.pool.QueryRow(ctx, `
		INSERT INTO event_feed (scope, type, payload, created_at)
		VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
		RETURNING seq
	`, scope, eventType, payloadJSON).Scan(&seq)
	if err != nil {
		return
	}

	event := Event{
		ID:    seq,
		Scope: scope,
		Type:  eventType,
		Data:  payload,
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	// Direct subscribers
	if clients, ok := h.clients[scope]; ok {
		for c := range clients {
			select {
			case c.Channel <- event:
			default:
				// Channel full: drop slow consumer
				go c.cancel()
			}
		}
	}

	// Also broadcast to global scope subscribers (e.g. depot:all)
	if scope != "global" && scope != "depot:all" {
		if clients, ok := h.clients["depot:all"]; ok {
			for c := range clients {
				select {
				case c.Channel <- event:
				default:
					go c.cancel()
				}
			}
		}
	}
}

// ServeHTTP handles the SSE connection lifecycle from a standard http.Request.
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	user := auth.GetUser(r.Context())
	var lastSeq int64
	lastEventIDStr := r.Header.Get("Last-Event-ID")
	if lastEventIDStr != "" {
		lastSeq, _ = strconv.ParseInt(lastEventIDStr, 10, 64)
	}
	h.ServeStream(w, r.Context(), user, lastSeq)
}

// ServeStream handles the SSE connection lifecycle given a response writer, context, user, and last event ID.
func (h *Hub) ServeStream(w http.ResponseWriter, reqCtx context.Context, user *auth.AuthUser, lastEventID int64) {
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	h.mu.Lock()
	if h.userStreams[user.ID] >= 3 {
		h.mu.Unlock()
		w.Header().Set("Retry-After", "5")
		http.Error(w, "Too many concurrent streams", http.StatusTooManyRequests)
		return
	}
	h.userStreams[user.ID]++
	h.mu.Unlock()

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	scope := DeriveScope(user)

	clientCtx, cancel := context.WithCancel(reqCtx)
	defer cancel()

	client := &Client{
		UserID:  user.ID,
		Scope:   scope,
		Channel: make(chan Event, 64),
		ctx:     clientCtx,
		cancel:  cancel,
	}

	h.mu.Lock()
	if h.clients[scope] == nil {
		h.clients[scope] = make(map[*Client]bool)
	}
	h.clients[scope][client] = true
	h.mu.Unlock()

	defer func() {
		h.mu.Lock()
		if set, exists := h.clients[scope]; exists {
			delete(set, client)
			if len(set) == 0 {
				delete(h.clients, scope)
			}
		}
		h.userStreams[user.ID]--
		if h.userStreams[user.ID] <= 0 {
			delete(h.userStreams, user.ID)
		}
		h.mu.Unlock()
	}()

	// Set required SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	// Check Last-Event-ID for replay
	if lastEventID > 0 {
		h.replayEvents(clientCtx, w, flusher, scope, lastEventID)
	}

	heartbeatTicker := time.NewTicker(20 * time.Second)
	defer heartbeatTicker.Stop()

	// 30 minute stream max lifetime
	lifetimeTimer := time.NewTimer(30 * time.Minute)
	defer lifetimeTimer.Stop()

	for {
		select {
		case <-clientCtx.Done():
			return
		case <-lifetimeTimer.C:
			return
		case <-heartbeatTicker.C:
			_, _ = fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case evt := <-client.Channel:
			dataBytes, _ := json.Marshal(evt.Data)
			_, _ = fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", evt.ID, evt.Type, string(dataBytes))
			flusher.Flush()
		}
	}
}

func (h *Hub) replayEvents(ctx context.Context, w http.ResponseWriter, flusher http.Flusher, scope string, lastSeq int64) {
	rows, err := h.pool.Query(ctx, `
		SELECT seq, type, payload
		FROM event_feed
		WHERE (scope = $1 OR scope = 'depot:all') AND seq > $2
		ORDER BY seq ASC
		LIMIT 100
	`, scope, lastSeq)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var seq int64
		var eventType string
		var payload json.RawMessage
		if err := rows.Scan(&seq, &eventType, &payload); err == nil {
			_, _ = fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", seq, eventType, string(payload))
			flusher.Flush()
		}
	}
}
