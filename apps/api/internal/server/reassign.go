package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/planning"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/auth"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/tz"
)

// reassign moves one whole order onto another draft trip. The resulting plan is validated against every
// operating rule before anything is written; then load, time, fuel and ETAs are recomputed.
func (s *Server) reassign(ctx context.Context, tx pgx.Tx, u *auth.AuthUser, c WorkflowCommand) (map[string]interface{}, error) {
	if u.Role != auth.RoleDispatcher {
		return nil, errors.New("Dispatcher access required")
	}
	var planID uuid.UUID
	var depot, planDate, status string
	if err := tx.QueryRow(ctx, `SELECT t.plan_id,p.depot,p.plan_date::text,p.status FROM trips t JOIN plans p ON p.id=t.plan_id WHERE t.id=$1 FOR UPDATE OF p`, c.TripID).Scan(&planID, &depot, &planDate, &status); err != nil {
		return nil, errors.New("Target trip not found")
	}
	if status != "draft" {
		return nil, fmt.Errorf("Only a draft plan can be edited; this plan is %s", status)
	}
	if value(u.Depot) != "" && value(u.Depot) != depot {
		return nil, errors.New("Different depot")
	}
	orderID, err := uuid.Parse(c.OrderID)
	if err != nil {
		return nil, errors.New("Order required")
	}
	target, err := uuid.Parse(c.TripID)
	if err != nil {
		return nil, errors.New("Trip required")
	}

	plan, err := s.loadPlanDataFromDB(ctx, planID)
	if err != nil {
		return nil, err
	}
	var moved *planning.PlanOrder
	var fromTrip uuid.UUID
	for ti := range plan.Trips {
		kept := make([]planning.PlanStop, 0, len(plan.Trips[ti].Stops))
		for _, st := range plan.Trips[ti].Stops {
			if st.Order.ID == orderID {
				o := st.Order
				moved = &o
				fromTrip = plan.Trips[ti].ID
				continue
			}
			kept = append(kept, st)
		}
		plan.Trips[ti].Stops = kept
	}
	keptDef := make([]planning.PlanOrder, 0, len(plan.Deferrals))
	for _, d := range plan.Deferrals {
		if d.ID == orderID {
			o := d
			moved = &o
			continue
		}
		keptDef = append(keptDef, d)
	}
	plan.Deferrals = keptDef
	if moved == nil {
		return nil, errors.New("Order is not part of this plan")
	}
	placed := false
	for ti := range plan.Trips {
		if plan.Trips[ti].ID == target {
			plan.Trips[ti].Stops = append(plan.Trips[ti].Stops, planning.PlanStop{ID: uuid.New(), TripID: target, Order: *moved, Seq: len(plan.Trips[ti].Stops) + 1})
			placed = true
		}
	}
	if !placed {
		return nil, errors.New("Target trip not found")
	}
	ref, err := s.planningRef(ctx, planDate)
	if err != nil {
		return nil, err
	}
	fuel, _ := s.fetchFuelRemaining(ctx, depot, planDate)
	for _, v := range planning.Validate(plan, ref, fuel) {
		if v.Severity == planning.SeverityHard {
			return nil, errors.New(v.Message)
		}
	}

	out := ref.Outlets[moved.OutletID]
	wOpen, wClose := out.WindowOpenTime, out.WindowCloseTime
	if len(wOpen) == 5 {
		wOpen += ":00"
	}
	if len(wClose) == 5 {
		wClose += ":00"
	}
	if _, err = tx.Exec(ctx, `DELETE FROM trip_stops WHERE plan_id=$1 AND order_id=$2`, planID, orderID); err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM deferrals WHERE plan_id=$1 AND order_id=$2`, planID, orderID); err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO trip_stops(id,plan_id,trip_id,order_id,seq,window_open,window_close,status)
		VALUES($1,$2,$3,$4,(SELECT COALESCE(MAX(seq),0)+1 FROM trip_stops WHERE trip_id=$3),$5::time,$6::time,'pending')`,
		uuid.New(), planID, target, orderID, wOpen, wClose); err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, `UPDATE orders SET status='queued',version=version+1 WHERE id=$1`, orderID); err != nil {
		return nil, err
	}
	for _, t := range []uuid.UUID{target, fromTrip} {
		if t == uuid.Nil {
			continue
		}
		if err = s.recomputeTrip(ctx, tx, ref, t); err != nil {
			return nil, err
		}
	}
	if _, err = tx.Exec(ctx, `UPDATE plans SET version=version+1 WHERE id=$1`, planID); err != nil {
		return nil, err
	}
	return map[string]interface{}{"status": "reassigned"}, nil
}

