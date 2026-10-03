package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestArgon2idPasswordHashing(t *testing.T) {
	password := "SecurePassword123!"

	hash, err := HashPassword(password)
	require.NoError(t, err)
	assert.Contains(t, hash, "$argon2id$")

	// Valid password check
	valid, err := VerifyPassword(password, hash)
	require.NoError(t, err)
	assert.True(t, valid)

	// Wrong password check
	wrong, err := VerifyPassword("WrongPassword!", hash)
	require.NoError(t, err)
	assert.False(t, wrong)
}

func TestTokenService_GenerateAndValidate(t *testing.T) {
	jwtSecret := "test-secret-at-least-32-characters-long"
	svc := NewTokenService(jwtSecret)

	depot := "Peliyagoda"
	user := &AuthUser{
		ID:     uuid.New(),
		Email:  "dispatcher@waypoint.local",
		Name:   "Dispatcher User",
		Role:   RoleDispatcher,
		Depot:  &depot,
		Locale: "en",
	}

	tokenStr, err := svc.GenerateAccessToken(user)
	require.NoError(t, err)
	assert.NotEmpty(t, tokenStr)

	// Parse back
	parsed, err := svc.ValidateAccessToken(tokenStr)
	require.NoError(t, err)
	assert.Equal(t, user.ID, parsed.ID)
	assert.Equal(t, user.Email, parsed.Email)
	assert.Equal(t, user.Role, parsed.Role)
	assert.Equal(t, user.Depot, parsed.Depot)

	// Expired or invalid token check
	_, err = svc.ValidateAccessToken("invalid.jwt.token")
	assert.ErrorIs(t, err, ErrUnauthorized)
}

func TestAuthMiddleware(t *testing.T) {
	jwtSecret := "test-secret-at-least-32-characters-long"
	svc := NewTokenService(jwtSecret)

	user := &AuthUser{
		ID:     uuid.New(),
		Email:  "driver@waypoint.local",
		Role:   RoleDriver,
		Locale: "en",
	}
	tokenStr, err := svc.GenerateAccessToken(user)
	require.NoError(t, err)

	handler := svc.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := GetUser(r.Context())
		if u != nil {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(u.Email))
			return
		}
		w.WriteHeader(http.StatusUnauthorized)
	}))

	// 1. With valid Bearer header
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "driver@waypoint.local", rec.Body.String())

	// 2. With cookie
	reqCookie := httptest.NewRequest("GET", "/test", nil)
	reqCookie.AddCookie(&http.Cookie{Name: "access_token", Value: tokenStr})
	recCookie := httptest.NewRecorder()
	handler.ServeHTTP(recCookie, reqCookie)
	assert.Equal(t, http.StatusOK, recCookie.Code)

	// 3. Unauthenticated request
	reqAnon := httptest.NewRequest("GET", "/test", nil)
	recAnon := httptest.NewRecorder()
	handler.ServeHTTP(recAnon, reqAnon)
	assert.Equal(t, http.StatusUnauthorized, recAnon.Code)
}

func TestAuthorizationMatrix(t *testing.T) {
	peliyagoda := "Peliyagoda"
	kandy := "Kandy"
	veh001 := "VEH-001"
	veh002 := "VEH-002"
	outletFresh1 := "OUT-FRESH-001"
	outletFresh2 := "OUT-FRESH-002"

	// Dispatcher assigned to Peliyagoda
	dispatcherPeli := &AuthUser{
		Role:  RoleDispatcher,
		Depot: &peliyagoda,
	}
	assert.NoError(t, Authorize(dispatcherPeli, "view", &Resource{Depot: &peliyagoda}))
	assert.ErrorIs(t, Authorize(dispatcherPeli, "view", &Resource{Depot: &kandy}), ErrForbidden)

	// Central Dispatcher (nil depot) can manage all depots
	centralDispatcher := &AuthUser{
		Role:  RoleDispatcher,
		Depot: nil,
	}
	assert.NoError(t, Authorize(centralDispatcher, "manage", &Resource{Depot: &kandy}))
	assert.NoError(t, Authorize(centralDispatcher, "manage", &Resource{Depot: &peliyagoda}))

	// Loader assigned to Kandy
	loaderKandy := &AuthUser{
		Role:  RoleLoader,
		Depot: &kandy,
	}
	assert.NoError(t, Authorize(loaderKandy, "load", &Resource{Depot: &kandy}))
	assert.ErrorIs(t, Authorize(loaderKandy, "load", &Resource{Depot: &peliyagoda}), ErrForbidden)

	// Driver assigned to VEH-001
	driver001 := &AuthUser{
		Role:      RoleDriver,
		VehicleID: &veh001,
	}
	assert.NoError(t, Authorize(driver001, "drive", &Resource{VehicleID: &veh001}))
	assert.ErrorIs(t, Authorize(driver001, "drive", &Resource{VehicleID: &veh002}), ErrForbidden)

	// Store Manager assigned to OUT-FRESH-001
	storeMgr := &AuthUser{
		Role:     RoleStoreManager,
		OutletID: &outletFresh1,
	}
	assert.NoError(t, Authorize(storeMgr, "confirm", &Resource{OutletID: &outletFresh1}))
	assert.ErrorIs(t, Authorize(storeMgr, "confirm", &Resource{OutletID: &outletFresh2}), ErrForbidden)
}
