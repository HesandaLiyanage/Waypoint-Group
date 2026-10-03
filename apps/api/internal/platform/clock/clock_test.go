package clock

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestDemoClock(t *testing.T) {
	initial, _ := time.Parse(time.RFC3339, "2026-10-05T03:30:00+05:30")
	clk := NewDemoClock(&initial)

	assert.Equal(t, 2026, clk.Now().Year())
	assert.Equal(t, time.October, clk.Now().Month())
	assert.Equal(t, 5, clk.Now().Day())
	assert.Equal(t, 3, clk.Now().Hour())
	assert.Equal(t, 30, clk.Now().Minute())

	// Advance clock by 45 minutes
	clk.Advance(45 * time.Minute)
	assert.Equal(t, 4, clk.Now().Hour())
	assert.Equal(t, 15, clk.Now().Minute())

	// Set arbitrary time
	target, _ := time.Parse(time.RFC3339, "2026-10-06T16:00:00+05:30")
	clk.SetSimulatedNow(target)
	assert.Equal(t, 6, clk.Now().Day())
	assert.Equal(t, 16, clk.Now().Hour())

	// Reset reverts to current time
	clk.Reset()
	assert.True(t, time.Since(clk.Now()) < 2*time.Second)
}
