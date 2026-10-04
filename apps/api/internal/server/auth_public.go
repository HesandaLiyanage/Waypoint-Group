package server

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"net/http"
	"net/mail"
	"regexp"
	"strings"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/api"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/auth"
)

var outletIDPattern = regexp.MustCompile(`^OUT[0-9]{3}$`)

// registerPublicAuth mounts the three endpoints the signed-out screens need.
func (s *Server) registerPublicAuth(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/auth/facilities", s.facilities)
	mux.HandleFunc("POST /api/v1/auth/register", s.register)
	mux.HandleFunc("POST /api/v1/auth/login-outlet", s.loginOutlet)
}

// facilities lists the depots and outlets a new account can be assigned to (reference data only).
func (s *Server) facilities(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(), `SELECT outlet_id,district,brand,depot FROM outlets ORDER BY outlet_id`)
	if err != nil {
		failure(w, err)
		return
	}
	defer rows.Close()
	type outlet struct {
		OutletID string `json:"outlet_id"`
		District string `json:"district"`
		Brand    string `json:"brand"`
		Depot    string `json:"depot"`
	}
	outlets := []outlet{}
	for rows.Next() {
		var o outlet
		if err := rows.Scan(&o.OutletID, &o.District, &o.Brand, &o.Depot); err == nil {
			outlets = append(outlets, o)
		}
	}
	respond(w, 200, map[string]interface{}{"depots": []string{"Peliyagoda", "Kandy"}, "outlets": outlets})
}

type registerRequest struct {
	Role     string `json:"role"`
	Name     string `json:"name"`
	WorkID   string `json:"work_id"`
	Station  string `json:"station"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Password string `json:"password"`
}

// register creates an inactive account. Nobody gets access until a dispatcher approves the request.
func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var in registerRequest
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		respond(w, 400, map[string]string{"detail": "Invalid request"})
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.Name = strings.TrimSpace(in.Name)
	bad := func(msg string) { respond(w, 400, map[string]string{"detail": msg}) }
	if in.Name == "" || strings.TrimSpace(in.WorkID) == "" {
		bad("Name and work ID are required")
		return
	}
	if _, err := mail.ParseAddress(in.Email); err != nil {
		bad("Enter a valid work email")
		return
	}
	if len(in.Password) < 8 {
		bad("Password must be at least 8 characters")
		return
	}
	var depot string
	var outlet *string
	switch in.Role {
	case "store_manager":
		if err := s.pool.QueryRow(r.Context(), `SELECT depot FROM outlets WHERE outlet_id=$1`, in.Station).Scan(&depot); err != nil {
			bad("Choose your outlet")
			return
		}
		outlet = &in.Station
	case "dispatcher", "loader", "driver":
		if in.Station != "Peliyagoda" && in.Station != "Kandy" {
			bad("Choose your depot")
			return
		}
		depot = in.Station
	default:
		bad("Choose a role")
		return
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		failure(w, err)
		return
	}
	_, err = s.pool.Exec(r.Context(), `INSERT INTO users(id,name,email,password_hash,role,depot,outlet_id,locale,active,phone,work_id) VALUES($1,$2,$3,$4,$5,$6,$7,'en',false,$8,$9)`,
		uuid.New(), in.Name, in.Email, hash, in.Role, depot, outlet, strings.TrimSpace(in.Phone), strings.TrimSpace(in.WorkID))
	if err != nil {
		respond(w, 409, map[string]string{"detail": "An account with this email already exists"})
		return
	}
	respond(w, 201, map[string]string{"status": "pending", "detail": "Your request was sent to your depot coordinator for approval."})
}

// loginOutlet signs a store in by outlet ID. It finds the account whose password matches, then reuses the normal login.
func (s *Server) loginOutlet(w http.ResponseWriter, r *http.Request) {
	var in struct {
		OutletID string `json:"outlet_id"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || !outletIDPattern.MatchString(strings.ToUpper(strings.TrimSpace(in.OutletID))) {
		respond(w, 400, map[string]string{"detail": "Use the outlet ID format OUT047"})
		return
	}
	rows, err := s.pool.Query(r.Context(), `SELECT email,password_hash FROM users WHERE outlet_id=$1 AND role='store_manager'`, strings.ToUpper(strings.TrimSpace(in.OutletID)))
	if err != nil {
		failure(w, err)
		return
	}
	var email string
	for rows.Next() {
		var e, h string
		if rows.Scan(&e, &h) == nil {
			if ok, _ := auth.VerifyPassword(in.Password, h); ok {
				email = e
				break
			}
		}
	}
	rows.Close()
	if email == "" {
		respond(w, 401, map[string]string{"detail": "Invalid outlet ID or password"})
		return
	}
	resp, err := s.AuthLogin(r.Context(), api.AuthLoginRequestObject{Body: &api.AuthLoginJSONRequestBody{Email: openapi_types.Email(email), Password: in.Password}})
	if err != nil {
		failure(w, err)
		return
	}
	if err := resp.VisitAuthLoginResponse(w); err != nil {
		failure(w, err)
	}
}

// userDecision lets a dispatcher approve or reject a pending registration. A driver also needs a vehicle of the same depot.
func (s *Server) userDecision(ctx context.Context, tx pgx.Tx, u *auth.AuthUser, c WorkflowCommand) (map[string]interface{}, error) {
	if u.Role != auth.RoleDispatcher {
		return nil, errors.New("Dispatcher access required")
	}
	var role, depot string
	if err := tx.QueryRow(ctx, `SELECT role,COALESCE(depot,'') FROM users WHERE id=$1 AND active=false FOR UPDATE`, c.UserID).Scan(&role, &depot); err != nil {
		return nil, errors.New("No pending request found")
	}
	if value(u.Depot) != "" && value(u.Depot) != depot {
		return nil, errors.New("Different depot")
	}
	if c.Status == "reject" {
		if _, err := tx.Exec(ctx, `DELETE FROM users WHERE id=$1`, c.UserID); err != nil {
			return nil, err
		}
		return map[string]interface{}{"status": "rejected"}, nil
	}
	var vehicle *string
	if role == "driver" {
		var vDepot string
		if err := tx.QueryRow(ctx, `SELECT depot FROM vehicles WHERE vehicle_id=$1`, c.VehicleID).Scan(&vDepot); err != nil || vDepot != depot {
			return nil, errors.New("Assign a vehicle from the driver's own depot")
		}
		vehicle = &c.VehicleID
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET active=true,vehicle_id=$2 WHERE id=$1`, c.UserID, vehicle); err != nil {
		return nil, err
	}
	return map[string]interface{}{"status": "approved"}, nil
}
