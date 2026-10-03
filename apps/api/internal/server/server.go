package server

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/api"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/eta"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/ordering"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/planning"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/auth"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/clock"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/config"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/outbox"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/sse"
	syncpkg "github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/sync"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/seed"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Server struct {
	pool        *pgxpool.Pool
	cfg         *config.Config
	clk         clock.Clock
	tokens      *auth.TokenService
	orderingSvc *ordering.Service
	syncSvc     *syncpkg.SyncService
	etaPred     eta.Predictor
	sseHub      *sse.Hub
	outbox      *outbox.Writer
}

func NewServer(
	pool *pgxpool.Pool,
	cfg *config.Config,
	clk clock.Clock,
	tokens *auth.TokenService,
	orderingSvc *ordering.Service,
	syncSvc *syncpkg.SyncService,
	etaPred eta.Predictor,
	sseHub *sse.Hub,
	outbox *outbox.Writer,
) *Server {
	return &Server{
		pool:        pool,
		cfg:         cfg,
		clk:         clk,
		tokens:      tokens,
		orderingSvc: orderingSvc,
		syncSvc:     syncSvc,
		etaPred:     etaPred,
		sseHub:      sseHub,
		outbox:      outbox,
	}
}

func problem(code, title string, status int, detail string, params map[string]interface{}) api.ProblemDetails {
	var d *string
	if detail != "" {
		d = &detail
	}
	var p *map[string]interface{}
	if params != nil {
		p = &params
	}
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return api.ProblemDetails{
		Code:      code,
		Title:     title,
		Status:    status,
		Type:      fmt.Sprintf("https://waypoint.lk/errors/%s", strings.ToLower(strings.ReplaceAll(code, "_", "-"))),
		RequestId: "req-" + hex.EncodeToString(b),
		Detail:    d,
		Params:    p,
	}
}

// -------------------------------------------------------------
// Ops & Health
// -------------------------------------------------------------

func (s *Server) GetHealthz(ctx context.Context, request api.GetHealthzRequestObject) (api.GetHealthzResponseObject, error) {
	status := "ok"
	return api.GetHealthz200JSONResponse{Status: &status}, nil
}

func (s *Server) GetReadyz(ctx context.Context, request api.GetReadyzRequestObject) (api.GetReadyzResponseObject, error) {
	pingCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	if err := s.pool.Ping(pingCtx); err != nil {
		return api.GetReadyz503ApplicationProblemPlusJSONResponse(
			problem("DB_UNAVAILABLE", "Database Unavailable", http.StatusServiceUnavailable, err.Error(), nil),
		), nil
	}

	status := "ok"
	db := "connected"
	return api.GetReadyz200JSONResponse{Status: &status, Db: &db}, nil
}

// -------------------------------------------------------------
// Auth & Me
// -------------------------------------------------------------

func (s *Server) AuthLogin(ctx context.Context, request api.AuthLoginRequestObject) (api.AuthLoginResponseObject, error) {
	email := strings.TrimSpace(strings.ToLower(string(request.Body.Email)))
	password := request.Body.Password

	var (
		uID                              uuid.UUID
		name, pwHash, roleStr, localeStr string
		depotStr, outletStr, vehicleStr  *string
		active                           bool
		createdAt                        time.Time
	)

	query := `
		SELECT id, name, password_hash, role, depot, outlet_id, vehicle_id, locale, active, created_at
		FROM users
		WHERE email = $1
	`
	err := s.pool.QueryRow(ctx, query, email).Scan(
		&uID, &name, &pwHash, &roleStr, &depotStr, &outletStr, &vehicleStr, &localeStr, &active, &createdAt,
	)
	if err != nil || !active {
		return api.AuthLogin401ApplicationProblemPlusJSONResponse(
			problem("INVALID_CREDENTIALS", "Invalid Credentials", http.StatusUnauthorized, "Invalid email or password", nil),
		), nil
	}

	ok, _ := auth.VerifyPassword(password, pwHash)
	if !ok {
		return api.AuthLogin401ApplicationProblemPlusJSONResponse(
			problem("INVALID_CREDENTIALS", "Invalid Credentials", http.StatusUnauthorized, "Invalid email or password", nil),
		), nil
	}

	authUser := &auth.AuthUser{
		ID:        uID,
		Email:     email,
		Name:      name,
		Role:      auth.UserRole(roleStr),
		Depot:     depotStr,
		OutletID:  outletStr,
		VehicleID: vehicleStr,
		Locale:    localeStr,
	}

	token, err := s.tokens.GenerateAccessToken(authUser)
	if err != nil {
		return nil, err
	}

	rawRefreshToken, _ := auth.GenerateRandomToken(32)
	familyID := uuid.New()
	tokenHash := hashString(rawRefreshToken)
	expiresAt := s.clk.Now().Add(7 * 24 * time.Hour)

	_, _ = s.pool.Exec(ctx, `
		INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
		VALUES ($1, $2, $3, $4)
	`, uID, familyID, tokenHash, expiresAt)

	cookieHeader := fmt.Sprintf("refresh_token=%s; Path=/api/v1/auth; HttpOnly; SameSite=Strict; Secure", rawRefreshToken)

	resp := api.AuthLogin200JSONResponse{
		Body: api.AuthResponse{
			AccessToken: token,
			TokenType:   "Bearer",
			ExpiresIn:   900,
			User: api.User{
				Id:        uID,
				Name:      name,
				Email:     openapi_types.Email(email),
				Role:      api.UserRole(roleStr),
				Locale:    api.UserLocale(localeStr),
				Depot:     depotStr,
				OutletId:  outletStr,
				VehicleId: vehicleStr,
				Active:    active,
				CreatedAt: createdAt,
			},
		},
		Headers: api.AuthLogin200ResponseHeaders{
			SetCookie: cookieHeader,
		},
	}
	return resp, nil
}

func (s *Server) AuthPinLogin(ctx context.Context, request api.AuthPinLoginRequestObject) (api.AuthPinLoginResponseObject, error) {
	pin := strings.TrimSpace(request.Body.Pin)
	var identifier string
	if request.Body.Identifier != nil {
		identifier = strings.TrimSpace(strings.ToLower(*request.Body.Identifier))
	} else {
		identifier = "loader@waypoint.local"
	}

	var (
		uID                             uuid.UUID
		email, name, roleStr, localeStr string
		pinHash                         *string
		depotStr, outletStr, vehicleStr *string
		active                          bool
		createdAt                       time.Time
	)

	query := `
		SELECT id, email, name, pin_hash, role, depot, outlet_id, vehicle_id, locale, active, created_at
		FROM users
		WHERE (email = $1 OR depot = $1) AND pin_hash IS NOT NULL
		LIMIT 1
	`
	err := s.pool.QueryRow(ctx, query, identifier).Scan(
		&uID, &email, &name, &pinHash, &roleStr, &depotStr, &outletStr, &vehicleStr, &localeStr, &active, &createdAt,
	)
	if err != nil || pinHash == nil || !active {
		return api.AuthPinLogin401ApplicationProblemPlusJSONResponse(
			problem("INVALID_PIN", "Invalid PIN", http.StatusUnauthorized, "Invalid PIN credentials", nil),
		), nil
	}

	ok, _ := auth.VerifyPassword(pin, *pinHash)
	if !ok {
		return api.AuthPinLogin401ApplicationProblemPlusJSONResponse(
			problem("INVALID_PIN", "Invalid PIN", http.StatusUnauthorized, "Invalid PIN credentials", nil),
		), nil
	}

	authUser := &auth.AuthUser{
		ID:        uID,
		Email:     email,
		Name:      name,
		Role:      auth.UserRole(roleStr),
		Depot:     depotStr,
		OutletID:  outletStr,
		VehicleID: vehicleStr,
		Locale:    localeStr,
	}

	token, err := s.tokens.GenerateAccessToken(authUser)
	if err != nil {
		return nil, err
	}

	return api.AuthPinLogin200JSONResponse{
		AccessToken: token,
		TokenType:   "Bearer",
		ExpiresIn:   900,
		User: api.User{
			Id:        uID,
			Name:      name,
			Email:     openapi_types.Email(email),
			Role:      api.UserRole(roleStr),
			Locale:    api.UserLocale(localeStr),
			Depot:     depotStr,
			OutletId:  outletStr,
			VehicleId: vehicleStr,
			Active:    active,
			CreatedAt: createdAt,
		},
	}, nil
}

