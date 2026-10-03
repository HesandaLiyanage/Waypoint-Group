package config

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConfig_Load(t *testing.T) {
	_ = os.Setenv("JWT_SECRET", "short")
	_, err := Load()
	assert.Error(t, err, "JWT secret shorter than 32 characters should fail validation")

	_ = os.Setenv("JWT_SECRET", "super-secret-jwt-key-change-in-production-32chars")
	_ = os.Setenv("API_PORT", "9090")
	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, "9090", cfg.Port)
	assert.True(t, cfg.DemoMode)
}
