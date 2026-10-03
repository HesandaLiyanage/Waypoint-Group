package sse

import (
	"testing"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/auth"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestDeriveScope(t *testing.T) {
	peliyagoda := "Peliyagoda"
	veh001 := "VEH-001"
	outlet001 := "OUT-FRESH-001"
	userID := uuid.New()

	// Anonymous / nil
	assert.Equal(t, "anonymous", DeriveScope(nil))

	// Dispatcher
	dispatcher := &auth.AuthUser{ID: userID, Role: auth.RoleDispatcher, Depot: &peliyagoda}
	assert.Equal(t, "depot:Peliyagoda", DeriveScope(dispatcher))

	centralDispatcher := &auth.AuthUser{ID: userID, Role: auth.RoleDispatcher, Depot: nil}
	assert.Equal(t, "depot:all", DeriveScope(centralDispatcher))

	// Loader
	loader := &auth.AuthUser{ID: userID, Role: auth.RoleLoader, Depot: &peliyagoda}
	assert.Equal(t, "depot:Peliyagoda", DeriveScope(loader))

	// Driver
	driver := &auth.AuthUser{ID: userID, Role: auth.RoleDriver, VehicleID: &veh001}
	assert.Equal(t, "vehicle:VEH-001", DeriveScope(driver))

	// Store Manager
	storeMgr := &auth.AuthUser{ID: userID, Role: auth.RoleStoreManager, OutletID: &outlet001}
	assert.Equal(t, "outlet:OUT-FRESH-001", DeriveScope(storeMgr))
}
