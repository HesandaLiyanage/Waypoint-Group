package sync

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/response"
)

type Handler struct {
	mu           sync.RWMutex
	eventLog     []SyncEvent
	cursorNumber int64
}

func NewHandler() *Handler {
	return &Handler{
		eventLog:     make([]SyncEvent, 0),
		cursorNumber: time.Now().UnixMilli(),
	}
}

func (h *Handler) Push(w http.ResponseWriter, r *http.Request) {
	var req SyncPushRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	acks := make([]SyncAck, 0, len(req.Events))

	for _, evt := range req.Events {
		// Append to server event log
		h.eventLog = append(h.eventLog, evt)
		h.cursorNumber++

		acks = append(acks, SyncAck{
			EventID: evt.EventID,
			Status:  "ACK",
		})
	}

	newCursor := fmt.Sprintf("%d", h.cursorNumber)

	response.JSON(w, http.StatusOK, SyncPushResponse{
		Acks:      acks,
		NewCursor: newCursor,
	})
}

func (h *Handler) Pull(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	// Returns any events in the log
	newCursor := fmt.Sprintf("%d", h.cursorNumber)

	response.JSON(w, http.StatusOK, SyncPullResponse{
		Events:     h.eventLog,
		NextCursor: newCursor,
		HasMore:    false,
	})
}
