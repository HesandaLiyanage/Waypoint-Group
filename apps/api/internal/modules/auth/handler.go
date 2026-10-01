package auth

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/response"
)

type Handler struct {
	jwtSecret string
}

func NewHandler(jwtSecret string) *Handler {
	return &Handler{jwtSecret: jwtSecret}
}

// Sample mock users for the four role shells
var mockUsers = map[string]User{
	"admin@waypoint.local": {
		ID:        "usr-0001-admin",
		Email:     "admin@waypoint.local",
		Name:      "System Admin",
		Role:      RoleAdmin,
		Phone:     "+94 11 234 5678",
		CreatedAt: time.Now().Add(-24 * time.Hour),
	},
	"dispatcher@waypoint.local": {
		ID:        "usr-0002-dispatcher",
		Email:     "dispatcher@waypoint.local",
		Name:      "Central Dispatcher",
		Role:      RoleDispatcher,
		Phone:     "+94 11 234 5679",
		CreatedAt: time.Now().Add(-24 * time.Hour),
	},
	"field@waypoint.local": {
		ID:        "usr-0003-field",
		Email:     "field@waypoint.local",
		Name:      "Field Agent (Colombo)",
		Role:      RoleFieldAgent,
		Phone:     "+94 77 123 4567",
		CreatedAt: time.Now().Add(-24 * time.Hour),
	},
	"driver@waypoint.local": {
		ID:        "usr-0004-driver",
		Email:     "driver@waypoint.local",
		Name:      "Delivery Driver (Kandy Route)",
		Role:      RoleDriver,
		Phone:     "+94 71 987 6543",
		CreatedAt: time.Now().Add(-24 * time.Hour),
	},
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.Error(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	user, exists := mockUsers[strings.ToLower(req.Email)]
	if !exists {
		// Provide default user if logging in with custom email
		user = User{
			ID:        "usr-dynamic-session",
			Email:     req.Email,
			Name:      strings.Split(req.Email, "@")[0],
			Role:      RoleAdmin,
			CreatedAt: time.Now(),
		}
	}

	// Token string (mock JWT payload for simplicity and offline testability)
	token := "wp_token_" + string(user.Role) + "_" + user.ID

	response.JSON(w, http.StatusOK, AuthResponse{
		Token: token,
		User:  user,
	})
}

func (h *Handler) GetCurrentUser(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		// Return admin user by default for convenience in dev
		response.JSON(w, http.StatusOK, mockUsers["admin@waypoint.local"])
		return
	}

	token := strings.TrimPrefix(authHeader, "Bearer ")
	for _, u := range mockUsers {
		if strings.Contains(token, string(u.Role)) {
			response.JSON(w, http.StatusOK, u)
			return
		}
	}

	response.JSON(w, http.StatusOK, mockUsers["admin@waypoint.local"])
}