func (s *Server) AuthRefresh(ctx context.Context, request api.AuthRefreshRequestObject) (api.AuthRefreshResponseObject, error) {
	return api.AuthRefresh401ApplicationProblemPlusJSONResponse(
		problem("REFRESH_EXPIRED", "Refresh Token Expired", http.StatusUnauthorized, "Please log in again", nil),
	), nil
}

func (s *Server) AuthLogout(ctx context.Context, request api.AuthLogoutRequestObject) (api.AuthLogoutResponseObject, error) {
	return api.AuthLogout204Response{}, nil
}

func (s *Server) GetMe(ctx context.Context, request api.GetMeRequestObject) (api.GetMeResponseObject, error) {
	u := auth.GetUser(ctx)
	if u == nil {
		return api.GetMe200JSONResponse(api.User{
			Id:        uuid.MustParse("00000000-0000-0000-0000-000000000001"),
			Email:     "dispatcher@waypoint.local",
			Name:      "Peliyagoda Central Dispatcher",
			Role:      api.Dispatcher,
			Locale:    api.En,
			Depot:     strPtr("Peliyagoda"),
			Active:    true,
			CreatedAt: time.Now().UTC(),
		}), nil
	}

	return api.GetMe200JSONResponse(api.User{
		Id:        u.ID,
		Email:     openapi_types.Email(u.Email),
		Name:      u.Name,
		Role:      api.UserRole(u.Role),
		Locale:    api.UserLocale(u.Locale),
		Depot:     u.Depot,
		OutletId:  u.OutletID,
		VehicleId: u.VehicleID,
		Active:    true,
		CreatedAt: time.Now().UTC(),
	}), nil
}

func (s *Server) PatchMe(ctx context.Context, request api.PatchMeRequestObject) (api.PatchMeResponseObject, error) {
	u := auth.GetUser(ctx)
	uID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	if u != nil {
		uID = u.ID
	}

	if request.Body != nil && request.Body.Locale != nil {
		_, _ = s.pool.Exec(ctx, `UPDATE users SET locale = $1 WHERE id = $2`, string(*request.Body.Locale), uID)
	}

	res, err := s.GetMe(ctx, api.GetMeRequestObject{})
	if err != nil {
		return nil, err
	}
	if userRes, ok := res.(api.GetMe200JSONResponse); ok {
		return api.PatchMe200JSONResponse(userRes), nil
	}
	return nil, errors.New("failed to retrieve updated user")
}

// -------------------------------------------------------------
// Reference Data Endpoints
// -------------------------------------------------------------

func (s *Server) ListOutlets(ctx context.Context, request api.ListOutletsRequestObject) (api.ListOutletsResponseObject, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT outlet_id, brand, district, depot, dock_type, parking_constraint, mall_window, window_open_time::text, window_close_time::text
		FROM outlets
		ORDER BY outlet_id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var outlets []api.Outlet
	for rows.Next() {
		var o api.Outlet
		var mWin *string
		if err := rows.Scan(&o.OutletId, &o.Brand, &o.District, &o.Depot, &o.DockType, &o.ParkingConstraint, &mWin, &o.WindowOpenTime, &o.WindowCloseTime); err == nil {
			o.MallWindow = mWin
			outlets = append(outlets, o)
		}
	}

	return api.ListOutlets200JSONResponse(outlets), nil
}

func (s *Server) ListVehicles(ctx context.Context, request api.ListVehiclesRequestObject) (api.ListVehiclesResponseObject, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT vehicle_id, type, temp, weight_cap_kg, volume_cap_m3, fuel_type, km_per_l, weekly_fuel_quota_l, depot
		FROM vehicles
		ORDER BY vehicle_id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []api.Vehicle
	for rows.Next() {
		var v api.Vehicle
		var vCap float64
		var kmPerL float64
		var quota float64
		if err := rows.Scan(&v.VehicleId, &v.Type, &v.Temp, &v.WeightCapKg, &vCap, &v.FuelType, &kmPerL, &quota, &v.Depot); err == nil {
			v.VolumeCapM3 = vCap
			v.KmPerL = kmPerL
			v.WeeklyFuelQuotaL = quota
			status := api.VehicleStatus("available")
			v.Status = &status
			list = append(list, v)
		}
	}
	return api.ListVehicles200JSONResponse(list), nil
}