// recomputeTrip refreshes stop order, load, time, fuel and ETAs after a trip's stops changed.
func (s *Server) recomputeTrip(ctx context.Context, tx pgx.Tx, ref planning.RefData, tripID uuid.UUID) error {
	var depot, district, brand, vehicleID, planDate string
	var depart time.Time
	if err := tx.QueryRow(ctx, `SELECT p.depot,t.district,t.brand,t.vehicle_id,p.plan_date::text,t.planned_depart FROM trips t JOIN plans p ON p.id=t.plan_id WHERE t.id=$1`, tripID).Scan(&depot, &district, &brand, &vehicleID, &planDate, &depart); err != nil {
		return err
	}
	rows, err := tx.Query(ctx, `SELECT st.id,o.outlet_id,o.total_weight_g,o.total_volume_ul FROM trip_stops st JOIN orders o ON o.id=st.order_id WHERE st.trip_id=$1 ORDER BY st.seq,st.id`, tripID)
	if err != nil {
		return err
	}
	type stopRow struct {
		id     uuid.UUID
		outlet string
		w, v   int64
	}
	var stops []stopRow
	for rows.Next() {
		var r stopRow
		if err = rows.Scan(&r.id, &r.outlet, &r.w, &r.v); err != nil {
			rows.Close()
			return err
		}
		stops = append(stops, r)
	}
	rows.Close()

	dt := ref.DistrictTravel[district+":"+depot]
	veh := ref.Vehicles[vehicleID]
	var allowances []int
	var timing []planning.StopTimingInput
	var weight, volume int64
	sum := 0
	for i, st := range stops {
		out := ref.Outlets[st.outlet]
		sa := ref.ServiceAllowance[brand+":"+out.DockType]
		if sa == 0 {
			sa = 15
		}
		allowances = append(allowances, sa)
		sum += sa
		weight += st.w
		volume += st.v
		timing = append(timing, planning.StopTimingInput{Seq: i + 1, ServiceMin: sa, WindowOpenTimeStr: out.WindowOpenTime, WindowCloseTimeStr: out.WindowCloseTime, MallWindowStr: out.MallWindow})
	}
	// Renumber without tripping the (trip_id, seq) unique constraint.
	if _, err = tx.Exec(ctx, `UPDATE trip_stops SET seq=seq+1000 WHERE trip_id=$1`, tripID); err != nil {
		return err
	}
	base, _ := time.ParseInLocation("2006-01-02", planDate, tz.Colombo)
	etas, _ := planning.CalculateStopETAs(base, depart, dt.DepotToDistrictFreeflowMin, dt.InterStopFreeflowMin, timing)
	for i, st := range stops {
		var eta *time.Time
		risk := float32(0)
		if i < len(etas) {
			eta = &etas[i].ArrivalTime
			if etas[i].IsLate {
				risk = 1
			}
		}
		if _, err = tx.Exec(ctx, `UPDATE trip_stops SET seq=$2,eta=$3,eta_source='rule',late_risk=$4 WHERE id=$1`, st.id, i+1, eta, risk); err != nil {
			return err
		}
	}
	budget := 270
	if brand != "Fresh" {
		budget = 480
	}
	minutes, _ := json.Marshal(map[string]int{
		"depot_to_district_min":       dt.DepotToDistrictFreeflowMin,
		"inter_stop_min":              dt.InterStopFreeflowMin,
		"service_allowance_total_min": sum,
		"total_trip_min":              planning.CalculateTripMinutes(dt.DepotToDistrictFreeflowMin, dt.InterStopFreeflowMin, allowances),
		"budget_limit_min":            budget,
	})
	_, err = tx.Exec(ctx, `UPDATE trips SET minutes=$2,est_km=$3,est_fuel_ml=$4,loaded_weight_g=$5,loaded_volume_ul=$6 WHERE id=$1`,
		tripID, minutes,
		planning.CalculateFuelDistanceKm(dt.DepotToDistrictKm, dt.InterStopKm, len(stops)),
		planning.CalculateFuelUsageMl(dt.DepotToDistrictKm, dt.InterStopKm, len(stops), veh.KmPerL),
		weight, volume)
	return err
}
