package planning

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Severity string

const (
	SeverityHard    Severity = "hard"
	SeveritySoft    Severity = "soft"
	SeverityWarning Severity = "warning"
)

type ViolationCode string

const (
	CodeCapVolume          ViolationCode = "CAP_VOLUME"
	CodeCapWeight          ViolationCode = "CAP_WEIGHT"
	CodeNeedReefer         ViolationCode = "NEED_REEFER"
	CodeVanOnly            ViolationCode = "VAN_ONLY"
	CodeDepotMismatch      ViolationCode = "DEPOT_MISMATCH"
	CodeMixedBrandDistrict ViolationCode = "MIXED_BRAND_DISTRICT"
	CodeMaxTrips           ViolationCode = "MAX_TRIPS"
	CodeBudgetFresh        ViolationCode = "BUDGET_FRESH"
	CodeBudgetStyleTech    ViolationCode = "BUDGET_STYLETECH"
	CodeFuelQuota          ViolationCode = "FUEL_QUOTA"
	CodeWindowLate         ViolationCode = "WINDOW_LATE"
	CodeMallWindow         ViolationCode = "MALL_WINDOW"
	CodeVehicleUnavailable ViolationCode = "VEHICLE_UNAVAILABLE"
	CodeOrderSplit         ViolationCode = "ORDER_SPLIT"
	CodeNoVehicleAtDepot   ViolationCode = "NO_VEHICLE_AT_DEPOT"
	CodeTimeBudget         ViolationCode = "TIME_BUDGET"
	CodeWindowInfeasible   ViolationCode = "WINDOW_INFEASIBLE"
	CodeLateOrder          ViolationCode = "LATE_ORDER"
	CodeManual             ViolationCode = "MANUAL"
)

type Violation struct {
	Severity  Severity               `json:"severity"`
	Code      ViolationCode          `json:"code"`
	Message   string                 `json:"message"`
	TripID    *uuid.UUID             `json:"trip_id,omitempty"`
	OrderID   *uuid.UUID             `json:"order_id,omitempty"`
	VehicleID *string                `json:"vehicle_id,omitempty"`
	Params    map[string]interface{} `json:"params,omitempty"`
}

type OutletRef struct {
	OutletID          string
	Brand             string
	District          string
	Depot             string
	DockType          string
	ParkingConstraint string
	MallWindow        string
	WindowOpenTime    string
	WindowCloseTime   string
}

type VehicleRef struct {
	VehicleID        string
	Type             string // truck | van
	Temp             string // reefer | ambient
	WeightCapKg      int
	VolumeCapM3      float64
	VolumeCapUl      int64
	FuelType         string
	KmPerL           float64
	WeeklyFuelQuotaL float64
	Depot            string
}

type DistrictTravelRef struct {
	District                   string
	Depot                      string
	DepotToDistrictKm          float64
	DepotToDistrictFreeflowMin int
	InterStopKm                float64
	InterStopFreeflowMin       int
}

type RefData struct {
	Outlets             map[string]OutletRef
	Vehicles            map[string]VehicleRef
	DistrictTravel      map[string]DistrictTravelRef // key: district + ":" + depot
	ServiceAllowance    map[string]int               // key: brand + ":" + dockType
	VehicleAvailability map[string]string            // key: vehicle_id + ":" + date
}

type PlanOrder struct {
	ID              uuid.UUID
	Ref             string
	OutletID        string
	Brand           string
	DeliveryDate    string
	TempRequirement string // ambient | chilled
	TotalUnits      int
	TotalWeightG    int64
	TotalVolumeUl   int64
}

type PlanStop struct {
	ID                  uuid.UUID
	TripID              uuid.UUID
	Order               PlanOrder
	Seq                 int
	WindowOverrideCode  *string
	WindowOverrideNote  *string
}

type PlanTrip struct {
	ID            uuid.UUID
	VehicleID     string
	TripNo        int // 1 or 2
	Brand         string
	District      string
	PlannedDepart time.Time
	Stops         []PlanStop
}

type PlanData struct {
	ID        uuid.UUID
	Depot     string
	PlanDate  string
	Trips     []PlanTrip
	Deferrals []PlanOrder
}