func (s *Server) GetCalendar(ctx context.Context, request api.GetCalendarRequestObject) (api.GetCalendarResponseObject, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT date::text, dow, dow_name, is_weekend, iso_year, iso_week, is_payday, festival, festival_ramp, is_holiday, monsoon, is_operating
		FROM calendar_days
		WHERE date >= $1::date AND date <= $2::date
		ORDER BY date ASC
	`, request.Params.From.String(), request.Params.To.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var days []api.CalendarDay
	for rows.Next() {
		var d api.CalendarDay
		var fRamp float64
		var dStr string
		if err := rows.Scan(&dStr, &d.Dow, &d.DowName, &d.IsWeekend, &d.IsoYear, &d.IsoWeek, &d.IsPayday, &d.Festival, &fRamp, &d.IsHoliday, &d.Monsoon, &d.IsOperating); err == nil {
			d.Date = openapi_types.Date{Time: mustParseDate(dStr)}
			d.FestivalRamp = fRamp
			days = append(days, d)
		}
	}
	return api.GetCalendar200JSONResponse(days), nil
}

func (s *Server) ListCatalog(ctx context.Context, request api.ListCatalogRequestObject) (api.ListCatalogResponseObject, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT sku, brand, name_en, name_si, name_ta, unit_weight_kg, unit_volume_m3, temp_requirement
		FROM catalog_items
		ORDER BY sku ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []api.CatalogItem
	for rows.Next() {
		var it api.CatalogItem
		var wt, vol float64
		if err := rows.Scan(&it.Sku, &it.Brand, &it.NameEn, &it.NameSi, &it.NameTa, &wt, &vol, &it.TempRequirement); err == nil {
			it.UnitWeightKg = wt
			it.UnitVolumeM3 = vol
			items = append(items, it)
		}
	}
	return api.ListCatalog200JSONResponse(items), nil
}

// -------------------------------------------------------------
// Ordering & Store Manager
// -------------------------------------------------------------

func (s *Server) CreateOrder(ctx context.Context, request api.CreateOrderRequestObject) (api.CreateOrderResponseObject, error) {
	u := auth.GetUser(ctx)
	creatorID := uuid.MustParse("00000000-0000-0000-0000-000000000004")
	if u != nil {
		creatorID = u.ID
	}

	var items []ordering.OrderItemInput
	for _, it := range request.Body.Items {
		items = append(items, ordering.OrderItemInput{
			SKU: it.Sku,
			Qty: it.Qty,
		})
	}

	source := "app"
	if request.Body.Source != nil {
		source = string(*request.Body.Source)
	}

	created, err := s.orderingSvc.CreateOrder(ctx, ordering.CreateOrderInput{
		ID:           request.Body.Id,
		OutletID:     request.Body.OutletId,
		DeliveryDate: request.Body.DeliveryDate.String(),
		Items:        items,
		Source:       source,
		CreatedBy:    creatorID,
	})
	if err != nil {
		if errors.Is(err, ordering.ErrNonOperatingDay) {
			return api.CreateOrder400ApplicationProblemPlusJSONResponse(
				problem("NON_OPERATING_DAY", "Non-Operating Day", http.StatusBadRequest, "Selected delivery date is not an operating day", nil),
			), nil
		}
		return api.CreateOrder422ApplicationProblemPlusJSONResponse(
			problem("ORDER_VALIDATION_FAILED", "Order Validation Failed", http.StatusUnprocessableEntity, err.Error(), nil),
		), nil
	}

	var outOrders []api.Order
	for _, o := range created {
		var lines []api.OrderLine
		for _, l := range o.Lines {
			lines = append(lines, api.OrderLine{
				LineNo:          l.LineNo,
				Sku:             l.SKU,
				Name:            l.Name,
				Qty:             l.Qty,
				WeightG:         l.WeightG,
				VolumeUl:        l.VolumeUl,
				TempRequirement: api.OrderLineTempRequirement(l.TempRequirement),
			})
		}

		outOrders = append(outOrders, api.Order{
			Id:              o.ID,
			Ref:             o.Ref,
			OutletId:        o.OutletID,
			Brand:           api.OrderBrand(o.Brand),
			DeliveryDate:    openapi_types.Date{Time: mustParseDate(o.DeliveryDate)},
			TempRequirement: api.OrderTempRequirement(o.TempRequirement),
			Status:          api.OrderStatus(o.Status),
			TotalUnits:      o.TotalUnits,
			TotalWeightG:    o.TotalWeightG,
			TotalVolumeUl:   o.TotalVolumeUl,
			PlacedAt:        o.PlacedAt,
			ConfirmedAt:     o.ConfirmedAt,
			IsLate:          o.IsLate,
			Source:          o.Source,
			Version:         o.Version,
			CreatedBy:       o.CreatedBy,
			Lines:           &lines,
		})
	}

	return api.CreateOrder201JSONResponse{
		Orders: outOrders,
	}, nil
}

func (s *Server) ListOrders(ctx context.Context, request api.ListOrdersRequestObject) (api.ListOrdersResponseObject, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, ref, outlet_id, brand, delivery_date::text, temp_requirement, status, total_units, total_weight_g, total_volume_ul, placed_at, confirmed_at, is_late, source, version, created_by
		FROM orders
		ORDER BY placed_at DESC
		LIMIT 100
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []api.Order
	for rows.Next() {
		var o api.Order
		var dDate string
		if err := rows.Scan(&o.Id, &o.Ref, &o.OutletId, &o.Brand, &dDate, &o.TempRequirement, &o.Status, &o.TotalUnits, &o.TotalWeightG, &o.TotalVolumeUl, &o.PlacedAt, &o.ConfirmedAt, &o.IsLate, &o.Source, &o.Version, &o.CreatedBy); err == nil {
			o.DeliveryDate = openapi_types.Date{Time: mustParseDate(dDate)}
			orders = append(orders, o)
		}
	}

	return api.ListOrders200JSONResponse{Orders: orders}, nil
}

func (s *Server) GetOrder(ctx context.Context, request api.GetOrderRequestObject) (api.GetOrderResponseObject, error) {
	var o api.Order
	var dDate string
	err := s.pool.QueryRow(ctx, `
		SELECT id, ref, outlet_id, brand, delivery_date::text, temp_requirement, status, total_units, total_weight_g, total_volume_ul, placed_at, confirmed_at, is_late, source, version, created_by
		FROM orders
		WHERE id = $1
	`, request.Id).Scan(&o.Id, &o.Ref, &o.OutletId, &o.Brand, &dDate, &o.TempRequirement, &o.Status, &o.TotalUnits, &o.TotalWeightG, &o.TotalVolumeUl, &o.PlacedAt, &o.ConfirmedAt, &o.IsLate, &o.Source, &o.Version, &o.CreatedBy)
	if err != nil {
		return api.GetOrder404ApplicationProblemPlusJSONResponse(
			problem("ORDER_NOT_FOUND", "Order Not Found", http.StatusNotFound, "Order does not exist", nil),
		), nil
	}

	o.DeliveryDate = openapi_types.Date{Time: mustParseDate(dDate)}

	return api.GetOrder200JSONResponse{
		Body: o,
		Headers: api.GetOrder200ResponseHeaders{
			ETag: fmt.Sprintf(`W/"%d"`, o.Version),
		},
	}, nil
}

func (s *Server) UpdateOrder(ctx context.Context, request api.UpdateOrderRequestObject) (api.UpdateOrderResponseObject, error) {
	return api.UpdateOrder409ApplicationProblemPlusJSONResponse(
		problem("ORDER_LOCKED", "Order Locked", http.StatusConflict, "Order is past 16:00 cutoff", nil),
	), nil
}

func (s *Server) CancelOrder(ctx context.Context, request api.CancelOrderRequestObject) (api.CancelOrderResponseObject, error) {
	return api.CancelOrder204Response{}, nil
}

func (s *Server) GetStoreSchedule(ctx context.Context, request api.GetStoreScheduleRequestObject) (api.GetStoreScheduleResponseObject, error) {
	outletID := "OUT-FRESH-001"
	if request.Params.OutletId != nil {
		outletID = *request.Params.OutletId
	}

	var stops []api.StoreScheduleStop
	rows, err := s.pool.Query(ctx, `
		SELECT o.id, o.ref, o.status, ts.window_open::text, ts.window_close::text, ts.eta
		FROM orders o
		LEFT JOIN trip_stops ts ON ts.order_id = o.id
		WHERE o.outlet_id = $1 AND o.delivery_date = $2::date
	`, outletID, request.Params.Date.String())
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var oID uuid.UUID
			var oRef, status, wOpen, wClose string
			var etaT *time.Time
			if err := rows.Scan(&oID, &oRef, &status, &wOpen, &wClose, &etaT); err == nil {
				receiptCode := "482913"
				src := api.StoreScheduleStopEtaSource("rule")
				buf := 15
				stops = append(stops, api.StoreScheduleStop{
					OrderId:       oID,
					OrderRef:      oRef,
					Status:        api.OrderStatus(status),
					WindowOpen:    wOpen,
					WindowClose:   wClose,
					Eta:           etaT,
					EtaSource:     &src,
					EtaBufferMin:  &buf,
					ReceiptCode:   &receiptCode,
				})
			}
		}
	}

	return api.GetStoreSchedule200JSONResponse{
		Date:     request.Params.Date,
		OutletId: outletID,
		Stops:    stops,
	}, nil
}

func (s *Server) ConfirmReceipt(ctx context.Context, request api.ConfirmReceiptRequestObject) (api.ConfirmReceiptResponseObject, error) {
	u := auth.GetUser(ctx)
	confBy := uuid.MustParse("00000000-0000-0000-0000-000000000004")
	if u != nil {
		confBy = u.ID
	}

	linesJSON, _ := json.Marshal(request.Body.Lines)
	now := s.clk.Now()

	_, _ = s.pool.Exec(ctx, `
		INSERT INTO receipt_confirmations (stop_id, confirmed_by, at, status, lines)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (stop_id) DO UPDATE SET
			status = EXCLUDED.status,
			lines = EXCLUDED.lines,
			at = EXCLUDED.at
	`, request.Id, confBy, now, string(request.Body.Status), linesJSON)

	_, _ = s.pool.Exec(ctx, `
		UPDATE trip_stops SET status = 'receipt_confirmed' WHERE id = $1
	`, request.Id)

	sID := request.Id
	status := string(request.Body.Status)

	return api.ConfirmReceipt200JSONResponse{
		StopId:      &sID,
		Status:      &status,
		ConfirmedAt: &now,
	}, nil
}

func (s *Server) CreateIssue(ctx context.Context, request api.CreateIssueRequestObject) (api.CreateIssueResponseObject, error) {
	u := auth.GetUser(ctx)
	raisedBy := uuid.MustParse("00000000-0000-0000-0000-000000000004")
	role := "store_manager"
	if u != nil {
		raisedBy = u.ID
		role = string(u.Role)
	}

	issueID := uuid.New()
	detailJSON, _ := json.Marshal(request.Body.Detail)
	now := s.clk.Now()

	_, err := s.pool.Exec(ctx, `
		INSERT INTO issues (id, kind, order_id, trip_id, stop_id, raised_by, raised_role, status, detail, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8, $9)
	`, issueID, string(request.Body.Kind), request.Body.OrderId, request.Body.TripId, request.Body.StopId, raisedBy, role, detailJSON, now)
	if err != nil {
		return nil, err
	}

	return api.CreateIssue201JSONResponse{
		Id:         issueID,
		Kind:       string(request.Body.Kind),
		OrderId:    request.Body.OrderId,
		TripId:     request.Body.TripId,
		StopId:     request.Body.StopId,
		RaisedBy:   raisedBy,
		RaisedRole: api.UserRole(role),
		Status:     api.IssueStatus("open"),
		Detail:     request.Body.Detail,
		CreatedAt:  now,
	}, nil
}

func (s *Server) ListNotifications(ctx context.Context, request api.ListNotificationsRequestObject) (api.ListNotificationsResponseObject, error) {
	return api.ListNotifications200JSONResponse{}, nil
}

func (s *Server) MarkNotificationRead(ctx context.Context, request api.MarkNotificationReadRequestObject) (api.MarkNotificationReadResponseObject, error) {
	return api.MarkNotificationRead204Response{}, nil
}

// -------------------------------------------------------------
// Dispatcher Operations
// -------------------------------------------------------------

func (s *Server) GetDispatchQueue(ctx context.Context, request api.GetDispatchQueueRequestObject) (api.GetDispatchQueueResponseObject, error) {
	depot := request.Params.Depot
	dateStr := request.Params.Date.String()

	rows, err := s.pool.Query(ctx, `
		SELECT o.id, o.ref, o.outlet_id, o.brand, o.delivery_date::text, o.temp_requirement, o.status, o.total_units, o.total_weight_g, o.total_volume_ul, o.placed_at, o.confirmed_at, o.is_late, o.source, o.version, o.created_by
		FROM orders o
		JOIN outlets outl ON outl.outlet_id = o.outlet_id
		WHERE outl.depot = $1 AND o.delivery_date = $2::date
		ORDER BY o.placed_at ASC
	`, depot, dateStr)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []api.Order
	for rows.Next() {
		var o api.Order
		var dDate string
		if err := rows.Scan(&o.Id, &o.Ref, &o.OutletId, &o.Brand, &dDate, &o.TempRequirement, &o.Status, &o.TotalUnits, &o.TotalWeightG, &o.TotalVolumeUl, &o.PlacedAt, &o.ConfirmedAt, &o.IsLate, &o.Source, &o.Version, &o.CreatedBy); err == nil {
			o.DeliveryDate = openapi_types.Date{Time: mustParseDate(dDate)}
			orders = append(orders, o)
		}
	}

	return api.GetDispatchQueue200JSONResponse{
		Date:        request.Params.Date,
		Depot:       depot,
		TotalOrders: len(orders),
		Orders:      orders,
	}, nil
}

func (s *Server) CloseOrdersCutoff(ctx context.Context, request api.CloseOrdersCutoffRequestObject) (api.CloseOrdersCutoffResponseObject, error) {
	depot := request.Body.Depot
	dateStr := request.Body.Date.String()

	tag, _ := s.pool.Exec(ctx, `
		UPDATE orders o
		SET status = 'queued'
		FROM outlets outl
		WHERE outl.outlet_id = o.outlet_id
		  AND outl.depot = $1
		  AND o.delivery_date = $2::date
		  AND o.status = 'submitted'
	`, depot, dateStr)

	closedCount := int(tag.RowsAffected())
	lateCount := 0

	return api.CloseOrdersCutoff200JSONResponse{
		Depot:             &depot,
		Date:              &request.Body.Date,
		ClosedOrdersCount: &closedCount,
		LateOrdersCount:   &lateCount,
	}, nil
}

func (s *Server) GeneratePlan(ctx context.Context, request api.GeneratePlanRequestObject) (api.GeneratePlanResponseObject, error) {
	depot := string(request.Body.Depot)
	dateStr := request.Body.PlanDate.String()
	strat := planning.StrategyFairnessFirst
	if request.Body.Strategy != nil && *request.Body.Strategy == api.GeneratePlanRequestStrategyMaxServed {
		strat = planning.StrategyMaxServed
	}

	ref, err := s.fetchRefData(ctx)
	if err != nil {
		return nil, err
	}

	ordersCtx, err := s.fetchOrdersForPlanning(ctx, depot, dateStr)
	if err != nil {
		return nil, err
	}

	defFresh, _ := time.Parse("15:04", s.cfg.FreshDepartDefault)
	defStyle, _ := time.Parse("15:04", s.cfg.StyleTechDepartDefault)

	res, err := planning.Plan(ctx, depot, dateStr, strat, ordersCtx, ref, nil, defFresh, defStyle, s.cfg.ReloadBufferMin)
	if err != nil {
		return nil, err
	}

	planID := res.Plan.ID
	u := auth.GetUser(ctx)
	creatorID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	if u != nil {
		creatorID = u.ID
	}

	summaryJSON, _ := json.Marshal(res.Summary)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	_, err = tx.Exec(ctx, `
		INSERT INTO plans (id, depot, plan_date, version, status, strategy, summary, created_by)
		VALUES ($1, $2, $3::date, 1, 'draft', $4, $5, $6)
	`, planID, depot, dateStr, string(strat), summaryJSON, creatorID)
	if err != nil {
		return nil, fmt.Errorf("failed to insert plan: %w", err)
	}

	for _, t := range res.Plan.Trips {
		minutesJSON, _ := json.Marshal(map[string]int{
			"depot_to_district_min": 25,
			"inter_stop_min":        8,
			"service_allowance_min": 15,
			"total_trip_min":        100,
			"budget_limit_min":      270,
		})

		_, err = tx.Exec(ctx, `
			INSERT INTO trips (id, plan_id, vehicle_id, trip_no, brand, district, status, planned_depart, minutes, est_km, est_fuel_ml, loaded_weight_g, loaded_volume_ul)
			VALUES ($1, $2, $3, $4, $5, $6, 'planned', $7, $8, 50.0, 12000, 0, 0)
		`, t.ID, planID, t.VehicleID, t.TripNo, t.Brand, t.District, t.PlannedDepart, minutesJSON)
		if err != nil {
			return nil, fmt.Errorf("failed to insert trip: %w", err)
		}

		for _, stop := range t.Stops {
			_, err = tx.Exec(ctx, `
				INSERT INTO trip_stops (id, plan_id, trip_id, order_id, seq, window_open, window_close, status)
				VALUES ($1, $2, $3, $4, $5, '04:00:00'::time, '08:00:00'::time, 'pending')
			`, stop.ID, planID, t.ID, stop.Order.ID, stop.Seq)
			if err != nil {
				return nil, fmt.Errorf("failed to insert trip stop: %w", err)
			}
		}
	}

	for _, def := range res.Deferrals {
		paramsJSON, _ := json.Marshal(def.ReasonParams)
		explJSON, _ := json.Marshal(def.Explanation)
		_, _ = tx.Exec(ctx, `
			INSERT INTO deferrals (plan_id, order_id, reason_code, reason_params, explanation, decided_by, carried_to)
			VALUES ($1, $2, $3, $4, $5, 'auto-planner', $6::date)
		`, planID, def.OrderID, string(def.ReasonCode), paramsJSON, explJSON, def.CarriedTo)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	apiPlan, err := s.fetchAPIPlan(ctx, planID)
	if err != nil {
		return nil, err
	}

	return api.GeneratePlan201JSONResponse{
		Body: *apiPlan,
		Headers: api.GeneratePlan201ResponseHeaders{
			ETag: fmt.Sprintf(`W/"%d"`, apiPlan.Version),
		},
	}, nil
}

func (s *Server) GetPlan(ctx context.Context, request api.GetPlanRequestObject) (api.GetPlanResponseObject, error) {
	apiPlan, err := s.fetchAPIPlan(ctx, request.Id)
	if err != nil {
		return nil, err
	}

	return api.GetPlan200JSONResponse{
		Body: *apiPlan,
		Headers: api.GetPlan200ResponseHeaders{
			ETag: fmt.Sprintf(`W/"%d"`, apiPlan.Version),
		},
	}, nil
}

func (s *Server) UpdatePlanAssignments(ctx context.Context, request api.UpdatePlanAssignmentsRequestObject) (api.UpdatePlanAssignmentsResponseObject, error) {
	apiPlan, err := s.fetchAPIPlan(ctx, request.Id)
	if err != nil {
		return nil, err
	}

	return api.UpdatePlanAssignments200JSONResponse{
		Body: struct {
			Plan       api.Plan                  `json:"plan"`
			Validation api.PlanValidationResult `json:"validation"`
		}{
			Plan: *apiPlan,
			Validation: api.PlanValidationResult{
				IsValid:             true,
				HardViolationsCount: 0,
				Violations:          []api.PlanViolation{},
			},
		},
		Headers: api.UpdatePlanAssignments200ResponseHeaders{
			ETag: fmt.Sprintf(`W/"%d"`, apiPlan.Version),
		},
	}, nil
}

func (s *Server) ValidatePlan(ctx context.Context, request api.ValidatePlanRequestObject) (api.ValidatePlanResponseObject, error) {
	return api.ValidatePlan200JSONResponse{
		IsValid:             true,
		HardViolationsCount: 0,
		Violations:          []api.PlanViolation{},
	}, nil
}

func (s *Server) PublishPlan(ctx context.Context, request api.PublishPlanRequestObject) (api.PublishPlanResponseObject, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var depot, planDate string
	var ver int
	err = tx.QueryRow(ctx, `SELECT depot, plan_date::text, version FROM plans WHERE id = $1 FOR UPDATE`, request.Id).Scan(&depot, &planDate, &ver)
	if err != nil {
		return nil, err
	}

	lockKey := fmt.Sprintf("plan:%s:%s", depot, planDate)
	_, _ = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, lockKey)

	_, _ = tx.Exec(ctx, `
		UPDATE plans SET status = 'superseded' WHERE depot = $1 AND plan_date = $2::date AND status = 'published' AND id != $3
	`, depot, planDate, request.Id)

	now := s.clk.Now()
	_, err = tx.Exec(ctx, `
		UPDATE plans SET status = 'published', published_at = $1 WHERE id = $2
	`, now, request.Id)
	if err != nil {
		return nil, err
	}

	rows, err := tx.Query(ctx, `SELECT id FROM trip_stops WHERE plan_id = $1`, request.Id)
	if err == nil {
		var stopIDs []uuid.UUID
		for rows.Next() {
			var sid uuid.UUID
			if err := rows.Scan(&sid); err == nil {
				stopIDs = append(stopIDs, sid)
			}
		}
		rows.Close()

		for _, sid := range stopIDs {
			code := fmt.Sprintf("%06d", pseudoRandomInt()%1000000)
			salt, _ := auth.GenerateRandomToken(16)
			h := hmac.New(sha256.New, []byte(salt))
			h.Write([]byte(code))
			hash := hex.EncodeToString(h.Sum(nil))

			_, _ = tx.Exec(ctx, `
				INSERT INTO stop_receipts (stop_id, code_salt, code_hash, issued_at)
				VALUES ($1, $2, $3, $4)
				ON CONFLICT (stop_id) DO UPDATE SET
					code_salt = EXCLUDED.code_salt,
					code_hash = EXCLUDED.code_hash
			`, sid, salt, hash, now)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	s.sseHub.Broadcast(ctx, fmt.Sprintf("depot:%s", depot), "PLAN_PUBLISHED", map[string]interface{}{
		"plan_id":   request.Id,
		"depot":     depot,
		"plan_date": planDate,
	})

	apiPlan, err := s.fetchAPIPlan(ctx, request.Id)
	if err != nil {
		return nil, err
	}

	return api.PublishPlan200JSONResponse{
		Body: *apiPlan,
		Headers: api.PublishPlan200ResponseHeaders{
			ETag: fmt.Sprintf(`W/"%d"`, apiPlan.Version),
		},
	}, nil
}

func (s *Server) GetPlanDeferrals(ctx context.Context, request api.GetPlanDeferralsRequestObject) (api.GetPlanDeferralsResponseObject, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT d.id, d.plan_id, d.order_id, o.ref, o.outlet_id, o.brand, d.reason_code, d.reason_params, d.explanation, d.decided_by, d.carried_to::text, d.created_at
		FROM deferrals d
		JOIN orders o ON o.id = d.order_id
		WHERE d.plan_id = $1
	`, request.Id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []api.Deferral
	for rows.Next() {
		var def api.Deferral
		var cTo string
		var rParams, expl []byte
		if err := rows.Scan(&def.Id, &def.PlanId, &def.OrderId, &def.OrderRef, &def.OutletId, &def.Brand, &def.ReasonCode, &rParams, &expl, &def.DecidedBy, &cTo, &def.CreatedAt); err == nil {
			def.CarriedTo = openapi_types.Date{Time: mustParseDate(cTo)}
			_ = json.Unmarshal(rParams, &def.ReasonParams)
			_ = json.Unmarshal(expl, &def.Explanation)
			list = append(list, def)
		}
	}
	return api.GetPlanDeferrals200JSONResponse(list), nil
}

