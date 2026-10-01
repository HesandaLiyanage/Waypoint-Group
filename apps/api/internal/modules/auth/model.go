package auth

import "time"

type UserRole string

const (
	RoleAdmin      UserRole = "admin"
	RoleDispatcher UserRole = "dispatcher"
	RoleFieldAgent UserRole = "field_agent"
	RoleDriver     UserRole = "driver"
)

type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Role      UserRole  `json:"role"`
	Phone     string    `json:"phone,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}
