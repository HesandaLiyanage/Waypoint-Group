package waypoint

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/modules/auth"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/response"
)

type Handler struct {
	mu        sync.RWMutex
	waypoints map[string]Waypoint
}

func NewHandler() *Handler {
	now := time.Now()
	dueLater := now.Add(4 * time.Hour)

	fieldRole := auth.RoleFieldAgent
	driverRole := auth.RoleDriver

	// Seed with Sri Lankan waypoints
	initial := map[string]Waypoint{
		"wp-001": {
			ID:           "wp-001",
			Title:        "Colombo Port Logistics Hub - Terminal Inspection",
			Description:  "Inspect container bay 4B and verify security seal manifests",
			Status:       StatusInProgress,
			Latitude:     6.9437,
			Longitude:    79.8519,
			AssignedRole: &fieldRole,
			DueAt:        &dueLater,
			CreatedAt:    now.Add(-2 * time.Hour),
			UpdatedAt:    now.Add(-30 * time.Minute),
			Version:      1,
		},
		"wp-002": {
			ID:           "wp-002",
			Title:        "Kandy Express Cargo Delivery",
			Description:  "Delivery of medical supplies to Kandy General Hospital depot",
			Status:       StatusAssigned,
			Latitude:     7.2906,
			Longitude:    80.6337,
			AssignedRole: &driverRole,
			DueAt:        &dueLater,
			CreatedAt:    now.Add(-3 * time.Hour),
			UpdatedAt:    now.Add(-1 * time.Hour),
			Version:      1,
		},
		"wp-003": {
			ID:           "wp-003",
			Title:        "Galle Coastal Station Environmental Audit",
			Description:  "Collect sensor telemetry and water quality telemetry",
			Status:       StatusPending,
			Latitude:     6.0328,
			Longitude:    80.2170,
			AssignedRole: &fieldRole,
			DueAt:        &dueLater,
			CreatedAt:    now.Add(-5 * time.Hour),
			UpdatedAt:    now.Add(-5 * time.Hour),
			Version:      1,
		},
		"wp-004": {
			ID:           "wp-004",
			Title:        "Katunayake Air Cargo Transshipment",
			Description:  "Pickup high-value avionics crate from BIA cargo holding area",
			Status:       StatusCompleted,
			Latitude:     7.1808,
			Longitude:    79.8841,
			AssignedRole: &driverRole,
			DueAt:        &dueLater,
			CreatedAt:    now.Add(-6 * time.Hour),
			UpdatedAt:    now.Add(-10 * time.Minute),
			Version:      2,
		},
	}

	return &Handler{
		waypoints: initial,
	}
}

func (h *Handler) ListWaypoints(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	statusFilter := r.URL.Query().Get("status")
	roleFilter := r.URL.Query().Get("assigned_role")

	list := make([]Waypoint, 0, len(h.waypoints))
	for _, wp := range h.waypoints {
		if statusFilter != "" && string(wp.Status) != statusFilter {
			continue
		}
		if roleFilter != "" && (wp.AssignedRole == nil || string(*wp.AssignedRole) != roleFilter) {
			continue
		}
		list = append(list, wp)
	}

	response.JSON(w, http.StatusOK, list)
}

func (h *Handler) CreateWaypoint(w http.ResponseWriter, r *http.Request) {
	var req CreateWaypointRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	id := fmt.Sprintf("wp-%03d", len(h.waypoints)+1)
	now := time.Now()

	wp := Waypoint{
		ID:           id,
		Title:        req.Title,
		Description:  req.Description,
		Status:       StatusPending,
		Latitude:     req.Latitude,
		Longitude:    req.Longitude,
		AssignedTo:   req.AssignedTo,
		AssignedRole: req.AssignedRole,
		DueAt:        req.DueAt,
		CreatedAt:    now,
		UpdatedAt:    now,
		Version:      1,
	}

	h.waypoints[id] = wp
	response.JSON(w, http.StatusCreated, wp)
}

func (h *Handler) GetWaypoint(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	h.mu.RLock()
	wp, exists := h.waypoints[id]
	h.mu.RUnlock()

	if !exists {
		response.Error(w, http.StatusNotFound, "Waypoint not found")
		return
	}

	response.JSON(w, http.StatusOK, wp)
}

func (h *Handler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var req UpdateStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	wp, exists := h.waypoints[id]
	if !exists {
		response.Error(w, http.StatusNotFound, "Waypoint not found")
		return
	}

	wp.Status = req.Status
	wp.Notes = req.Notes
	wp.UpdatedAt = time.Now()
	wp.Version++

	if req.Status == StatusCompleted {
		t := time.Now()
		wp.CompletedAt = &t
	}

	h.waypoints[id] = wp
	response.JSON(w, http.StatusOK, wp)
}
