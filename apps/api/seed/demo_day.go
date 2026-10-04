package seed

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/ordering"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/clock"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DemoDeliveryDate is the operating day (Monday, per the official calendar) the judge walkthrough plans.
const DemoDeliveryDate = "2026-06-22"

const demoDispatcherID = "00000000-0000-0000-0000-000000000001"

// Peak-day uplift applied to every quantity so demand exceeds the available fleet.
const demoDemandPercent = 135

// Vehicles in the workshop on the demo day (Task 2B style: only status 'available' may be allocated).
var demoWorkshop = []string{
	"VEH002", "VEH003", "VEH005", "VEH006", "VEH007", "VEH036", // Peliyagoda refrigerated: VEH001, VEH004 (trucks) and VEH035 (van) stay available
	"VEH008", "VEH009", "VEH037", // Peliyagoda ambient
}

// demoStride thins the book to a size a judge can follow; demoKeep outlets always order.
const demoStride = 4

var demoKeep = map[string]bool{"OUT001": true, "OUT055": true, "OUT004": true, "OUT009": true, "OUT011": true, "OUT023": true, "OUT046": true}

// Outlets skipped on the previous run, so the planner's fairness rule has something to act on.
var demoSkipped = map[string]int{"OUT004": 2, "OUT009": 1, "OUT011": 1, "OUT023": 1, "OUT046": 1}

// SeedDemoDay places a realistic order book for DemoDeliveryDate through the real ordering service.
// It is idempotent: if orders already exist for that date nothing is added.
func SeedDemoDay(ctx context.Context, pool *pgxpool.Pool) error {
	var existing int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM orders WHERE delivery_date=$1::date`, DemoDeliveryDate).Scan(&existing); err != nil {
		return err
	}
	if existing > 0 {
		return nil
	}
	var dispatcherExists bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id=$1)`, demoDispatcherID).Scan(&dispatcherExists); err != nil {
		return err
	}
	if !dispatcherExists {
		slog.Warn("Demo day not seeded: role accounts are missing (set BOOTSTRAP_PASSWORD)")
		return nil
	}

	for _, v := range demoWorkshop {
		if _, err := pool.Exec(ctx, `INSERT INTO vehicle_availability(vehicle_id,date,status) VALUES($1,$2::date,'in_workshop') ON CONFLICT DO NOTHING`, v, DemoDeliveryDate); err != nil {
			return fmt.Errorf("workshop %s: %w", v, err)
		}
	}
	for outlet, streak := range demoSkipped {
		if _, err := pool.Exec(ctx, `INSERT INTO outlet_service_state(outlet_id,last_served_date,skip_streak) VALUES($1,'2026-06-19',$2) ON CONFLICT (outlet_id) DO UPDATE SET last_served_date=EXCLUDED.last_served_date, skip_streak=EXCLUDED.skip_streak`, outlet, streak); err != nil {
			return fmt.Errorf("service state %s: %w", outlet, err)
		}
	}

	// Orders are taken before the 16:00 cutoff on the preceding day, so none are late.
	placedAt := time.Date(2026, 6, 21, 14, 0, 0, 0, time.FixedZone("Asia/Colombo", 5*3600+1800))
	svc := ordering.NewService(pool, clock.NewDemoClock(&placedAt))
	by := uuid.MustParse(demoDispatcherID)

	rows, err := pool.Query(ctx, `SELECT outlet_id, brand, parking_constraint FROM outlets WHERE depot='Peliyagoda' ORDER BY outlet_id`)
	if err != nil {
		return err
	}
	type outletRow struct{ id, brand, parking string }
	var outlets []outletRow
	for rows.Next() {
		var o outletRow
		if err := rows.Scan(&o.id, &o.brand, &o.parking); err != nil {
			rows.Close()
			return err
		}
		outlets = append(outlets, o)
	}
	rows.Close()

	placed := 0
	for _, o := range outlets {
		n, _ := strconv.Atoi(o.id[3:])
		// A walkthrough-sized day for the Peliyagoda depot (the dispatcher and loader accounts belong to it): every fourth outlet, plus the demo accounts' outlets and the previously skipped ones.
		if n%demoStride != 0 && !demoKeep[o.id] {
			continue
		}
		var items []ordering.OrderItemInput
		switch o.brand {
		case "Fresh":
			// Every Fresh outlet orders dry goods daily and chilled goods on most days.
			items = append(items,
				ordering.OrderItemInput{SKU: "SKU-FRESH-VEG-CRATE", Qty: scale(8 + n%7)},
				ordering.OrderItemInput{SKU: "SKU-FRESH-RICE-5KG", Qty: scale(30 + (n*3)%25)},
				ordering.OrderItemInput{SKU: "SKU-FRESH-EGGS-30", Qty: scale(12 + n%9)})
			if n%7 != 0 {
				items = append(items,
					ordering.OrderItemInput{SKU: "SKU-FRESH-MILK-1L", Qty: scale(260 + (n*11)%140)},
					ordering.OrderItemInput{SKU: "SKU-FRESH-YOGURT-80G", Qty: scale(300 + (n*13)%200)},
					ordering.OrderItemInput{SKU: "SKU-FRESH-CHICKEN-KG", Qty: scale(120 + (n*5)%80)})
			}
		case "Style":
			if n%2 == 0 { // Style orders weekly; about half are scheduled for Monday
				items = []ordering.OrderItemInput{
					{SKU: "SKU-STYLE-SHIRT-M", Qty: scale(60 + n%30)},
					{SKU: "SKU-STYLE-SAREE-SILK", Qty: scale(40 + n%20)},
					{SKU: "SKU-STYLE-SHOES-PAIR", Qty: scale(20 + n%15)},
				}
			}
		case "Tech":
			if n%3 == 0 { // As-needed, often a single large item
				items = []ordering.OrderItemInput{{SKU: "SKU-TECH-REFRIGERATOR", Qty: 1 + n%3}}
				if n%2 == 0 {
					items = append(items, ordering.OrderItemInput{SKU: "SKU-TECH-SMART-TV", Qty: 2 + n%4})
				}
			}
		}
		if len(items) == 0 {
			continue
		}
		if o.parking == "van_only" { // small-format stores order what a van can carry
			for i := range items {
				if items[i].Qty = items[i].Qty * 30 / 100; items[i].Qty < 1 {
					items[i].Qty = 1
				}
			}
		}
		id := uuid.NewMD5(uuid.NameSpaceURL, []byte("waypoint-demo-"+DemoDeliveryDate+"-"+o.id))
		out, err := svc.CreateOrder(ctx, ordering.CreateOrderInput{ID: id, OutletID: o.id, DeliveryDate: DemoDeliveryDate, Items: items, Source: "phone", CreatedBy: by})
		if err != nil {
			return fmt.Errorf("demo order %s: %w", o.id, err)
		}
		placed += len(out)
	}
	slog.Info("Demo delivery day seeded", "date", DemoDeliveryDate, "orders", placed, "workshop_vehicles", len(demoWorkshop))
	return nil
}

func scale(q int) int {
	v := q * demoDemandPercent / 100
	if v < 1 {
		return 1
	}
	return v
}