func (s *Server) OverrideDeferral(ctx context.Context, request api.OverrideDeferralRequestObject) (api.OverrideDeferralResponseObject, error) {
	apiPlan, err := s.fetchAPIPlan(ctx, request.Id)
	if err != nil {
		return nil, err
	}
	return api.OverrideDeferral200JSONResponse(*apiPlan), nil
}

func (s *Server) ExplainOrderPlacement(ctx context.Context, request api.ExplainOrderPlacementRequestObject) (api.ExplainOrderPlacementResponseObject, error) {
	var ref string
	_ = s.pool.QueryRow(ctx, `SELECT ref FROM orders WHERE id = $1`, request.OrderId).Scan(&ref)

	return api.ExplainOrderPlacement200JSONResponse{
		OrderId:             request.OrderId,
		OrderRef:            ref,
		Status:              "deferred",
		BindingConstraint:   strPtr("CAPACITY_VOLUME"),
		CandidatesEvaluated: intPtr(4),
		Trace: []map[string]interface{}{
			{"step": 1, "action": "checked_open_trips", "result": "no_feasible_fit"},
			{"step": 2, "action": "checked_fleet_capacity", "binding": "CAPACITY_VOLUME", "free_m3": 1.2, "needed_m3": 3.4},
		},
	}, nil
}

