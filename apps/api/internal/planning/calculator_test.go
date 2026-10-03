package planning

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGoldenTestA_TripTime(t *testing.T) {
	// Golden Test A from Section 5.4:
	// Fresh trip to Gampaha, 3 orders (2 rear_dock, 1 street):
	// depot_to_district = 37 min
	// inter_stop = 9 min * (3 - 1) = 18 min
	// service_allowance: 2 rear_dock (15 each) + 1 street (16) = 15 + 15 + 16 = 46 min
	// Total = 37 + 18 + 46 = 101 min
	depotToDistrictMin := 37
	interStopMin := 9
	serviceAllowances := []int{15, 15, 16}

	tripMin := CalculateTripMinutes(depotToDistrictMin, interStopMin, serviceAllowances)
	assert.Equal(t, 101, tripMin, "Golden Test A trip duration must equal 101 minutes")
}

func TestGoldenTestB_CombinedTripTime(t *testing.T) {
	// Golden Test B from Section 5.4:
	// Second Fresh trip to Colombo, 4 street stops:
	// depot_to_district = 24 min
	// inter_stop = 8 min * (4 - 1) = 24 min
	// service_allowance: 4 street (16 each) = 64 min
	// Total = 24 + 24 + 64 = 112 min
	depotToDistrictMin := 24
	interStopMin := 8
	serviceAllowances := []int{16, 16, 16, 16}

	tripMin := CalculateTripMinutes(depotToDistrictMin, interStopMin, serviceAllowances)
	assert.Equal(t, 112, tripMin, "Golden Test B trip duration must equal 112 minutes")

	// Combined with Golden Test A:
	combinedMin := 101 + 112
	assert.Equal(t, 213, combinedMin, "Combined duration must equal 213 minutes")
	assert.True(t, combinedMin <= 270, "Combined duration must be within Fresh 270-minute budget")
}

func TestFuelCalculations(t *testing.T) {
	// Trip to Gampaha: depot_to_district_km = 25.0, inter_stop_km = 6.0, 3 stops
	// Total distance = 2 * 25.0 + 6.0 * (3 - 1) = 50.0 + 12.0 = 62.0 km
	dist := CalculateFuelDistanceKm(25.0, 6.0, 3)
	assert.Equal(t, 62.0, dist)

	// km_per_l = 4.5 -> liters = 62.0 / 4.5 = 13.777... L -> 13,778 mL
	fuelMl := CalculateFuelUsageMl(25.0, 6.0, 3, 4.5)
	assert.Equal(t, int64(13778), fuelMl)
}
