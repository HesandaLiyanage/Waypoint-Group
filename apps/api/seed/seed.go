package seed

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/auth"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SeedDatabase loads reference CSVs, seeds catalog items, user accounts, and creates the demo day state.
// It is protected by an advisory lock so concurrent application boots never collide.
func SeedDatabase(ctx context.Context, pool *pgxpool.Pool, dataDir string) error {
	// Acquire PostgreSQL advisory lock (key hash 'waypoint_seed_lock')
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("failed to acquire connection for seed lock: %w", err)
	}
	defer conn.Release()

	var locked bool
	err = conn.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtext('waypoint_seed_lock'))`).Scan(&locked)
	if err != nil || !locked {
		slog.Info("Another process holds the seed lock; skipping concurrent seeding")
		return nil
	}
	defer func() {
		_, _ = conn.Exec(ctx, `SELECT pg_advisory_unlock(hashtext('waypoint_seed_lock'))`)
	}()

	slog.Info("Starting database seed process...", "dataDir", dataDir)

	// Locate data directory
	resolvedDir := findDataDir(dataDir)
	if resolvedDir == "" {
		slog.Warn("Seed data directory not found; skipping CSV loading", "searched", dataDir)
	} else {
		if err := loadOutlets(ctx, pool, filepath.Join(resolvedDir, "outlets.csv")); err != nil {
			return fmt.Errorf("failed to load outlets.csv: %w", err)
		}
		if err := loadVehicles(ctx, pool, filepath.Join(resolvedDir, "vehicles.csv")); err != nil {
			return fmt.Errorf("failed to load vehicles.csv: %w", err)
		}
		if err := loadCalendar(ctx, pool, filepath.Join(resolvedDir, "calendar.csv")); err != nil {
			return fmt.Errorf("failed to load calendar.csv: %w", err)
		}
		if err := loadDistrictTravel(ctx, pool, filepath.Join(resolvedDir, "district_travel.csv")); err != nil {
			return fmt.Errorf("failed to load district_travel.csv: %w", err)
		}
		if err := loadServiceAllowance(ctx, pool, filepath.Join(resolvedDir, "service_allowance.csv")); err != nil {
			return fmt.Errorf("failed to load service_allowance.csv: %w", err)
		}
	}

	if err := seedCatalog(ctx, pool); err != nil {
		return fmt.Errorf("failed to seed catalog: %w", err)
	}

	if err := seedVehicleAvailability(ctx, pool); err != nil {
		return fmt.Errorf("failed to seed vehicle availability: %w", err)
	}

	if err := seedAccounts(ctx, pool); err != nil {
		return fmt.Errorf("failed to seed accounts: %w", err)
	}

	if err := seedDemoDayOrders(ctx, pool); err != nil {
		return fmt.Errorf("failed to seed demo day orders: %w", err)
	}

	slog.Info("Database seeding successfully completed!")
	return nil
}

func findDataDir(preferred string) string {
	candidates := []string{
		preferred,
		"db/seed/data",
		"../../db/seed/data",
		"../../../db/seed/data",
		"/app/db/seed/data",
	}
	for _, c := range candidates {
		if c == "" {
			continue
		}
		if fi, err := os.Stat(c); err == nil && fi.IsDir() {
			return c
		}
	}
	return ""
}

func parseCSVHeader(header []string) map[string]int {
	m := make(map[string]int)
	for i, col := range header {
		clean := strings.TrimSpace(strings.ToLower(col))
		m[clean] = i
	}
	return m
}

func loadOutlets(ctx context.Context, pool *pgxpool.Pool, path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()

	reader := csv.NewReader(f)
	header, err := reader.Read()
	if err != nil {
		return err
	}
	col := parseCSVHeader(header)

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		outletID := strings.TrimSpace(record[col["outlet_id"]])
		brand := strings.TrimSpace(record[col["brand"]])
		district := strings.TrimSpace(record[col["district"]])
		depot := strings.TrimSpace(record[col["depot"]])
		dockType := strings.TrimSpace(record[col["dock_type"]])
		parking := strings.TrimSpace(record[col["parking_constraint"]])
		mallWin := ""
		if idx, ok := col["mall_window"]; ok && idx < len(record) {
			mallWin = strings.TrimSpace(record[idx])
		}
		wOpen := strings.TrimSpace(record[col["window_open_time"]])
		wClose := strings.TrimSpace(record[col["window_close_time"]])

		_, err = pool.Exec(ctx, `
			INSERT INTO outlets (outlet_id, brand, district, depot, dock_type, parking_constraint, mall_window, window_open_time, window_close_time)
			VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), $8::time, $9::time)
			ON CONFLICT (outlet_id) DO UPDATE SET
				brand = EXCLUDED.brand,
				district = EXCLUDED.district,
				depot = EXCLUDED.depot,
				dock_type = EXCLUDED.dock_type,
				parking_constraint = EXCLUDED.parking_constraint,
				mall_window = EXCLUDED.mall_window,
				window_open_time = EXCLUDED.window_open_time,
				window_close_time = EXCLUDED.window_close_time
		`, outletID, brand, district, depot, dockType, parking, mallWin, wOpen, wClose)
		if err != nil {
			return fmt.Errorf("error inserting outlet %s: %w", outletID, err)
		}
	}
	return nil
}

func loadVehicles(ctx context.Context, pool *pgxpool.Pool, path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()

	reader := csv.NewReader(f)
	header, err := reader.Read()
	if err != nil {
		return err
	}
	col := parseCSVHeader(header)

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		vehicleID := strings.TrimSpace(record[col["vehicle_id"]])
		vType := strings.TrimSpace(record[col["type"]])
		temp := strings.TrimSpace(record[col["temp"]])
		weightCap, _ := strconv.Atoi(strings.TrimSpace(record[col["weight_cap_kg"]]))
		volumeCap, _ := strconv.ParseFloat(strings.TrimSpace(record[col["volume_cap_m3"]]), 64)
		fuelType := strings.TrimSpace(record[col["fuel_type"]])
		kmPerL, _ := strconv.ParseFloat(strings.TrimSpace(record[col["km_per_l"]]), 64)
		quota, _ := strconv.ParseFloat(strings.TrimSpace(record[col["weekly_fuel_quota_l"]]), 64)
		depot := strings.TrimSpace(record[col["depot"]])

		_, err = pool.Exec(ctx, `
			INSERT INTO vehicles (vehicle_id, type, temp, weight_cap_kg, volume_cap_m3, fuel_type, km_per_l, weekly_fuel_quota_l, depot)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT (vehicle_id) DO UPDATE SET
				type = EXCLUDED.type,
				temp = EXCLUDED.temp,
				weight_cap_kg = EXCLUDED.weight_cap_kg,
				volume_cap_m3 = EXCLUDED.volume_cap_m3,
				fuel_type = EXCLUDED.fuel_type,
				km_per_l = EXCLUDED.km_per_l,
				weekly_fuel_quota_l = EXCLUDED.weekly_fuel_quota_l,
				depot = EXCLUDED.depot
		`, vehicleID, vType, temp, weightCap, volumeCap, fuelType, kmPerL, quota, depot)
		if err != nil {
			return fmt.Errorf("error inserting vehicle %s: %w", vehicleID, err)
		}
	}
	return nil
}

func loadCalendar(ctx context.Context, pool *pgxpool.Pool, path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()

	reader := csv.NewReader(f)
	header, err := reader.Read()
	if err != nil {
		return err
	}
	col := parseCSVHeader(header)

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		dateStr := strings.TrimSpace(record[col["date"]])
		dow, _ := strconv.Atoi(strings.TrimSpace(record[col["dow"]]))
		dowName := strings.TrimSpace(record[col["dow_name"]])
		isWeekend, _ := strconv.Atoi(strings.TrimSpace(record[col["is_weekend"]]))
		isoYear, _ := strconv.Atoi(strings.TrimSpace(record[col["iso_year"]]))
		isoWeek, _ := strconv.Atoi(strings.TrimSpace(record[col["iso_week"]]))
		isPayday, _ := strconv.Atoi(strings.TrimSpace(record[col["is_payday"]]))
		festival := strings.TrimSpace(record[col["festival"]])
		festRamp, _ := strconv.ParseFloat(strings.TrimSpace(record[col["festival_ramp"]]), 64)
		isHoliday, _ := strconv.Atoi(strings.TrimSpace(record[col["is_holiday"]]))
		monsoon, _ := strconv.Atoi(strings.TrimSpace(record[col["monsoon"]]))
		isOperating, _ := strconv.Atoi(strings.TrimSpace(record[col["is_operating"]]))

		_, err = pool.Exec(ctx, `
			INSERT INTO calendar_days (date, dow, dow_name, is_weekend, iso_year, iso_week, is_payday, festival, festival_ramp, is_holiday, monsoon, is_operating)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			ON CONFLICT (date) DO UPDATE SET
				dow = EXCLUDED.dow,
				dow_name = EXCLUDED.dow_name,
				is_weekend = EXCLUDED.is_weekend,
				iso_year = EXCLUDED.iso_year,
				iso_week = EXCLUDED.iso_week,
				is_payday = EXCLUDED.is_payday,
				festival = EXCLUDED.festival,
				festival_ramp = EXCLUDED.festival_ramp,
				is_holiday = EXCLUDED.is_holiday,
				monsoon = EXCLUDED.monsoon,
				is_operating = EXCLUDED.is_operating
		`, dateStr, dow, dowName, isWeekend, isoYear, isoWeek, isPayday, festival, festRamp, isHoliday, monsoon, isOperating)
		if err != nil {
			return fmt.Errorf("error inserting calendar day %s: %w", dateStr, err)
		}
	}
	return nil
}

func loadDistrictTravel(ctx context.Context, pool *pgxpool.Pool, path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()

	reader := csv.NewReader(f)
	header, err := reader.Read()
	if err != nil {
		return err
	}
	col := parseCSVHeader(header)

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		district := strings.TrimSpace(record[col["district"]])
		depot := strings.TrimSpace(record[col["depot"]])
		roadClass := strings.TrimSpace(record[col["road_class"]])
		kmh, _ := strconv.ParseFloat(strings.TrimSpace(record[col["free_flow_kmh"]]), 64)
		depotKm, _ := strconv.ParseFloat(strings.TrimSpace(record[col["depot_to_district_km"]]), 64)
		depotMin, _ := strconv.Atoi(strings.TrimSpace(record[col["depot_to_district_freeflow_min"]]))
		interKm, _ := strconv.ParseFloat(strings.TrimSpace(record[col["inter_stop_km"]]), 64)
		interMin, _ := strconv.Atoi(strings.TrimSpace(record[col["inter_stop_freeflow_min"]]))

		_, err = pool.Exec(ctx, `
			INSERT INTO district_travel (district, depot, road_class, free_flow_kmh, depot_to_district_km, depot_to_district_freeflow_min, inter_stop_km, inter_stop_freeflow_min)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (district, depot) DO UPDATE SET
				road_class = EXCLUDED.road_class,
				free_flow_kmh = EXCLUDED.free_flow_kmh,
				depot_to_district_km = EXCLUDED.depot_to_district_km,
				depot_to_district_freeflow_min = EXCLUDED.depot_to_district_freeflow_min,
				inter_stop_km = EXCLUDED.inter_stop_km,
				inter_stop_freeflow_min = EXCLUDED.inter_stop_freeflow_min
		`, district, depot, roadClass, kmh, depotKm, depotMin, interKm, interMin)
		if err != nil {
			return fmt.Errorf("error inserting district travel %s-%s: %w", district, depot, err)
		}
	}
	return nil
}

func loadServiceAllowance(ctx context.Context, pool *pgxpool.Pool, path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()

	reader := csv.NewReader(f)
	header, err := reader.Read()
	if err != nil {
		return err
	}
	col := parseCSVHeader(header)

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		brand := strings.TrimSpace(record[col["brand"]])
		dockType := strings.TrimSpace(record[col["dock_type"]])
		allowance, _ := strconv.Atoi(strings.TrimSpace(record[col["service_allowance_min"]]))

		_, err = pool.Exec(ctx, `
			INSERT INTO service_allowance (brand, dock_type, service_allowance_min)
			VALUES ($1, $2, $3)
			ON CONFLICT (brand, dock_type) DO UPDATE SET
				service_allowance_min = EXCLUDED.service_allowance_min
		`, brand, dockType, allowance)
		if err != nil {
			return fmt.Errorf("error inserting service allowance %s-%s: %w", brand, dockType, err)
		}
	}
	return nil
}

func seedCatalog(ctx context.Context, pool *pgxpool.Pool) error {
	items := []struct {
		sku      string
		brand    string
		nameEn   string
		nameSi   string
		nameTa   string
		weightKg float64
		volumeM3 float64
		temp     string
	}{
		// Fresh brand items
		{"SKU-FRESH-MILK-1L", "Fresh", "Fresh Full Cream Milk 1L", "නැවුම් එළකිරි 1L", "புதிய பால் 1L", 1.05, 0.0012, "chilled"},
		{"SKU-FRESH-YOGURT-80G", "Fresh", "Set Curd / Yogurt Cup", "යෝගට් කෝප්පය", "தயிர் கப்", 0.09, 0.0002, "chilled"},
		{"SKU-FRESH-CHICKEN-KG", "Fresh", "Whole Dressed Chicken 1kg", "නැවුම් කුකුළු මස් 1kg", "புதிய கோழி 1kg", 1.10, 0.0025, "chilled"},
		{"SKU-FRESH-VEG-CRATE", "Fresh", "Assorted Low-Country Vegetables (Crate)", "එළවළු කූඩය", "காய்கறி கூடை", 15.00, 0.0450, "ambient"},
		{"SKU-FRESH-RICE-5KG", "Fresh", "Nadu Steamed Rice 5kg", "නාඩු සහල් 5kg", "நாடு அரிசி 5kg", 5.05, 0.0070, "ambient"},
		{"SKU-FRESH-EGGS-30", "Fresh", "Farm Fresh White Eggs (Pack of 30)", "බිත්තර 30 ඇසුරුම", "முட்டை 30 பேக்", 1.80, 0.0040, "ambient"},

		// Style brand items
		{"SKU-STYLE-SHIRT-M", "Style", "Men's Formal Oxford Shirt (Pack of 5)", "පිරිමි කමිස 5 ඇසුරුම", "ஆண்கள் சட்டை 5 பேக்", 1.50, 0.0080, "ambient"},
		{"SKU-STYLE-SAREE-SILK", "Style", "Handloom Silk Saree Box", "සිල්ක් සාරි පෙට්ටිය", "பட்டுப் புடவை பெட்டி", 1.20, 0.0060, "ambient"},
		{"SKU-STYLE-SHOES-PAIR", "Style", "Casual Leather Shoes Crate", "පාවහන් පෙට්ටිය", "காலணி பெட்டி", 4.00, 0.0200, "ambient"},

		// Tech brand items
		{"SKU-TECH-SMART-TV", "Tech", "55-inch 4K UHD Smart Television", "55 අඟල් ස්මාර්ට් රූපවාහිනිය", "55 அங்குல ஸ்மார்ட் டிவி", 18.50, 0.1800, "ambient"},
		{"SKU-TECH-LAPTOP-BOX", "Tech", "Business Laptop & Charger Bundle", "ලැප්ටොප් පරිගණක ඇසුරුම", "மடிக்கணினி தொகுப்பு", 3.20, 0.0150, "ambient"},
		{"SKU-TECH-REFRIGERATOR", "Tech", "Inverter Double-Door Refrigerator", "ද්විත්ව දොර ශීතකරණය", "இரட்டை கதவு குளிர்சாதன பெட்டி", 68.00, 0.6500, "ambient"},
	}

	for _, it := range items {
		_, err := pool.Exec(ctx, `
			INSERT INTO catalog_items (sku, brand, name_en, name_si, name_ta, unit_weight_kg, unit_volume_m3, temp_requirement)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (sku) DO UPDATE SET
				name_en = EXCLUDED.name_en,
				name_si = EXCLUDED.name_si,
				name_ta = EXCLUDED.name_ta,
				unit_weight_kg = EXCLUDED.unit_weight_kg,
				unit_volume_m3 = EXCLUDED.unit_volume_m3,
				temp_requirement = EXCLUDED.temp_requirement
		`, it.sku, it.brand, it.nameEn, it.nameSi, it.nameTa, it.weightKg, it.volumeM3, it.temp)
		if err != nil {
			return err
		}
	}
	return nil
}

func seedVehicleAvailability(ctx context.Context, pool *pgxpool.Pool) error {
	// For demo day 2026-10-05: put several vehicles in the workshop
	// Peliyagoda: VEH-004 (reefer truck), VEH-018 (dry truck), VEH-054 (reefer van)
	// Kandy: VEH-042 (dry truck)
	demoDate := "2026-10-05"

	// Default all available for demo date
	_, err := pool.Exec(ctx, `
		INSERT INTO vehicle_availability (vehicle_id, date, status)
		SELECT vehicle_id, $1::date, 'available'
		FROM vehicles
		ON CONFLICT (vehicle_id, date) DO NOTHING
	`, demoDate)
	if err != nil {
		return err
	}

	// Set workshop vehicles
	workshopVehicles := []string{"VEH-004", "VEH-018", "VEH-054", "VEH-042"}
	for _, v := range workshopVehicles {
		_, err := pool.Exec(ctx, `
			UPDATE vehicle_availability
			SET status = 'in_workshop'
			WHERE vehicle_id = $1 AND date = $2::date
		`, v, demoDate)
		if err != nil {
			return err
		}
	}
	return nil
}

func seedAccounts(ctx context.Context, pool *pgxpool.Pool) error {
	defaultPass := "password123"
	hash, err := auth.HashPassword(defaultPass)
	if err != nil {
		return err
	}

	pinHash, err := auth.HashPassword("1234")
	if err != nil {
		return err
	}

	accounts := []struct {
		id        string
		name      string
		email     string
		role      string
		depot     *string
		outletID  *string
		vehicleID *string
		pinHash   *string
	}{
		{
			id:       "00000000-0000-0000-0000-000000000001",
			name:     "Peliyagoda Central Dispatcher",
			email:    "dispatcher@waypoint.local",
			role:     "dispatcher",
			depot:    strPtr("Peliyagoda"),
			outletID: nil, vehicleID: nil, pinHash: nil,
		},
		{
			id:       "00000000-0000-0000-0000-000000000002",
			name:     "Peliyagoda Dock Loader Terminal",
			email:    "loader@waypoint.local",
			role:     "loader",
			depot:    strPtr("Peliyagoda"),
			outletID: nil, vehicleID: nil, pinHash: &pinHash,
		},
		{
			id:       "00000000-0000-0000-0000-000000000003",
			name:     "Sunil Perera (Lead Reefer Driver)",
			email:    "driver@waypoint.local",
			role:     "driver",
			depot:    strPtr("Peliyagoda"),
			outletID: nil,
			vehicleID: strPtr("VEH-001"), // Bound to lowest-numbered Peliyagoda reefer truck!
			pinHash:  nil,
		},
		{
			id:       "00000000-0000-0000-0000-000000000004",
			name:     "Store Manager - Fresh Colombo Fort",
			email:    "store@waypoint.local",
			role:     "store_manager",
			depot:    strPtr("Peliyagoda"),
			outletID: strPtr("OUT-FRESH-001"), // Served in demo plan
			vehicleID: nil, pinHash: nil,
		},
		{
			id:       "00000000-0000-0000-0000-000000000005",
			name:     "Store Manager - Fresh Kalutara South",
			email:    "store.deferred@waypoint.local",
			role:     "store_manager",
			depot:    strPtr("Peliyagoda"),
			outletID: strPtr("OUT-FRESH-055"), // Deferred in demo plan due to capacity limit
			vehicleID: nil, pinHash: nil,
		},
	}

	for _, a := range accounts {
		uID := uuid.MustParse(a.id)
		_, err := pool.Exec(ctx, `
			INSERT INTO users (id, name, email, password_hash, pin_hash, role, depot, outlet_id, vehicle_id, locale, active, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'en', true, CURRENT_TIMESTAMP)
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				email = EXCLUDED.email,
				password_hash = EXCLUDED.password_hash,
				pin_hash = EXCLUDED.pin_hash,
				role = EXCLUDED.role,
				depot = EXCLUDED.depot,
				outlet_id = EXCLUDED.outlet_id,
				vehicle_id = EXCLUDED.vehicle_id
		`, uID, a.name, a.email, hash, a.pinHash, a.role, a.depot, a.outletID, a.vehicleID)
		if err != nil {
			return fmt.Errorf("failed to seed account %s: %w", a.email, err)
		}
	}
	return nil
}

func seedDemoDayOrders(ctx context.Context, pool *pgxpool.Pool) error {
	demoDate := "2026-10-05"
	creatorID := uuid.MustParse("00000000-0000-0000-0000-000000000004")

	// Set skip streaks for several outlets to show skip streak priority
	_, _ = pool.Exec(ctx, `
		INSERT INTO outlet_service_state (outlet_id, last_served_date, skip_streak)
		VALUES ('OUT-FRESH-001', '2026-10-03', 0),
		       ('OUT-FRESH-002', '2026-10-02', 1),
		       ('OUT-FRESH-031', '2026-10-01', 2)
		ON CONFLICT (outlet_id) DO UPDATE SET
			skip_streak = EXCLUDED.skip_streak,
			last_served_date = EXCLUDED.last_served_date
	`)

	// Let's create orders for demo date exceeding capacity at Peliyagoda
	// 1. OUT-FRESH-001: 2 same-day orders (ambient + chilled)
	if err := createDemoOrder(ctx, pool, "01923c8a-0000-7000-8000-000000000001", "ORD-20261005-001", "OUT-FRESH-001", "Fresh", demoDate, "chilled",
		[]lineItem{{"SKU-FRESH-MILK-1L", 100}, {"SKU-FRESH-YOGURT-80G", 200}}, creatorID); err != nil {
		return err
	}
	if err := createDemoOrder(ctx, pool, "01923c8a-0000-7000-8000-000000000002", "ORD-20261005-002", "OUT-FRESH-001", "Fresh", demoDate, "ambient",
		[]lineItem{{"SKU-FRESH-RICE-5KG", 50}, {"SKU-FRESH-EGGS-30", 30}}, creatorID); err != nil {
		return err
	}

	// 2. Orders matching Golden Test A: Fresh trip to Gampaha, 3 orders (2 rear_dock: OUT-FRESH-032, OUT-FRESH-034; 1 street: OUT-FRESH-031)
	if err := createDemoOrder(ctx, pool, "01923c8a-0000-7000-8000-000000000011", "ORD-20261005-011", "OUT-FRESH-032", "Fresh", demoDate, "chilled",
		[]lineItem{{"SKU-FRESH-MILK-1L", 80}}, creatorID); err != nil {
		return err
	}
	if err := createDemoOrder(ctx, pool, "01923c8a-0000-7000-8000-000000000012", "ORD-20261005-012", "OUT-FRESH-034", "Fresh", demoDate, "chilled",
		[]lineItem{{"SKU-FRESH-CHICKEN-KG", 60}}, creatorID); err != nil {
		return err
	}
	if err := createDemoOrder(ctx, pool, "01923c8a-0000-7000-8000-000000000013", "ORD-20261005-013", "OUT-FRESH-031", "Fresh", demoDate, "chilled",
		[]lineItem{{"SKU-FRESH-MILK-1L", 90}}, creatorID); err != nil {
		return err
	}

	// 3. Orders matching Golden Test B: second Fresh trip to Colombo, 4 street stops (OUT-FRESH-001, OUT-FRESH-004, OUT-FRESH-005, OUT-FRESH-007)
	if err := createDemoOrder(ctx, pool, "01923c8a-0000-7000-8000-000000000021", "ORD-20261005-021", "OUT-FRESH-004", "Fresh", demoDate, "chilled",
		[]lineItem{{"SKU-FRESH-MILK-1L", 120}}, creatorID); err != nil {
		return err
	}
	if err := createDemoOrder(ctx, pool, "01923c8a-0000-7000-8000-000000000022", "ORD-20261005-022", "OUT-FRESH-005", "Fresh", demoDate, "chilled",
		[]lineItem{{"SKU-FRESH-CHICKEN-KG", 80}}, creatorID); err != nil {
		return err
	}
	if err := createDemoOrder(ctx, pool, "01923c8a-0000-7000-8000-000000000023", "ORD-20261005-023", "OUT-FRESH-007", "Fresh", demoDate, "chilled",
		[]lineItem{{"SKU-FRESH-MILK-1L", 100}}, creatorID); err != nil {
		return err
	}

	// 4. Style & Tech orders in Colombo & Gampaha
	if err := createDemoOrder(ctx, pool, "01923c8a-0000-7000-8000-000000000031", "ORD-20261005-031", "OUT-STYLE-001", "Style", demoDate, "ambient",
		[]lineItem{{"SKU-STYLE-SHIRT-M", 80}, {"SKU-STYLE-SAREE-SILK", 40}}, creatorID); err != nil {
		return err
	}
	if err := createDemoOrder(ctx, pool, "01923c8a-0000-7000-8000-000000000032", "ORD-20261005-032", "OUT-TECH-001", "Tech", demoDate, "ambient",
		[]lineItem{{"SKU-TECH-SMART-TV", 15}, {"SKU-TECH-LAPTOP-BOX", 25}}, creatorID); err != nil {
		return err
	}

	// 5. Heavy chilled demand to exceed Peliyagoda reefer capacity (producing expected deferrals)
	for i := 40; i <= 55; i++ {
		ordID := fmt.Sprintf("01923c8a-0000-7000-8000-%012d", i)
		ordRef := fmt.Sprintf("ORD-20261005-%03d", i)
		outID := fmt.Sprintf("OUT-FRESH-%03d", i)
		_ = createDemoOrder(ctx, pool, ordID, ordRef, outID, "Fresh", demoDate, "chilled",
			[]lineItem{{"SKU-FRESH-MILK-1L", 250}, {"SKU-FRESH-CHICKEN-KG", 150}}, creatorID)
	}

	return nil
}

type lineItem struct {
	sku string
	qty int
}

func createDemoOrder(ctx context.Context, pool *pgxpool.Pool, idStr, ref, outletID, brand, dateStr, temp string, items []lineItem, creatorID uuid.UUID) error {
	ordID := uuid.MustParse(idStr)

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var totalUnits int
	var totalWeightG int64
	var totalVolumeUl int64

	type lineCalc struct {
		lineNo   int
		sku      string
		qty      int
		weightG  int64
		volumeUl int64
	}
	var lines []lineCalc

	for i, it := range items {
		var uWeight float64
		var uVolume float64
		err := tx.QueryRow(ctx, `SELECT unit_weight_kg, unit_volume_m3 FROM catalog_items WHERE sku = $1`, it.sku).Scan(&uWeight, &uVolume)
		if err != nil {
			return fmt.Errorf("catalog item %s not found: %w", it.sku, err)
		}

		wG := int64(uWeight * 1000 * float64(it.qty))
		vUl := int64(uVolume * 1000000000 * float64(it.qty))

		totalUnits += it.qty
		totalWeightG += wG
		totalVolumeUl += vUl

		lines = append(lines, lineCalc{
			lineNo:   i + 1,
			sku:      it.sku,
			qty:      it.qty,
			weightG:  wG,
			volumeUl: vUl,
		})
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO orders (id, ref, outlet_id, brand, delivery_date, temp_requirement, status, total_units, total_weight_g, total_volume_ul, placed_at, confirmed_at, is_late, source, version, created_by)
		VALUES ($1, $2, $3, $4, $5::date, $6, 'queued', $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false, 'app', 1, $10)
		ON CONFLICT (id) DO NOTHING
	`, ordID, ref, outletID, brand, dateStr, temp, totalUnits, totalWeightG, totalVolumeUl, creatorID)
	if err != nil {
		return err
	}

	for _, l := range lines {
		_, err = tx.Exec(ctx, `
			INSERT INTO order_lines (order_id, line_no, sku, qty, weight_g, volume_ul)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (order_id, line_no) DO NOTHING
		`, ordID, l.lineNo, l.sku, l.qty, l.weightG, l.volumeUl)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func strPtr(s string) *string {
	return &s
}
