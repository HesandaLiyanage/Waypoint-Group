package planning

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"pgregory.net/rapid"
)

func TestPlanner_Determinism(t *testing.T) {
	ref := sampleRefData()
	defaultFresh, _ := time.Parse("15:04", "03:30")
	defaultStyle, _ := time.Parse("15:04", "07:00")

	var orders []OrderPlanningContext
	for i := 1; i <= 10; i++ {
		orders = append(orders, OrderPlanningContext{
			Order: PlanOrder{
				ID:              uuid.New(),
				Ref:             fmt.Sprintf("ORD-%03d", i),
				OutletID:        "OUT-001",
				Brand:           "Fresh",
				DeliveryDate:    "2026-10-05",
				TempRequirement: "chilled",
				TotalUnits:      20,
				TotalWeightG:    20000,
				TotalVolumeUl:   20000000,
			},
			DaysSinceLastServed: i,
		})
	}

	res1, err := Plan(context.Background(), "Peliyagoda", "2026-10-05", StrategyFairnessFirst, orders, ref, nil, defaultFresh, defaultStyle, 15)
	require.NoError(t, err)

	res2, err := Plan(context.Background(), "Peliyagoda", "2026-10-05", StrategyFairnessFirst, orders, ref, nil, defaultFresh, defaultStyle, 15)
	require.NoError(t, err)

	assert.Equal(t, len(res1.Plan.Trips), len(res2.Plan.Trips), "Trip counts must match")
	assert.Equal(t, res1.Summary.ServedOrders, res2.Summary.ServedOrders, "Served orders must match exactly")
	assert.Equal(t, res1.Summary.DeferredOrders, res2.Summary.DeferredOrders, "Deferred orders must match exactly")
}

func TestPlanner_RapidPropertyTests(t *testing.T) {
	ref := sampleRefData()
	defaultFresh, _ := time.Parse("15:04", "03:30")
	defaultStyle, _ := time.Parse("15:04", "07:00")

	rapid.Check(t, func(rt *rapid.T) {
		nOrders := rapid.IntRange(1, 15).Draw(rt, "nOrders")
		var orders []OrderPlanningContext

		for i := 0; i < nOrders; i++ {
			isChilled := rapid.Bool().Draw(rt, "isChilled")
			temp := "ambient"
			if isChilled {
				temp = "chilled"
			}

			units := rapid.IntRange(5, 50).Draw(rt, "units")
			weightG := int64(units) * 1000
			volUl := int64(units) * 1000000

			orders = append(orders, OrderPlanningContext{
				Order: PlanOrder{
					ID:              uuid.New(),
					Ref:             fmt.Sprintf("ORD-PROP-%03d", i),
					OutletID:        "OUT-001",
					Brand:           "Fresh",
					DeliveryDate:    "2026-10-05",
					TempRequirement: temp,
					TotalUnits:      units,
					TotalWeightG:    weightG,
					TotalVolumeUl:   volUl,
				},
				DaysSinceLastServed: rapid.IntRange(0, 5).Draw(rt, "daysSinceServed"),
				DeferredYesterday:   rapid.Bool().Draw(rt, "deferredYesterday"),
			})
		}

		res, err := Plan(context.Background(), "Peliyagoda", "2026-10-05", StrategyFairnessFirst, orders, ref, nil, defaultFresh, defaultStyle, 15)
		require.NoError(rt, err)

		// Invariant 1: Output plan always passes Validate with 0 hard violations
		violations := Validate(res.Plan, ref, nil)
		for _, v := range violations {
			assert.NotEqual(rt, SeverityHard, v.Severity, fmt.Sprintf("Hard violation detected: %s (%s)", v.Code, v.Message))
		}

		// Invariant 2: No order is both served and deferred
		servedMap := make(map[uuid.UUID]bool)
		for _, trip := range res.Plan.Trips {
			for _, stop := range trip.Stops {
				servedMap[stop.Order.ID] = true
			}
		}

		for _, def := range res.Deferrals {
			assert.False(rt, servedMap[def.OrderID], "Order cannot be both served and deferred")
		}

		// Invariant 3: Sum of served + deferred equals total orders
		assert.Equal(rt, len(orders), len(servedMap)+len(res.Deferrals), "Every input order must be accounted for")
	})
}

func TestPlanner_VanOnlyConstraint(t *testing.T) {
	ref := sampleRefData()
	defaultFresh, _ := time.Parse("15:04", "03:30")
	defaultStyle, _ := time.Parse("15:04", "07:00")

	// Order for OUT-002 which has parking_constraint = "van_only"
	orders := []OrderPlanningContext{
		{
			Order: PlanOrder{
				ID:              uuid.New(),
				Ref:             "ORD-VAN-001",
				OutletID:        "OUT-002",
				Brand:           "Fresh",
				DeliveryDate:    "2026-10-05",
				TempRequirement: "chilled",
				TotalUnits:      10,
				TotalWeightG:    10000,
				TotalVolumeUl:   10000000,
			},
		},
	}

	res, err := Plan(context.Background(), "Peliyagoda", "2026-10-05", StrategyFairnessFirst, orders, ref, nil, defaultFresh, defaultStyle, 15)
	require.NoError(t, err)

	require.Equal(t, 1, res.Summary.ServedOrders)
	require.Len(t, res.Plan.Trips, 1)
	// Must be assigned to VEH-VAN, never to a truck
	assert.Equal(t, "VEH-VAN", res.Plan.Trips[0].VehicleID)
}

