package planning

import (
	"fmt"
	"math"
	"time"
)

// CalculateTripMinutes implements the exact authoritative formula from Section 5.4:
//
//	trip_minutes = depot_to_district_freeflow_min          (once per trip)
//	             + inter_stop_freeflow_min * (n_orders - 1)
//	             + sum(service_allowance_min[brand, outlet.dock_type])   per stop
//
// Return journey is NOT added to trip duration (budgets already allow for it).
func CalculateTripMinutes(depotToDistrictMin, interStopMin int, serviceAllowances []int) int {
	nOrders := len(serviceAllowances)
	if nOrders == 0 {
		return 0
	}

	total := depotToDistrictMin
	if nOrders > 1 {
		total += interStopMin * (nOrders - 1)
	}

	for _, sa := range serviceAllowances {
		total += sa
	}

	return total
}

// CalculateFuelDistanceKm implements Section 5.6:
//
//	trip_distance_for_fuel = 2 * depot_to_district_km + inter_stop_km * (n - 1)
//
// Return journey is explicitly included in fuel calculations.
func CalculateFuelDistanceKm(depotToDistrictKm, interStopKm float64, nOrders int) float64 {
	if nOrders <= 0 {
		return 0.0
	}
	dist := 2.0 * depotToDistrictKm
	if nOrders > 1 {
		dist += interStopKm * float64(nOrders-1)
	}
	return dist
}

// CalculateFuelUsageMl computes fuel consumed in millilitres (exact integer representation).
// Litres = distance / km_per_l. 1 Litre = 1000 mL.
func CalculateFuelUsageMl(depotToDistrictKm, interStopKm float64, nOrders int, kmPerL float64) int64 {
	if kmPerL <= 0 || nOrders <= 0 {
		return 0
	}
	distKm := CalculateFuelDistanceKm(depotToDistrictKm, interStopKm, nOrders)
	liters := distKm / kmPerL
	return int64(math.Round(liters * 1000.0))
}

type StopTimingInput struct {
	Seq                int
	ServiceMin         int
	WindowOpenTimeStr  string // "04:00:00"
	WindowCloseTimeStr string // "08:00:00"
	MallWindowStr      string // "06:00-08:00" or empty
}

type StopETAResult struct {
	Seq           int
	ArrivalTime   time.Time
	ServiceStart  time.Time
	DepartureTime time.Time
	WindowOpen    time.Time
	WindowClose   time.Time
	LateMinutes   int
	IsLate        bool
}

// CalculateStopETAs evaluates arrival times and waiting intervals along the stop sequence (Section 5.7).
// Early arrival waits until window_open; waiting delays subsequent stops.
func CalculateStopETAs(baseDate time.Time, departTime time.Time, depotToDistrictMin, interStopMin int, stops []StopTimingInput) ([]StopETAResult, error) {
	results := make([]StopETAResult, len(stops))
	currentDepart := departTime

	for i, s := range stops {
		// Outbound leg for stop 0, inter-stop leg for stops > 0
		travelMin := interStopMin
		if i == 0 {
			travelMin = depotToDistrictMin
		}

		arrivalTime := currentDepart.Add(time.Duration(travelMin) * time.Minute)

		wOpen, err := parseTimeOfDay(baseDate, s.WindowOpenTimeStr)
		if err != nil {
			return nil, fmt.Errorf("invalid window open time: %w", err)
		}
		wClose, err := parseTimeOfDay(baseDate, s.WindowCloseTimeStr)
		if err != nil {
			return nil, fmt.Errorf("invalid window close time: %w", err)
		}

		// Service start: wait if arrived before window open
		serviceStart := arrivalTime
		if serviceStart.Before(wOpen) {
			serviceStart = wOpen
		}

		serviceEnd := serviceStart.Add(time.Duration(s.ServiceMin) * time.Minute)
		currentDepart = serviceEnd

		isLate := arrivalTime.After(wClose)
		lateMin := 0
		if isLate {
			lateMin = int(arrivalTime.Sub(wClose).Minutes())
		}

		results[i] = StopETAResult{
			Seq:           s.Seq,
			ArrivalTime:   arrivalTime,
			ServiceStart:  serviceStart,
			DepartureTime: serviceEnd,
			WindowOpen:    wOpen,
			WindowClose:   wClose,
			LateMinutes:   lateMin,
			IsLate:        isLate,
		}
	}

	return results, nil
}

func parseTimeOfDay(baseDate time.Time, timeStr string) (time.Time, error) {
	parts := timeStr
	if len(parts) == 5 { // "04:00"
		parts += ":00"
	}
	t, err := time.Parse("15:04:05", parts)
	if err != nil {
		return time.Time{}, err
	}
	return time.Date(baseDate.Year(), baseDate.Month(), baseDate.Day(), t.Hour(), t.Minute(), t.Second(), 0, baseDate.Location()), nil
}