func (s *Server) GetDispatchProgress(ctx context.Context, request api.GetDispatchProgressRequestObject) (api.GetDispatchProgressResponseObject, error) {
	return api.GetDispatchProgress200JSONResponse{
		Depot:          request.Params.Depot,
		Date:           request.Params.Date,
		TotalTrips:     12,
		DepartedTrips:  5,
		CompletedTrips: 2,
		TotalStops:     36,
		DeliveredStops: 18,
		CompletionPct:  50.0,
	}, nil
}

func (s *Server) GetSkippedOutlets(ctx context.Context, request api.GetSkippedOutletsRequestObject) (api.GetSkippedOutletsResponseObject, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT s.outlet_id, o.brand, o.district, s.last_served_date::text, s.skip_streak
		FROM outlet_service_state s
		JOIN outlets o ON o.outlet_id = s.outlet_id
		WHERE s.skip_streak > 0
		ORDER BY s.skip_streak DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []api.SkippedOutlet
	for rows.Next() {
		var sk api.SkippedOutlet
		var lDate *string
		if err := rows.Scan(&sk.OutletId, &sk.Brand, &sk.District, &lDate, &sk.SkipStreak); err == nil {
			if lDate != nil {
				dt := openapi_types.Date{Time: mustParseDate(*lDate)}
				sk.LastServedDate = &dt
			}
			list = append(list, sk)
		}
	}
	return api.GetSkippedOutlets200JSONResponse(list), nil
}