func TestPlanner_FuelQuotaEnforcement(t *testing.T) {
	ref := sampleRefData()
	defaultFresh, _ := time.Parse("15:04", "03:30")
	defaultStyle, _ := time.Parse("15:04", "07:00")

	orders := []OrderPlanningContext{
		{
			Order: PlanOrder{
				ID:              uuid.New(),
				Ref:             "ORD-FUEL-001",
				OutletID:        "OUT-001",
				Brand:           "Fresh",
				DeliveryDate:    "2026-10-05",
				TempRequirement: "ambient",
				TotalUnits:      10,
				TotalWeightG:    10000,
				TotalVolumeUl:   10000000,
			},
		},
	}

	// Fuel remaining set to very low: only 500 mL remaining for each vehicle
	fuelRemaining := map[string]int64{
		"VEH-REEFER":  500,
		"VEH-AMBIENT": 500,
		"VEH-VAN":     500,
	}

	res, err := Plan(context.Background(), "Peliyagoda", "2026-10-05", StrategyFairnessFirst, orders, ref, fuelRemaining, defaultFresh, defaultStyle, 15)
	require.NoError(t, err)

	// Since 500 mL is insufficient for a ~30 km return trip, the order must be deferred with FUEL_QUOTA!
	assert.Equal(t, 0, res.Summary.ServedOrders)
	assert.Equal(t, 1, res.Summary.DeferredOrders)
	require.Len(t, res.Deferrals, 1)
	assert.Equal(t, CodeFuelQuota, res.Deferrals[0].ReasonCode)
}

func TestPlanner_Trip2DepartureReturnLeg(t *testing.T) {
	ref := sampleRefData()
	// Add an outlet in Gampaha with normal parking constraint
	ref.Outlets["OUT-GAMPAHA-NORMAL"] = OutletRef{
		OutletID:          "OUT-GAMPAHA-NORMAL",
		Brand:             "Fresh",
		District:          "Gampaha",
		Depot:             "Peliyagoda",
		DockType:          "rear_dock",
		ParkingConstraint: "normal",
		WindowOpenTime:    "04:00:00",
		WindowCloseTime:   "08:00:00",
	}

	// Only give 1 vehicle so both trips must be scheduled on the same vehicle
	ref.Vehicles = map[string]VehicleRef{
		"VEH-REEFER": ref.Vehicles["VEH-REEFER"],
	}

	defaultFresh, _ := time.Parse("15:04", "03:30")
	defaultStyle, _ := time.Parse("15:04", "07:00")

	// Order 1 is to Gampaha (depot-to-district freeflow = 37 min, service allowance = 15 min)
	// Order 2 is to Colombo (depot-to-district freeflow = 24 min, service allowance = 16 min)
	orders := []OrderPlanningContext{
		{
			Order: PlanOrder{
				ID:              uuid.New(),
				Ref:             "ORD-TRIP1",
				OutletID:        "OUT-GAMPAHA-NORMAL", // Gampaha
				Brand:           "Fresh",
				DeliveryDate:    "2026-10-05",
				TempRequirement: "chilled",
				TotalUnits:      10,
				TotalWeightG:    10000,
				TotalVolumeUl:   10000000,
			},
		},
		{
			Order: PlanOrder{
				ID:              uuid.New(),
				Ref:             "ORD-TRIP2",
				OutletID:        "OUT-001", // Colombo
				Brand:           "Fresh",
				DeliveryDate:    "2026-10-05",
				TempRequirement: "chilled",
				TotalUnits:      10,
				TotalWeightG:    10000,
				TotalVolumeUl:   10000000,
			},
		},
	}

	res, err := Plan(context.Background(), "Peliyagoda", "2026-10-05", StrategyFairnessFirst, orders, ref, nil, defaultFresh, defaultStyle, 15)
	require.NoError(t, err)

	require.Len(t, res.Plan.Trips, 2)
	trip1 := res.Plan.Trips[0]
	trip2 := res.Plan.Trips[1]

	// Trip 1 departs at 03:30
	assert.Equal(t, "03:30", trip1.PlannedDepart.Format("15:04"))

	// Trip 1 is to Gampaha:
	// Outbound: 37 min
	// Service (OUT-002 rear_dock): 15 min
	// Total Trip 1 duration: 37 + 15 = 52 min
	// Return leg from Gampaha: 37 min
	// Reload buffer: 15 min
	// Total elapsed before Trip 2 departs: 52 + 37 + 15 = 104 min
	// 03:30 + 104 min = 05:14!
	assert.Equal(t, "05:14", trip2.PlannedDepart.Format("15:04"))
}
