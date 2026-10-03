package eta

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHeuristicPredictor_Calculations(t *testing.T) {
	predictor := NewHeuristicPredictor()
	ctx := context.Background()

	features := []StopFeatures{
		{
			StopID:              "stop-1",
			Brand:               "Fresh",
			DockType:            "street",
			ServiceAllowanceMin: 15.0,
			UnitCount:           500,
			PlannedArrivalMin:   120.0,
			WindowCloseMin:      180.0, // 60 min slack -> very low late prob
			RoadClass:           "A",
			Monsoon:             0,
		},
		{
			StopID:              "stop-2",
			Brand:               "Fresh",
			DockType:            "rear_dock",
			ServiceAllowanceMin: 20.0,
			UnitCount:           100,
			PlannedArrivalMin:   190.0,
			WindowCloseMin:      180.0, // -10 min negative slack -> high late prob
			RoadClass:           "C",   // multiplier 1.35
			Monsoon:             1,     // multiplier 1.25
		},
	}

	predictions, err := predictor.Predict(ctx, features)
	require.NoError(t, err)
	require.Len(t, predictions, 2)

	// Stop 1: Large positive slack -> late prob should be very low (< 0.05)
	p1 := predictions[0]
	assert.Equal(t, "stop-1", p1.StopID)
	assert.Equal(t, "rule", p1.Source)
	assert.True(t, p1.ServiceMin > 15.0, "Service duration with 500 units should exceed base 15 min")
	assert.True(t, p1.LateProb < 0.05, "Ample slack should have <5% late prob")

	// Stop 2: Negative slack under monsoon and C road -> late prob should be high (> 0.70)
	p2 := predictions[1]
	assert.Equal(t, "stop-2", p2.StopID)
	assert.True(t, p2.LateProb > 0.70, "Negative slack under adverse conditions should have high late prob")
}

func TestHTTPPredictor_FallbackWhenDown(t *testing.T) {
	// Point to non-existent ML service URL
	predictor := NewHTTPPredictor("http://127.0.0.1:59999")
	ctx := context.Background()

	features := []StopFeatures{
		{
			StopID:              "stop-fallback",
			Brand:               "Fresh",
			DockType:            "street",
			ServiceAllowanceMin: 15.0,
			UnitCount:           200,
			PlannedArrivalMin:   100.0,
			WindowCloseMin:      120.0,
			RoadClass:           "B",
			Monsoon:             0,
		},
	}

	// Should not error, but fallback to rule-based heuristic
	predictions, err := predictor.Predict(ctx, features)
	require.NoError(t, err)
	require.Len(t, predictions, 1)
	assert.Equal(t, "rule", predictions[0].Source)
	assert.Equal(t, "stop-fallback", predictions[0].StopID)
	assert.True(t, predictions[0].ServiceMin > 0)
}