// Validate is the pure validator enforcing all 7 core feasibility rules plus
// fuel quota, delivery windows, mall windows, and vehicle availability (Section 8.1).
// No I/O inside.
func Validate(plan *PlanData, ref RefData, fuelRemainingMl map[string]int64) []Violation {
	var violations []Violation

	// Vehicle trip counts and daily durations
	vehicleTrips := make(map[string][]PlanTrip)
	vehicleFreshMinutes := make(map[string]int)
	vehicleStyleTechMinutes := make(map[string]int)
	vehicleFuelUsage := make(map[string]int64)

	// Order assignment uniqueness tracker across the entire plan
	assignedOrders := make(map[uuid.UUID]string) // orderID -> trip/deferral location

	// Track deferrals in uniqueness check
	for _, def := range plan.Deferrals {
		if prev, exists := assignedOrders[def.ID]; exists {
			violations = append(violations, Violation{
				Severity: SeverityHard,
				Code:     CodeOrderSplit,
				Message:  fmt.Sprintf("Order %s appears multiple times in plan (assigned to %s and deferred)", def.Ref, prev),
				OrderID:  &def.ID,
			})
		} else {
			assignedOrders[def.ID] = "deferred"
		}
	}

	for _, trip := range plan.Trips {
		tID := trip.ID
		vID := trip.VehicleID

		vehicleTrips[vID] = append(vehicleTrips[vID], trip)

		veh, vehExists := ref.Vehicles[vID]
		if !vehExists {
			violations = append(violations, Violation{
				Severity:  SeverityHard,
				Code:      CodeVehicleUnavailable,
				Message:   fmt.Sprintf("Vehicle %s does not exist in fleet", vID),
				TripID:    &tID,
				VehicleID: &vID,
			})
			continue
		}

		// Rule 4: Home depot check
		if veh.Depot != plan.Depot {
			violations = append(violations, Violation{
				Severity:  SeverityHard,
				Code:      CodeDepotMismatch,
				Message:   fmt.Sprintf("Vehicle %s belongs to depot %s but is scheduled at %s", vID, veh.Depot, plan.Depot),
				TripID:    &tID,
				VehicleID: &vID,
			})
		}

		// Rule 8: Vehicle availability (not in workshop)
		availKey := fmt.Sprintf("%s:%s", vID, plan.PlanDate)
		if status, ok := ref.VehicleAvailability[availKey]; ok && status == "in_workshop" {
			violations = append(violations, Violation{
				Severity:  SeverityHard,
				Code:      CodeVehicleUnavailable,
				Message:   fmt.Sprintf("Vehicle %s is in the workshop on date %s", vID, plan.PlanDate),
				TripID:    &tID,
				VehicleID: &vID,
			})
		}

		// Rule 7: Trip No in (1, 2)
		if trip.TripNo != 1 && trip.TripNo != 2 {
			violations = append(violations, Violation{
				Severity:  SeverityHard,
				Code:      CodeMaxTrips,
				Message:   fmt.Sprintf("Trip %d on vehicle %s is invalid (only trips 1 and 2 allowed)", trip.TripNo, vID),
				TripID:    &tID,
				VehicleID: &vID,
			})
		}

		var tripWeightG int64
		var tripVolumeUl int64
		var serviceAllowances []int
		var stopTimingInputs []StopTimingInput

		for _, stop := range trip.Stops {
			ord := stop.Order
			oID := ord.ID

			// Rule 5: Whole orders - unique assignment across plan
			if prev, exists := assignedOrders[oID]; exists {
				violations = append(violations, Violation{
					Severity: SeverityHard,
					Code:     CodeOrderSplit,
					Message:  fmt.Sprintf("Order %s assigned multiple times (in trip %s and %s)", ord.Ref, tID, prev),
					TripID:   &tID,
					OrderID:  &oID,
				})
			} else {
				assignedOrders[oID] = fmt.Sprintf("trip:%s", tID)
			}

			outlet, outletExists := ref.Outlets[ord.OutletID]
			if !outletExists {
				violations = append(violations, Violation{
					Severity: SeverityHard,
					Code:     CodeDepotMismatch,
					Message:  fmt.Sprintf("Outlet %s does not exist", ord.OutletID),
					TripID:   &tID,
					OrderID:  &oID,
				})
				continue
			}

			// Rule 4: Outlet depot check
			if outlet.Depot != plan.Depot {
				violations = append(violations, Violation{
					Severity: SeverityHard,
					Code:     CodeDepotMismatch,
					Message:  fmt.Sprintf("Outlet %s depot %s does not match trip depot %s", ord.OutletID, outlet.Depot, plan.Depot),
					TripID:   &tID,
					OrderID:  &oID,
				})
			}

			// Rule 1: Brand & District consistency
			if ord.Brand != trip.Brand {
				violations = append(violations, Violation{
					Severity: SeverityHard,
					Code:     CodeMixedBrandDistrict,
					Message:  fmt.Sprintf("Order brand %s does not match trip brand %s", ord.Brand, trip.Brand),
					TripID:   &tID,
					OrderID:  &oID,
				})
			}
			if outlet.District != trip.District {
				violations = append(violations, Violation{
					Severity: SeverityHard,
					Code:     CodeMixedBrandDistrict,
					Message:  fmt.Sprintf("Outlet district %s does not match trip district %s", outlet.District, trip.District),
					TripID:   &tID,
					OrderID:  &oID,
				})
			}

			// Rule 2: Refrigeration check
			if ord.TempRequirement == "chilled" && veh.Temp != "reefer" {
				violations = append(violations, Violation{
					Severity:  SeverityHard,
					Code:      CodeNeedReefer,
					Message:   fmt.Sprintf("Chilled order %s cannot be transported on ambient vehicle %s", ord.Ref, vID),
					TripID:    &tID,
					OrderID:   &oID,
					VehicleID: &vID,
				})
			}

			// Rule 3: Access constraint
			if outlet.ParkingConstraint == "van_only" && veh.Type != "van" {
				violations = append(violations, Violation{
					Severity:  SeverityHard,
					Code:      CodeVanOnly,
					Message:   fmt.Sprintf("Outlet %s has van_only parking constraint but vehicle %s is a truck", ord.OutletID, vID),
					TripID:    &tID,
					OrderID:   &oID,
					VehicleID: &vID,
				})
			}

			tripWeightG += ord.TotalWeightG
			tripVolumeUl += ord.TotalVolumeUl

			saKey := fmt.Sprintf("%s:%s", ord.Brand, outlet.DockType)
			sa := ref.ServiceAllowance[saKey]
			if sa == 0 {
				sa = 15 // safe default fallback
			}
			serviceAllowances = append(serviceAllowances, sa)

			stopTimingInputs = append(stopTimingInputs, StopTimingInput{
				Seq:                stop.Seq,
				ServiceMin:         sa,
				WindowOpenTimeStr:  outlet.WindowOpenTime,
				WindowCloseTimeStr: outlet.WindowCloseTime,
				MallWindowStr:      outlet.MallWindow,
			})
		}

		// Rule 6: Capacity checks (Weight & Volume)
		maxWeightG := int64(veh.WeightCapKg) * 1000
		if tripWeightG > maxWeightG {
			violations = append(violations, Violation{
				Severity:  SeverityHard,
				Code:      CodeCapWeight,
				Message:   fmt.Sprintf("Trip loaded weight %d g exceeds vehicle %s capacity %d g", tripWeightG, vID, maxWeightG),
				TripID:    &tID,
				VehicleID: &vID,
				Params: map[string]interface{}{
					"loaded_g":  tripWeightG,
					"cap_g":     maxWeightG,
					"excess_kg": float64(tripWeightG-maxWeightG) / 1000.0,
				},
			})
		}

		maxVolumeUl := int64(veh.VolumeCapM3 * 1000000000.0)
		if tripVolumeUl > maxVolumeUl {
			violations = append(violations, Violation{
				Severity:  SeverityHard,
				Code:      CodeCapVolume,
				Message:   fmt.Sprintf("Trip loaded volume %d ul exceeds vehicle %s capacity %d ul", tripVolumeUl, vID, maxVolumeUl),
				TripID:    &tID,
				VehicleID: &vID,
				Params: map[string]interface{}{
					"loaded_ul": tripVolumeUl,
					"cap_ul":    maxVolumeUl,
					"excess_m3": float64(tripVolumeUl-maxVolumeUl) / 1000000000.0,
				},
			})
		}

		// Travel timing and duration calculation
		dtKey := fmt.Sprintf("%s:%s", trip.District, plan.Depot)
		dt, dtExists := ref.DistrictTravel[dtKey]
		if !dtExists {
			violations = append(violations, Violation{
				Severity: SeverityHard,
				Code:     CodeDepotMismatch,
				Message:  fmt.Sprintf("No travel data found for district %s from depot %s", trip.District, plan.Depot),
				TripID:   &tID,
			})
			continue
		}

		tripMinutes := CalculateTripMinutes(dt.DepotToDistrictFreeflowMin, dt.InterStopFreeflowMin, serviceAllowances)
		if trip.Brand == "Fresh" {
			vehicleFreshMinutes[vID] += tripMinutes
		} else {
			vehicleStyleTechMinutes[vID] += tripMinutes
		}

		// Fuel calculation
		fuelUsage := CalculateFuelUsageMl(dt.DepotToDistrictKm, dt.InterStopKm, len(trip.Stops), veh.KmPerL)
		vehicleFuelUsage[vID] += fuelUsage

		// Stop window checks (Section 5.7)
		if len(stopTimingInputs) > 0 {
			baseDate, _ := time.Parse("2006-01-02", plan.PlanDate)
			etaResults, err := CalculateStopETAs(baseDate, trip.PlannedDepart, dt.DepotToDistrictFreeflowMin, dt.InterStopFreeflowMin, stopTimingInputs)
			if err == nil {
				for i, eta := range etaResults {
					stop := trip.Stops[i]
					if eta.IsLate {
						severity := SeverityHard
						if stop.WindowOverrideCode != nil && *stop.WindowOverrideCode != "" {
							severity = SeverityWarning // Dispatcher override converts hard violation to audited warning
						}
						violations = append(violations, Violation{
							Severity: severity,
							Code:     CodeWindowLate,
							Message:  fmt.Sprintf("Stop %d for order %s arrives at %s, missing window close %s by %d min", eta.Seq, stop.Order.Ref, eta.ArrivalTime.Format("15:04"), eta.WindowClose.Format("15:04"), eta.LateMinutes),
							TripID:   &tID,
							OrderID:  &stop.Order.ID,
							Params: map[string]interface{}{
								"arrival_time":  eta.ArrivalTime.Format("15:04:05"),
								"window_close":  eta.WindowClose.Format("15:04:05"),
								"late_minutes":  eta.LateMinutes,
								"override_code": stop.WindowOverrideCode,
							},
						})
					}

					// Mall window check
					outlet := ref.Outlets[stop.Order.OutletID]
					if outlet.MallWindow != "" {
						mallOpen, mallClose, err := parseMallWindow(baseDate, outlet.MallWindow)
						if err == nil {
							if eta.ArrivalTime.Before(mallOpen) || eta.ArrivalTime.After(mallClose) {
								violations = append(violations, Violation{
									Severity: SeverityHard,
									Code:     CodeMallWindow,
									Message:  fmt.Sprintf("Stop %d arrives outside mall access window %s", eta.Seq, outlet.MallWindow),
									TripID:   &tID,
									OrderID:  &stop.Order.ID,
								})
							}
						}
					}
				}
			}
		}
	}

	// Rule 7: Trip counts & time budgets across vehicles
	for vID, trips := range vehicleTrips {
		if len(trips) > 2 {
			violations = append(violations, Violation{
				Severity:  SeverityHard,
				Code:      CodeMaxTrips,
				Message:   fmt.Sprintf("Vehicle %s has %d trips scheduled (maximum 2 permitted per day)", vID, len(trips)),
				VehicleID: &vID,
			})
		}

		freshMin := vehicleFreshMinutes[vID]
		if freshMin > 270 {
			violations = append(violations, Violation{
				Severity:  SeverityHard,
				Code:      CodeBudgetFresh,
				Message:   fmt.Sprintf("Vehicle %s scheduled for %d min of Fresh trips, exceeding the 270 min daily budget", vID, freshMin),
				VehicleID: &vID,
				Params: map[string]interface{}{
					"used_min":   freshMin,
					"budget_min": 270,
					"excess_min": freshMin - 270,
				},
			})
		}

		styleTechMin := vehicleStyleTechMinutes[vID]
		if styleTechMin > 480 {
			violations = append(violations, Violation{
				Severity:  SeverityHard,
				Code:      CodeBudgetStyleTech,
				Message:   fmt.Sprintf("Vehicle %s scheduled for %d min of Style/Tech trips, exceeding the 480 min daily budget", vID, styleTechMin),
				VehicleID: &vID,
				Params: map[string]interface{}{
					"used_min":   styleTechMin,
					"budget_min": 480,
					"excess_min": styleTechMin - 480,
				},
			})
		}

		// Rule 9: Weekly fuel quota
		if remaining, ok := fuelRemainingMl[vID]; ok {
			usedFuel := vehicleFuelUsage[vID]
			if usedFuel > remaining {
				violations = append(violations, Violation{
					Severity:  SeverityHard,
					Code:      CodeFuelQuota,
					Message:   fmt.Sprintf("Vehicle %s requires %d mL fuel, exceeding remaining quota of %d mL", vID, usedFuel, remaining),
					VehicleID: &vID,
					Params: map[string]interface{}{
						"needed_ml":    usedFuel,
						"remaining_ml": remaining,
					},
				})
			}
		}
	}

	return violations
}

func parseMallWindow(baseDate time.Time, mallWin string) (time.Time, time.Time, error) {
	parts := strings.Split(mallWin, "-")
	if len(parts) != 2 {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid mall window format: %s", mallWin)
	}
	open, err := parseTimeOfDay(baseDate, strings.TrimSpace(parts[0]))
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	closeTime, err := parseTimeOfDay(baseDate, strings.TrimSpace(parts[1]))
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	return open, closeTime, nil
}
