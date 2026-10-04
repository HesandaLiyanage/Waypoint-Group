package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/argon2"
)

var (
	ErrUnauthorized = errors.New("unauthorized")
	ErrForbidden    = errors.New("forbidden")
)

type UserRole string

const (
	RoleDispatcher   UserRole = "dispatcher"
	RoleLoader       UserRole = "loader"
	RoleDriver       UserRole = "driver"
	RoleStoreManager UserRole = "store_manager"
)

type AuthUser struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Role      UserRole  `json:"role"`
	Depot     *string   `json:"depot,omitempty"`
	OutletID  *string   `json:"outlet_id,omitempty"`
	VehicleID *string   `json:"vehicle_id,omitempty"`
	Locale    string    `json:"locale"`
}

type Claims struct {
	UserID    uuid.UUID `json:"user_id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Role      UserRole  `json:"role"`
	Depot     *string   `json:"depot,omitempty"`
	OutletID  *string   `json:"outlet_id,omitempty"`
	VehicleID *string   `json:"vehicle_id,omitempty"`
	Locale    string    `json:"locale"`
	jwt.RegisteredClaims
}

type TokenService struct {
	jwtSecret []byte
	accessTTL time.Duration
}

func NewTokenService(jwtSecret string) *TokenService {
	return &TokenService{
		jwtSecret: []byte(jwtSecret),
		accessTTL: 15 * time.Minute,
	}
}

// GenerateAccessToken produces a 15-minute signed JWT access token.
func (s *TokenService) GenerateAccessToken(u *AuthUser) (string, error) {
	now := time.Now().UTC()
	claims := Claims{
		UserID:    u.ID,
		Email:     u.Email,
		Name:      u.Name,
		Role:      u.Role,
		Depot:     u.Depot,
		OutletID:  u.OutletID,
		VehicleID: u.VehicleID,
		Locale:    u.Locale,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   u.ID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.accessTTL)),
			Issuer:    "waypoint-api",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

// ValidateAccessToken verifies and parses an incoming JWT access token.
func (s *TokenService) ValidateAccessToken(tokenStr string) (*AuthUser, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.jwtSecret, nil
	})
	if err != nil || !token.Valid {
		return nil, ErrUnauthorized
	}

	claims, ok := token.Claims.(*Claims)
	if !ok {
		return nil, ErrUnauthorized
	}

	return &AuthUser{
		ID:        claims.UserID,
		Email:     claims.Email,
		Name:      claims.Name,
		Role:      claims.Role,
		Depot:     claims.Depot,
		OutletID:  claims.OutletID,
		VehicleID: claims.VehicleID,
		Locale:    claims.Locale,
	}, nil
}

// Middleware parses the Bearer JWT token or cookie if present and attaches AuthUser to context.
func (s *TokenService) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var tokenStr string
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
		} else if cookie, err := r.Cookie("access_token"); err == nil {
			tokenStr = cookie.Value
		}

		if tokenStr != "" {
			if user, err := s.ValidateAccessToken(tokenStr); err == nil && user != nil {
				ctx := WithUser(r.Context(), user)
				r = r.WithContext(ctx)
			}
		}
		next.ServeHTTP(w, r)
	})
}

// RequireUser rejects requests without a valid session unless the path is public.
func RequireUser(public func(path string) bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions || public(r.URL.Path) || GetUser(r.Context()) != nil {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/problem+json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in required"}`))
	})
}

// Argon2id Password Hashing params
const (
	argonMemory      = 64 * 1024
	argonIterations  = 3
	argonParallelism = 2
	argonSaltLength  = 16
	argonKeyLength   = 32
)

// HashPassword hashes a plain text password using argon2id.
func HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	hash := argon2.IDKey([]byte(password), salt, argonIterations, argonMemory, argonParallelism, argonKeyLength)

	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonIterations, argonParallelism, b64Salt, b64Hash), nil
}

// VerifyPassword verifies a plain text password against an argon2id hash.
func VerifyPassword(password, encodedHash string) (bool, error) {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, fmt.Errorf("invalid hash format")
	}

	var version int
	var memory uint32
	var iterations uint32
	var parallelism uint8

	_, err := fmt.Sscanf(parts[2], "v=%d", &version)
	if err != nil {
		return false, err
	}
	_, err = fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &parallelism)
	if err != nil {
		return false, err
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, err
	}

	decodedHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, err
	}

	computedHash := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, uint32(len(decodedHash)))

	if subtle.ConstantTimeCompare(decodedHash, computedHash) == 1 {
		return true, nil
	}
	return false, nil
}

// GenerateRandomToken generates a cryptographic random hex string.
func GenerateRandomToken(nBytes int) (string, error) {
	b := make([]byte, nBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// Authorization Policy Layer
type Resource struct {
	Depot     *string
	OutletID  *string
	VehicleID *string
}

// Authorize implements unified object-level authorization across roles:
// - Dispatcher: can only manage within their own assigned depot (or all if depot is nil).
// - Loader: can only access trips/manifests for their assigned depot.
// - Driver: can only access runs/stops for their assigned vehicle.
// - Store Manager: can only access orders/schedules for their assigned outlet.
func Authorize(actor *AuthUser, action string, res *Resource) error {
	if actor == nil {
		return ErrUnauthorized
	}

	if res == nil {
		return nil
	}

	switch actor.Role {
	case RoleDispatcher:
		if actor.Depot != nil && res.Depot != nil && *actor.Depot != *res.Depot {
			return ErrForbidden
		}
		return nil

	case RoleLoader:
		if actor.Depot != nil && res.Depot != nil && *actor.Depot != *res.Depot {
			return ErrForbidden
		}
		return nil

	case RoleDriver:
		if actor.VehicleID != nil && res.VehicleID != nil && *actor.VehicleID != *res.VehicleID {
			return ErrForbidden
		}
		return nil

	case RoleStoreManager:
		if actor.OutletID != nil && res.OutletID != nil && *actor.OutletID != *res.OutletID {
			return ErrForbidden
		}
		return nil

	default:
		return ErrForbidden
	}
}

type authContextKey string

const UserContextKey authContextKey = "auth_user_ctx"

func WithUser(ctx context.Context, u *AuthUser) context.Context {
	return context.WithValue(ctx, UserContextKey, u)
}

func GetUser(ctx context.Context) *AuthUser {
	if u, ok := ctx.Value(UserContextKey).(*AuthUser); ok {
		return u
	}
	return nil
}
