package server

import (
	"context"
	"testing"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/api"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/auth"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/clock"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestServer_GetHealthz(t *testing.T) {
	srv := &Server{}
	resp, err := srv.GetHealthz(context.Background(), api.GetHealthzRequestObject{})
	require.NoError(t, err)

	healthResp, ok := resp.(api.GetHealthz200JSONResponse)
	require.True(t, ok)
	assert.Equal(t, "ok", *healthResp.Status)
}

func TestServer_GetMe_Authenticated(t *testing.T) {
	srv := &Server{
		clk: clock.NewRealClock(),
	}
	depot := "Peliyagoda"
	testUser := &auth.AuthUser{
		ID:     uuid.New(),
		Email:  "dispatcher@waypoint.local",
		Name:   "Dispatcher Test",
		Role:   auth.RoleDispatcher,
		Depot:  &depot,
		Locale: "en",
	}

	ctx := auth.WithUser(context.Background(), testUser)
	resp, err := srv.GetMe(ctx, api.GetMeRequestObject{})
	require.NoError(t, err)

	userResp, ok := resp.(api.GetMe200JSONResponse)
	require.True(t, ok)
	assert.Equal(t, testUser.ID, userResp.Id)
	assert.Equal(t, "dispatcher@waypoint.local", string(userResp.Email))
	assert.Equal(t, "Peliyagoda", *userResp.Depot)
	assert.Equal(t, api.Dispatcher, userResp.Role)
}
