package tz

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestColomboTimezone(t *testing.T) {
	assert.NotNil(t, Colombo)
	assert.Equal(t, "Asia/Colombo", Colombo.String())

	utcTime := time.Date(2026, 10, 5, 0, 0, 0, 0, time.UTC)
	colomboTime := InColombo(utcTime)

	// UTC+05:30 offset check
	_, offset := colomboTime.Zone()
	expectedOffset := 5*3600 + 30*60 // 19800 seconds
	assert.Equal(t, expectedOffset, offset)

	assert.Equal(t, 5, colomboTime.Hour())
	assert.Equal(t, 30, colomboTime.Minute())
}
