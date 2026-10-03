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