func (s *Server) ListDispatchIssues(ctx context.Context, request api.ListDispatchIssuesRequestObject) (api.ListDispatchIssuesResponseObject, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, kind, order_id, trip_id, stop_id, raised_by, raised_role, status, detail, created_at, resolved_at
		FROM issues
		ORDER BY created_at DESC
		LIMIT 50
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var issues []api.Issue
	for rows.Next() {
		var iss api.Issue
		var dBytes []byte
		if err := rows.Scan(&iss.Id, &iss.Kind, &iss.OrderId, &iss.TripId, &iss.StopId, &iss.RaisedBy, &iss.RaisedRole, &iss.Status, &dBytes, &iss.CreatedAt, &iss.ResolvedAt); err == nil {
			_ = json.Unmarshal(dBytes, &iss.Detail)
			issues = append(issues, iss)
		}
	}
	return api.ListDispatchIssues200JSONResponse(issues), nil
}

func (s *Server) AckIssue(ctx context.Context, request api.AckIssueRequestObject) (api.AckIssueResponseObject, error) {
	_, _ = s.pool.Exec(ctx, `UPDATE issues SET status = 'ack' WHERE id = $1`, request.Id)
	return api.AckIssue200JSONResponse{}, nil
}

func (s *Server) ResolveIssue(ctx context.Context, request api.ResolveIssueRequestObject) (api.ResolveIssueResponseObject, error) {
	now := s.clk.Now()
	_, _ = s.pool.Exec(ctx, `UPDATE issues SET status = 'resolved', resolved_at = $1 WHERE id = $2`, now, request.Id)
	return api.ResolveIssue200JSONResponse{}, nil
}

func (s *Server) GetWeeklyForecast(ctx context.Context, request api.GetWeeklyForecastRequestObject) (api.GetWeeklyForecastResponseObject, error) {
	return api.GetWeeklyForecast200JSONResponse{
		Depot:                request.Params.Depot,
		IsoYear:              2026,
		IsoWeek:              41,
		EstimatedReeferTrips: 18,
		EstimatedDryTrips:    35,
		BrandForecasts: []struct {
			Brand         string  `json:"brand"`
			TotalVolumeM3 float64 `json:"total_volume_m3"`
			TotalWeightKg float64 `json:"total_weight_kg"`
		}{
			{"Fresh", 240.5, 48000.0},
			{"Style", 110.0, 18500.0},
			{"Tech", 75.0, 9200.0},
		},
	}, nil
}

// -------------------------------------------------------------
// Loader Operations
// -------------------------------------------------------------

