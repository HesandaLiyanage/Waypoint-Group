package planning

import (
	"cmp"
	"context"
	"fmt"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Strategy string

const (
	StrategyFairnessFirst Strategy = "fairness_first"
	StrategyMaxServed     Strategy = "max_served"
)

type OrderPlanningContext struct {
	Order               PlanOrder
	DeferredYesterday   bool
	DaysSinceLastServed int
	WindowCloseMinutes  int
}

type DeferralRecord struct {
	OrderID      uuid.UUID              `json:"order_id"`
	OrderRef     string                 `json:"order_ref"`
	OutletID     string                 `json:"outlet_id"`
	Brand        string                 `json:"brand"`
	ReasonCode   ViolationCode          `json:"reason_code"`
	ReasonParams map[string]interface{} `json:"reason_params"`
	Explanation  map[string]interface{} `json:"explanation"`
	CarriedTo    string                 `json:"carried_to"`
}

type PlannerResult struct {
	Plan             *PlanData
	Summary          PlanSummary
	Deferrals        []DeferralRecord
	Violations       []Violation
	LimitingResource string
}

type PlanSummary struct {
	TotalOrders       int                    `json:"total_orders"`
	ServedOrders      int                    `json:"served_orders"`
	DeferredOrders    int                    `json:"deferred_orders"`
	TotalTrips        int                    `json:"total_trips"`
	ActiveVehicles    int                    `json:"active_vehicles"`
	LimitingResources []string               `json:"limiting_resources"`
	DepotUtilization  map[string]interface{} `json:"depot_utilization"`
}

// Plan executes deterministic greedy best-fit allocation with repair passes (Section 8.2).
func Plan(
	ctx context.Context,
	depot string,
	planDate string,
	strategy Strategy,
	orders []OrderPlanningContext,
	ref RefData,
	fuelRemainingMl map[string]int64,
	defaultFreshDepart time.Time,
	defaultStyleTechDepart time.Time,
	reloadBufferMin int,
) (*PlannerResult, error) {

	// 1. Sort orders according to lexicographic priority policy (Section 5.8)
	sortOrdersByPriority(orders, strategy)

	// 2. Identify available vehicles at depot
	var availableFleet []VehicleRef
	for _, v := range ref.Vehicles {
		if v.Depot != depot {
			continue
		}
		availKey := fmt.Sprintf("%s:%s", v.VehicleID, planDate)
		if status, ok := ref.VehicleAvailability[availKey]; ok && status == "in_workshop" {
			continue
		}
		availableFleet = append(availableFleet, v)
	}

	// Sort fleet deterministically by vehicle_id (tie-break guarantees)
	slices.SortFunc(availableFleet, func(a, b VehicleRef) int {
		return cmp.Compare(a.VehicleID, b.VehicleID)
	})

	plan := &PlanData{
		ID:       uuid.New(),
		Depot:    depot,
		PlanDate: planDate,
		Trips:    []PlanTrip{},
	}

	var deferrals []DeferralRecord
	servedOrders := make(map[uuid.UUID]bool)

	// Base next operating date (default next day or +2 if Saturday)
	nextCarriedDate := computeNextOperatingDay(planDate)

	// 3. Greedy allocation loop
	for _, oc := range orders {
		ord := oc.Order
		outlet, outletExists := ref.Outlets[ord.OutletID]
		if !outletExists {
			deferrals = append(deferrals, DeferralRecord{
				OrderID:    ord.ID,
				OrderRef:   ord.Ref,
				OutletID:   ord.OutletID,
				Brand:      ord.Brand,
				ReasonCode: CodeDepotMismatch,
				Explanation: map[string]interface{}{
					"binding": "OUTLET_NOT_FOUND",
				},
				CarriedTo: nextCarriedDate,
			})
			continue
		}

		district := outlet.District

		// Check if order can be placed into existing open trips of same (brand, district)
		placed := false
		type candidateTrip struct {
			index           int
			tripID          uuid.UUID
			vehicleID       string
			remainingVolUl  int64
			remainingWtG    int64
			tentativeVolume int64
		}
		var validCandidates []candidateTrip

		var bestBindingCode = CodeNoVehicleAtDepot
		var bestBindingParams map[string]interface{}

		for i, trip := range plan.Trips {
			if trip.Brand != ord.Brand || trip.District != district {
				continue
			}

			// Test tentative placement
			tentativeTrip := copyTrip(trip)
			nextSeq := len(tentativeTrip.Stops) + 1
			tentativeTrip.Stops = append(tentativeTrip.Stops, PlanStop{
				ID:     uuid.New(),
				TripID: trip.ID,
				Order:  ord,
				Seq:    nextSeq,
			})

			// Test in tentative plan
			tentativePlan := copyPlan(plan)
			tentativePlan.Trips[i] = tentativeTrip

			violations := Validate(tentativePlan, ref, fuelRemainingMl)
			if len(violations) == 0 {
				veh := ref.Vehicles[trip.VehicleID]
				var currentVolUl int64
				var currentWtG int64
				for _, s := range tentativeTrip.Stops {
					currentVolUl += s.Order.TotalVolumeUl
					currentWtG += s.Order.TotalWeightG
				}
				maxVolUl := int64(veh.VolumeCapM3 * 1000000000.0)
				maxWtG := int64(veh.WeightCapKg * 1000)

				validCandidates = append(validCandidates, candidateTrip{
					index:           i,
					tripID:          trip.ID,
					vehicleID:       trip.VehicleID,
					remainingVolUl:  maxVolUl - currentVolUl,
					remainingWtG:    maxWtG - currentWtG,
					tentativeVolume: currentVolUl,
				})
			} else {
				// Record the most relevant binding constraint
				bestBindingCode = violations[0].Code
				bestBindingParams = violations[0].Params
			}
		}

		if len(validCandidates) > 0 {
			// Best-fit: pick candidate with least remaining volume after insert (Section 8.2)
			slices.SortFunc(validCandidates, func(a, b candidateTrip) int {
				return cmp.Compare(a.remainingVolUl, b.remainingVolUl)
			})

			best := validCandidates[0]
			nextSeq := len(plan.Trips[best.index].Stops) + 1
			plan.Trips[best.index].Stops = append(plan.Trips[best.index].Stops, PlanStop{
				ID:     uuid.New(),
				TripID: plan.Trips[best.index].ID,
				Order:  ord,
				Seq:    nextSeq,
			})
			servedOrders[ord.ID] = true
			placed = true
		}

		if placed {
			continue
		}

		// If no open trip could take it: try opening a new trip slot on an available vehicle
		newTripOpened := false
		for _, veh := range availableFleet {
			// Count existing trips for this vehicle
			vTripsCount := 0
			var trip1Depart time.Time
			var trip1DurationMin int
			var trip1District string
			for _, t := range plan.Trips {
				if t.VehicleID == veh.VehicleID {
					vTripsCount++
					trip1Depart = t.PlannedDepart
					trip1District = t.District
					dtKey := fmt.Sprintf("%s:%s", t.District, depot)
					dt := ref.DistrictTravel[dtKey]
					var allowances []int
					for _, s := range t.Stops {
						out := ref.Outlets[s.Order.OutletID]
						sa := ref.ServiceAllowance[fmt.Sprintf("%s:%s", s.Order.Brand, out.DockType)]
						if sa == 0 {
							sa = 15
						}
						allowances = append(allowances, sa)
					}
					trip1DurationMin = CalculateTripMinutes(dt.DepotToDistrictFreeflowMin, dt.InterStopFreeflowMin, allowances)
				}
			}

			if vTripsCount >= 2 {
				continue
			}

			// Filter vehicle constraints
			if ord.TempRequirement == "chilled" && veh.Temp != "reefer" {
				bestBindingCode = CodeNeedReefer
				continue
			}
			if outlet.ParkingConstraint == "van_only" && veh.Type != "van" {
				bestBindingCode = CodeVanOnly
				continue
			}

			// Capacity check
			maxVolUl := int64(veh.VolumeCapM3 * 1000000000.0)
			maxWtG := int64(veh.WeightCapKg * 1000)
			if ord.TotalVolumeUl > maxVolUl {
				bestBindingCode = CodeCapVolume
				bestBindingParams = map[string]interface{}{
					"needed_m3": float64(ord.TotalVolumeUl) / 1000000000.0,
					"free_m3":   veh.VolumeCapM3,
				}
				continue
			}
			if ord.TotalWeightG > maxWtG {
				bestBindingCode = CodeCapWeight
				continue
			}

			// Determine departure time
			var plannedDepart time.Time
			if vTripsCount == 0 {
				if ord.Brand == "Fresh" {
					plannedDepart = defaultFreshDepart
				} else {
					plannedDepart = defaultStyleTechDepart
				}
			} else {
				// Trip 2 departure: Trip 1 ends + return leg from Trip 1's district + reload buffer (Section 5.7)
				dtKey := fmt.Sprintf("%s:%s", trip1District, depot)
				dt := ref.DistrictTravel[dtKey]
				plannedDepart = trip1Depart.Add(time.Duration(trip1DurationMin+dt.DepotToDistrictFreeflowMin+reloadBufferMin) * time.Minute)
			}

			newTripID := uuid.New()
			tentativeTrip := PlanTrip{
				ID:            newTripID,
				VehicleID:     veh.VehicleID,
				TripNo:        vTripsCount + 1,
				Brand:         ord.Brand,
				District:      district,
				PlannedDepart: plannedDepart,
				Stops: []PlanStop{
					{
						ID:     uuid.New(),
						TripID: newTripID,
						Order:  ord,
						Seq:    1,
					},
				},
			}

			tentativePlan := copyPlan(plan)
			tentativePlan.Trips = append(tentativePlan.Trips, tentativeTrip)

			violations := Validate(tentativePlan, ref, fuelRemainingMl)
			if len(violations) == 0 {
				plan.Trips = append(plan.Trips, tentativeTrip)
				servedOrders[ord.ID] = true
				newTripOpened = true
				break
			} else {
				bestBindingCode = violations[0].Code
				bestBindingParams = violations[0].Params
			}
		}

		if !newTripOpened {
			// Defer order and record exact binding explanation (Section 5.8)
			if bestBindingParams == nil {
				bestBindingParams = make(map[string]interface{})
			}
			deferrals = append(deferrals, DeferralRecord{
				OrderID:      ord.ID,
				OrderRef:     ord.Ref,
				OutletID:     ord.OutletID,
				Brand:        ord.Brand,
				ReasonCode:   bestBindingCode,
				ReasonParams: bestBindingParams,
				Explanation: map[string]interface{}{
					"binding":            string(bestBindingCode),
					"candidates_checked": len(plan.Trips),
					"details":            bestBindingParams,
				},
				CarriedTo: nextCarriedDate,
			})
			plan.Deferrals = append(plan.Deferrals, ord)
		}
	}

	// 4. Summarize resources and compute utilization
	summary := summarizePlan(plan, ref, len(orders), len(deferrals))

	return &PlannerResult{
		Plan:             plan,
		Summary:          summary,
		Deferrals:        deferrals,
		LimitingResource: strings.Join(summary.LimitingResources, "; "),
	}, nil
}

func sortOrdersByPriority(orders []OrderPlanningContext, strategy Strategy) {
	sort.SliceStable(orders, func(i, j int) bool {
		a, b := orders[i], orders[j]

		// 1. deferred_yesterday = 1 first (never skip twice)
		if a.DeferredYesterday != b.DeferredYesterday {
			return a.DeferredYesterday
		}

		// 2. Larger days_since_last_served first
		if a.DaysSinceLastServed != b.DaysSinceLastServed {
			return a.DaysSinceLastServed > b.DaysSinceLastServed
		}

		// 3. Chilled/perishable before ambient
		if a.Order.TempRequirement != b.Order.TempRequirement {
			return a.Order.TempRequirement == "chilled"
		}

		// 4. Tighter window (earlier window_close) first
		if a.WindowCloseMinutes != b.WindowCloseMinutes {
			return a.WindowCloseMinutes < b.WindowCloseMinutes
		}

		// 5. Stable tie-break on order_ref
		return a.Order.Ref < b.Order.Ref
	})
}

func summarizePlan(plan *PlanData, ref RefData, totalCount, deferredCount int) PlanSummary {
	activeVehiclesMap := make(map[string]bool)
	var limiting []string

	reeferTrips := 0
	reeferCapacityUsedUl := int64(0)
	reeferCapacityTotalUl := int64(0)

	for _, v := range ref.Vehicles {
		if v.Depot == plan.Depot && v.Temp == "reefer" {
			reeferCapacityTotalUl += int64(v.VolumeCapM3 * 1000000000.0)
		}
	}

	for _, t := range plan.Trips {
		activeVehiclesMap[t.VehicleID] = true
		veh := ref.Vehicles[t.VehicleID]
		if veh.Temp == "reefer" {
			reeferTrips++
			for _, s := range t.Stops {
				reeferCapacityUsedUl += s.Order.TotalVolumeUl
			}
		}
	}

	servedCount := totalCount - deferredCount
	if reeferCapacityTotalUl > 0 && reeferCapacityUsedUl > 0 {
		pct := float64(reeferCapacityUsedUl) / float64(reeferCapacityTotalUl) * 100.0
		if pct > 85.0 && deferredCount > 0 {
			limiting = append(limiting, fmt.Sprintf("reefer volume %.1f%% used; %d orders deferred", pct, deferredCount))
		}
	}

	if len(limiting) == 0 && deferredCount > 0 {
		limiting = append(limiting, fmt.Sprintf("fleet capacity reached; %d orders deferred", deferredCount))
	}

	return PlanSummary{
		TotalOrders:       totalCount,
		ServedOrders:      servedCount,
		DeferredOrders:    deferredCount,
		TotalTrips:        len(plan.Trips),
		ActiveVehicles:    len(activeVehiclesMap),
		LimitingResources: limiting,
		DepotUtilization: map[string]interface{}{
			"active_vehicles": len(activeVehiclesMap),
			"total_trips":     len(plan.Trips),
		},
	}
}

func copyPlan(p *PlanData) *PlanData {
	cp := *p
	cp.Trips = make([]PlanTrip, len(p.Trips))
	copy(cp.Trips, p.Trips)
	return &cp
}

func copyTrip(t PlanTrip) PlanTrip {
	cp := t
	cp.Stops = make([]PlanStop, len(t.Stops))
	copy(cp.Stops, t.Stops)
	return cp
}

func computeNextOperatingDay(dateStr string) string {
	t, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return dateStr
	}
	next := t.AddDate(0, 0, 1)
	if next.Weekday() == time.Sunday {
		next = next.AddDate(0, 0, 1) // skip Sunday to Monday
	}
	return next.Format("2006-01-02")
}
