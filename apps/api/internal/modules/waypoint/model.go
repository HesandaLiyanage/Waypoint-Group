package waypoint

import (
	"time"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/modules/auth"
)

type WaypointStatus string

const (
	StatusPending    WaypointStatus = "pending"
	StatusAssigned   WaypointStatus = "assigned"
	StatusInProgress WaypointStatus = "in_progress"
	StatusCompleted  WaypointStatus = "completed"
	StatusFailed     WaypointStatus = "failed"
	StatusCancelled  WaypointStatus = "cancelled"
)

type Waypoint struct {
	ID           string             `json:"id"`
	Title        string             `json:"title"`
	Description  string             `json:"description,omitempty"`
	Status       WaypointStatus     `json:"status"`
	Latitude     float64            `json:"latitude"`
	Longitude    float64            `json:"longitude"`
	AssignedTo   *string            `json:"assigned_to,omitempty"`
	AssignedRole *auth.UserRole     `json:"assigned_role,omitempty"`
	DueAt        *time.Time         `json:"due_at,omitempty"`
	CompletedAt  *time.Time         `json:"completed_at,omitempty"`
	Notes        string             `json:"notes,omitempty"`
	CreatedAt    time.Time          `json:"created_at"`
	UpdatedAt    time.Time          `json:"updated_at"`
	Version      int                `json:"version"`
}

type CreateWaypointRequest struct {
	Title        string         `json:"title"`
	Description  string         `json:"description,omitempty"`
	Latitude     float64        `json:"latitude"`
	Longitude    float64        `json:"longitude"`
	AssignedTo   *string        `json:"assigned_to,omitempty"`
	AssignedRole *auth.UserRole `json:"assigned_role,omitempty"`
	DueAt        *time.Time     `json:"due_at,omitempty"`
}

type UpdateStatusRequest struct {
	Status WaypointStatus `json:"status"`
	Notes  string         `json:"notes,omitempty"`
}