func (s *Server) ListLoaderTrips(ctx context.Context, request api.ListLoaderTripsRequestObject) (api.ListLoaderTripsResponseObject, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT t.id, t.plan_id, t.vehicle_id, t.trip_no, t.brand, t.district, t.status, t.planned_depart, t.est_km, t.est_fuel_ml, t.loaded_weight_g, t.loaded_volume_ul
		FROM trips t
		JOIN plans p ON p.id = t.plan_id
		WHERE p.depot = $1 AND p.plan_date = $2::date AND p.status = 'published'
		ORDER BY t.planned_depart ASC
	`, request.Params.Depot, request.Params.Date.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []api.Trip
	for rows.Next() {
		var t api.Trip
		var km float64
		if err := rows.Scan(&t.Id, &t.PlanId, &t.VehicleId, &t.TripNo, &t.Brand, &t.District, &t.Status, &t.PlannedDepart, &km, &t.EstFuelMl, &t.LoadedWeightG, &t.LoadedVolumeUl); err == nil {
			t.EstKm = km
			t.Minutes = struct {
				BudgetLimitMin      int `json:"budget_limit_min"`
				DepotToDistrictMin  int `json:"depot_to_district_min"`
				InterStopMin        int `json:"inter_stop_min"`
				ServiceAllowanceMin int `json:"service_allowance_min"`
				TotalTripMin        int `json:"total_trip_min"`
			}{
				BudgetLimitMin:      270,
				DepotToDistrictMin:  25,
				InterStopMin:        8,
				ServiceAllowanceMin: 15,
				TotalTripMin:        100,
			}
			t.Stops = []api.TripStop{}
			list = append(list, t)
		}
	}
	return api.ListLoaderTrips200JSONResponse(list), nil
}

func (s *Server) GetLoaderManifest(ctx context.Context, request api.GetLoaderManifestRequestObject) (api.GetLoaderManifestResponseObject, error) {
	var pID uuid.UUID
	var vID string
	var tNo, pVer int
	var status string
	err := s.pool.QueryRow(ctx, `
		SELECT t.plan_id, p.version, t.vehicle_id, t.trip_no, t.status
		FROM trips t
		JOIN plans p ON p.id = t.plan_id
		WHERE t.id = $1
	`, request.Id).Scan(&pID, &pVer, &vID, &tNo, &status)
	if err != nil {
		return nil, err
	}

	rows, err := s.pool.Query(ctx, `
		SELECT ts.id, ts.seq, o.outlet_id, o.brand, outl.dock_type
		FROM trip_stops ts
		JOIN orders o ON o.id = ts.order_id
		JOIN outlets outl ON outl.outlet_id = o.outlet_id
		WHERE ts.trip_id = $1
		ORDER BY ts.seq ASC
	`, request.Id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type stopData struct {
		stopID   uuid.UUID
		seq      int
		outletID string
		brand    string
		dockType string
	}
	var stops []stopData
	for rows.Next() {
		var sd stopData
		if err := rows.Scan(&sd.stopID, &sd.seq, &sd.outletID, &sd.brand, &sd.dockType); err == nil {
			stops = append(stops, sd)
		}
	}

	nStops := len(stops)
	var manifestStops []api.LoaderManifestStop
	for _, sd := range stops {
		reverseSeq := nStops - sd.seq + 1
		manifestStops = append(manifestStops, api.LoaderManifestStop{
			StopId:         sd.stopID,
			StopSeq:        sd.seq,
			ReverseLoadSeq: reverseSeq,
			OutletId:       sd.outletID,
			Brand:          sd.brand,
			DockType:       sd.dockType,
			Lines:          []api.OrderLine{},
		})
	}

	sort.Slice(manifestStops, func(i, j int) bool {
		return manifestStops[i].ReverseLoadSeq < manifestStops[j].ReverseLoadSeq
	})

	return api.GetLoaderManifest200JSONResponse{
		TripId:              request.Id,
		PlanId:              pID,
		PlanVersion:         pVer,
		VehicleId:           vID,
		TripNo:              tNo,
		Status:              api.TripStatus(status),
		ChangedAfterLoading: false,
		ReverseLoadStops:    manifestStops,
	}, nil
}

func (s *Server) SubmitLoadChecks(ctx context.Context, request api.SubmitLoadChecksRequestObject) (api.SubmitLoadChecksResponseObject, error) {
	u := auth.GetUser(ctx)
	byUser := uuid.MustParse("00000000-0000-0000-0000-000000000002")
	if u != nil {
		byUser = u.ID
	}

	recorded := 0
	now := s.clk.Now()

	for _, c := range request.Body.Checks {
		_, err := s.pool.Exec(ctx, `
			INSERT INTO load_checks (trip_id, stop_id, line_no, status, qty_short, note, photo_id, by_user, at, client_event_id)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			ON CONFLICT (client_event_id) DO NOTHING
		`, request.Id, c.StopId, c.LineNo, string(c.Status), c.QtyShort, c.Note, c.PhotoId, byUser, now, c.ClientEventId)
		if err == nil {
			recorded++
		}
	}

	return api.SubmitLoadChecks200JSONResponse{RecordedCount: &recorded}, nil
}

func (s *Server) AckTripChanges(ctx context.Context, request api.AckTripChangesRequestObject) (api.AckTripChangesResponseObject, error) {
	status := "acknowledged"
	return api.AckTripChanges200JSONResponse{Status: &status}, nil
}

func (s *Server) SealTrip(ctx context.Context, request api.SealTripRequestObject) (api.SealTripResponseObject, error) {
	_, err := s.pool.Exec(ctx, `UPDATE trips SET status = 'sealed' WHERE id = $1`, request.Id)
	if err != nil {
		return nil, err
	}
	tID := request.Id
	status := "sealed"
	return api.SealTrip200JSONResponse{
		TripId: &tID,
		Status: &status,
	}, nil
}

// -------------------------------------------------------------
// Driver & Sync Operations
// -------------------------------------------------------------

func (s *Server) GetDriverRun(ctx context.Context, request api.GetDriverRunRequestObject) (api.GetDriverRunResponseObject, error) {
	u := auth.GetUser(ctx)
	vehicleID := "VEH-001"
	if u != nil && u.VehicleID != nil {
		vehicleID = *u.VehicleID
	}

	demoDate := "2026-10-05"

	var pID uuid.UUID
	var pVer int
	var depot string
	err := s.pool.QueryRow(ctx, `
		SELECT id, version, depot
		FROM plans
		WHERE plan_date = $1::date AND status = 'published'
		ORDER BY version DESC
		LIMIT 1
	`, demoDate).Scan(&pID, &pVer, &depot)
	if err != nil {
		pID = uuid.New()
		pVer = 1
		depot = "Peliyagoda"
	}

	var snapshot api.DriverRunSnapshot
	snapshot.Date = openapi_types.Date{Time: mustParseDate(demoDate)}
	snapshot.Depot = depot
	snapshot.VehicleId = vehicleID
	snapshot.PlanId = pID
	snapshot.PlanVersion = pVer

	type stopType = struct {
		Brand             string             `json:"brand"`
		ContactPhone      *string            `json:"contact_phone"`
		District          string             `json:"district"`
		DockType          *string            `json:"dock_type,omitempty"`
		Eta               *time.Time         `json:"eta"`
		Lines             []api.OrderLine    `json:"lines"`
		OutletId          string             `json:"outlet_id"`
		ParkingConstraint *string            `json:"parking_constraint,omitempty"`
		ReceiptHash       string             `json:"receipt_hash"`
		ReceiptSalt       string             `json:"receipt_salt"`
		Seq               int                `json:"seq"`
		Status            api.StopStatus     `json:"status"`
		StopId            openapi_types.UUID `json:"stop_id"`
		WindowClose       string             `json:"window_close"`
		WindowOpen        string             `json:"window_open"`
	}
	type tripType = struct {
		Status api.TripStatus     `json:"status"`
		Stops  []stopType         `json:"stops"`
		TripId openapi_types.UUID `json:"trip_id"`
		TripNo int                `json:"trip_no"`
	}

	snapshot.Trips = []tripType{
		{
			TripId: uuid.New(),
			TripNo: 1,
			Status: api.TripStatusPlanned,
			Stops: []stopType{
				{
					StopId:            uuid.New(),
					Seq:               1,
					OutletId:          "OUT-FRESH-001",
					Brand:             "Fresh",
					District:          "Colombo",
					DockType:          strPtr("street"),
					ParkingConstraint: strPtr("normal"),
					WindowOpen:        "04:00:00",
					WindowClose:       "08:00:00",
					ReceiptSalt:       "9a8b7c6d5e4f3a2b",
					ReceiptHash:       "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
					Status:            api.Pending,
					Lines:             []api.OrderLine{},
				},
			},
		},
	}

	return api.GetDriverRun200JSONResponse(snapshot), nil
}

func (s *Server) SyncPush(ctx context.Context, request api.SyncPushRequestObject) (api.SyncPushResponseObject, error) {
	u := auth.GetUser(ctx)
	if u == nil {
		u = &auth.AuthUser{
			ID:        uuid.MustParse("00000000-0000-0000-0000-000000000003"),
			Email:     "driver@waypoint.local",
			Role:      auth.RoleDriver,
			VehicleID: strPtr("VEH-001"),
		}
	}

	var events []syncpkg.DeviceEventInput
	for _, e := range request.Body.Events {
		events = append(events, syncpkg.DeviceEventInput{
			EventID:         e.EventId,
			DeviceID:        e.DeviceId,
			DeviceSeq:       e.DeviceSeq,
			Type:            syncpkg.EventType(e.Type),
			StopID:          e.StopId,
			PlanVersionSeen: e.PlanVersionSeen,
			ClientTs:        e.ClientTs,
			Payload:         e.Payload,
		})
	}

	acks, err := s.syncSvc.ProcessSyncBatch(ctx, u, events)
	if err != nil {
		return nil, err
	}

	var apiAcks []api.SyncEventAck
	for _, a := range acks {
		apiAcks = append(apiAcks, api.SyncEventAck{
			EventId:        a.EventID,
			Result:         api.SyncEventAckResult(a.Result),
			RejectCode:     a.RejectCode,
			ServerTs:       a.ServerTs,
			Conflict:       &a.Conflict,
			EntityVersions: &a.EntityVersions,
		})
	}

	return api.SyncPush200JSONResponse{Acks: apiAcks}, nil
}

func (s *Server) SyncPull(ctx context.Context, request api.SyncPullRequestObject) (api.SyncPullResponseObject, error) {
	return api.SyncPull200JSONResponse{
		NextCursor: "cursor-100",
		Changes: []struct {
			Action  api.SyncPullResponseChangesAction `json:"action"`
			Entity  api.SyncPullResponseChangesEntity `json:"entity"`
			Id      string                            `json:"id"`
			Payload map[string]interface{}            `json:"payload"`
			Version int                               `json:"version"`
		}{},
	}, nil
}

func (s *Server) UploadPhoto(ctx context.Context, request api.UploadPhotoRequestObject) (api.UploadPhotoResponseObject, error) {
	u := auth.GetUser(ctx)
	uploader := uuid.MustParse("00000000-0000-0000-0000-000000000003")
	if u != nil {
		uploader = u.ID
	}

	content, err := io.ReadAll(request.Body)
	if err != nil {
		return nil, err
	}

	if len(content) > 2*1024*1024 {
		return api.UploadPhoto413ApplicationProblemPlusJSONResponse(
			problem("PAYLOAD_TOO_LARGE", "Payload Too Large", http.StatusRequestEntityTooLarge, "Photo exceeds maximum limit of 2 MB", nil),
		), nil
	}

	h := sha256.New()
	h.Write(content)
	sha := hex.EncodeToString(h.Sum(nil))

	storageKey := fmt.Sprintf("photos/%s.jpg", request.Id)
	now := s.clk.Now()

	kind := "pod"
	if request.Params.Kind != nil {
		kind = string(*request.Params.Kind)
	}

	_, _ = s.pool.Exec(ctx, `
		INSERT INTO photos (id, stop_id, kind, content_type, bytes, sha256, storage_key, uploaded_by, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (id) DO NOTHING
	`, request.Id, request.Params.StopId, kind, "image/jpeg", len(content), sha, storageKey, uploader, now)

	return api.UploadPhoto201JSONResponse{
		Id:          request.Id,
		StopId:      request.Params.StopId,
		Kind:        api.PhotoRecordKind(kind),
		ContentType: "image/jpeg",
		Bytes:       len(content),
		Sha256:      sha,
		UploadedBy:  uploader,
		CreatedAt:   now,
	}, nil
}

// -------------------------------------------------------------
// Realtime SSE Stream
// -------------------------------------------------------------

type sseStreamResponse struct {
	srv         *Server
	ctx         context.Context
	user        *auth.AuthUser
	lastEventID int64
}

func (s sseStreamResponse) VisitStreamEventsResponse(w http.ResponseWriter) error {
	s.srv.sseHub.ServeStream(w, s.ctx, s.user, s.lastEventID)
	return nil
}

func (s *Server) StreamEvents(ctx context.Context, request api.StreamEventsRequestObject) (api.StreamEventsResponseObject, error) {
	u := auth.GetUser(ctx)
	var lastID int64
	if request.Params.LastEventID != nil {
		if id, err := strconv.ParseInt(*request.Params.LastEventID, 10, 64); err == nil {
			lastID = id
		}
	}
	return sseStreamResponse{
		srv:         s,
		ctx:         ctx,
		user:        u,
		lastEventID: lastID,
	}, nil
}

// -------------------------------------------------------------
// Demo Controls
// -------------------------------------------------------------

func (s *Server) ResetDemo(ctx context.Context, request api.ResetDemoRequestObject) (api.ResetDemoResponseObject, error) {
	_ = seed.SeedDatabase(ctx, s.pool, "db/seed/data")
	st := "reset_completed"
	dDate := "2026-10-05"
	return api.ResetDemo200JSONResponse{
		Status:   &st,
		DemoDate: &dDate,
	}, nil
}

func (s *Server) SetDemoClock(ctx context.Context, request api.SetDemoClockRequestObject) (api.SetDemoClockResponseObject, error) {
	s.clk.SetSimulatedNow(request.Body.SimulatedNow)
	now := s.clk.Now()
	return api.SetDemoClock200JSONResponse{
		SimulatedNow: &now,
	}, nil
}

func (s *Server) AdvanceDemoClock(ctx context.Context, request api.AdvanceDemoClockRequestObject) (api.AdvanceDemoClockResponseObject, error) {
	s.clk.Advance(time.Duration(request.Body.Minutes) * time.Minute)
	now := s.clk.Now()
	return api.AdvanceDemoClock200JSONResponse{
		SimulatedNow: &now,
	}, nil
}

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------

func (s *Server) fetchRefData(ctx context.Context) (planning.RefData, error) {
	outlets := make(map[string]planning.OutletRef)
	oRows, err := s.pool.Query(ctx, `SELECT outlet_id, brand, district, depot, dock_type, parking_constraint, COALESCE(mall_window, ''), window_open_time::text, window_close_time::text FROM outlets`)
	if err == nil {
		for oRows.Next() {
			var o planning.OutletRef
			if err := oRows.Scan(&o.OutletID, &o.Brand, &o.District, &o.Depot, &o.DockType, &o.ParkingConstraint, &o.MallWindow, &o.WindowOpenTime, &o.WindowCloseTime); err == nil {
				outlets[o.OutletID] = o
			}
		}
		oRows.Close()
	}

	vehicles := make(map[string]planning.VehicleRef)
	vRows, err := s.pool.Query(ctx, `SELECT vehicle_id, type, temp, weight_cap_kg, volume_cap_m3, fuel_type, km_per_l, weekly_fuel_quota_l, depot FROM vehicles`)
	if err == nil {
		for vRows.Next() {
			var v planning.VehicleRef
			if err := vRows.Scan(&v.VehicleID, &v.Type, &v.Temp, &v.WeightCapKg, &v.VolumeCapM3, &v.FuelType, &v.KmPerL, &v.WeeklyFuelQuotaL, &v.Depot); err == nil {
				v.VolumeCapUl = int64(v.VolumeCapM3 * 1000000000.0)
				vehicles[v.VehicleID] = v
			}
		}
		vRows.Close()
	}

	districts := make(map[string]planning.DistrictTravelRef)
	dtRows, err := s.pool.Query(ctx, `SELECT district, depot, depot_to_district_km, depot_to_district_freeflow_min, inter_stop_km, inter_stop_freeflow_min FROM district_travel`)
	if err == nil {
		for dtRows.Next() {
			var dt planning.DistrictTravelRef
			if err := dtRows.Scan(&dt.District, &dt.Depot, &dt.DepotToDistrictKm, &dt.DepotToDistrictFreeflowMin, &dt.InterStopKm, &dt.InterStopFreeflowMin); err == nil {
				districts[fmt.Sprintf("%s:%s", dt.District, dt.Depot)] = dt
			}
		}
		dtRows.Close()
	}

	allowances := make(map[string]int)
	saRows, err := s.pool.Query(ctx, `SELECT brand, dock_type, service_allowance_min FROM service_allowance`)
	if err == nil {
		for saRows.Next() {
			var brand, dock string
			var min int
			if err := saRows.Scan(&brand, &dock, &min); err == nil {
				allowances[fmt.Sprintf("%s:%s", brand, dock)] = min
			}
		}
		saRows.Close()
	}

	avail := make(map[string]string)
	avRows, err := s.pool.Query(ctx, `SELECT vehicle_id, date::text, status FROM vehicle_availability`)
	if err == nil {
		for avRows.Next() {
			var vid, dt, st string
			if err := avRows.Scan(&vid, &dt, &st); err == nil {
				avail[fmt.Sprintf("%s:%s", vid, dt)] = st
			}
		}
		avRows.Close()
	}

	return planning.RefData{
		Outlets:             outlets,
		Vehicles:            vehicles,
		DistrictTravel:      districts,
		ServiceAllowance:    allowances,
		VehicleAvailability: avail,
	}, nil
}

func (s *Server) fetchOrdersForPlanning(ctx context.Context, depot, dateStr string) ([]planning.OrderPlanningContext, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT o.id, o.ref, o.outlet_id, o.brand, o.delivery_date::text, o.temp_requirement, o.total_units, o.total_weight_g, o.total_volume_ul,
		       COALESCE(oss.skip_streak, 0) as skip_streak
		FROM orders o
		JOIN outlets outl ON outl.outlet_id = o.outlet_id
		LEFT JOIN outlet_service_state oss ON oss.outlet_id = o.outlet_id
		WHERE outl.depot = $1 AND o.delivery_date = $2::date AND o.status IN ('queued', 'submitted')
	`, depot, dateStr)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []planning.OrderPlanningContext
	for rows.Next() {
		var ord planning.PlanOrder
		var streak int
		if err := rows.Scan(&ord.ID, &ord.Ref, &ord.OutletID, &ord.Brand, &ord.DeliveryDate, &ord.TempRequirement, &ord.TotalUnits, &ord.TotalWeightG, &ord.TotalVolumeUl, &streak); err == nil {
			result = append(result, planning.OrderPlanningContext{
				Order:               ord,
				DeferredYesterday:   streak > 0,
				DaysSinceLastServed: streak,
				WindowCloseMinutes:  8 * 60,
			})
		}
	}
	return result, nil
}

func (s *Server) fetchAPIPlan(ctx context.Context, planID uuid.UUID) (*api.Plan, error) {
	var (
		depot, planDateStr, stratStr, statusStr string
		ver                                     int
		summaryJSON                             []byte
		createdBy                               uuid.UUID
		publishedAt                             *time.Time
	)

	err := s.pool.QueryRow(ctx, `
		SELECT depot, plan_date::text, version, status, strategy, summary, created_by, published_at
		FROM plans
		WHERE id = $1
	`, planID).Scan(&depot, &planDateStr, &ver, &statusStr, &stratStr, &summaryJSON, &createdBy, &publishedAt)
	if err != nil {
		return nil, err
	}

	var summary api.PlanSummary
	_ = json.Unmarshal(summaryJSON, &summary)

	return &api.Plan{
		Id:          planID,
		Depot:       api.PlanDepot(depot),
		PlanDate:    openapi_types.Date{Time: mustParseDate(planDateStr)},
		Version:     ver,
		Status:      api.PlanStatus(statusStr),
		Strategy:    api.PlanStrategy(stratStr),
		Summary:     summary,
		CreatedBy:   createdBy,
		PublishedAt: publishedAt,
		Trips:       []api.Trip{},
		Deferrals:   []api.Deferral{},
	}, nil
}

func mustParseDate(s string) time.Time {
	t, _ := time.Parse("2006-01-02", s)
	return t
}

func hashString(s string) string {
	h := sha256.New()
	h.Write([]byte(s))
	return hex.EncodeToString(h.Sum(nil))
}

func strPtr(s string) *string {
	return &s
}

func intPtr(i int) *int {
	return &i
}

func pseudoRandomInt() int {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return int(b[0])<<24 | int(b[1])<<16 | int(b[2])<<8 | int(b[3])
}
