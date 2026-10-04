package server

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
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
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/tz"
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
	if err != nil {
		return api.AuthLogin401ApplicationProblemPlusJSONResponse(
			problem("INVALID_CREDENTIALS", "Invalid Credentials", http.StatusUnauthorized, "Invalid email or password", nil),
		), nil
	}
	if !active {
		if okPending, _ := auth.VerifyPassword(password, pwHash); okPending {
			return api.AuthLogin401ApplicationProblemPlusJSONResponse(
				problem("ACCOUNT_PENDING", "Account pending", http.StatusUnauthorized, "Your account is waiting for approval by your depot coordinator.", nil),
			), nil
		}
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
	if u == nil {
		return nil, ErrUnauthenticated
	}
	creatorID := u.ID
	// A store manager orders only for their own outlet; a dispatcher may enter phone orders for outlets of their depot.
	var outletDepot string
	if err := s.pool.QueryRow(ctx, `SELECT depot FROM outlets WHERE outlet_id=$1`, request.Body.OutletId).Scan(&outletDepot); err != nil {
		return api.CreateOrder400ApplicationProblemPlusJSONResponse(
			problem("UNKNOWN_OUTLET", "Unknown outlet", http.StatusBadRequest, "Outlet "+request.Body.OutletId+" does not exist", nil)), nil
	}
	allowed := (u.Role == auth.RoleStoreManager && u.OutletID != nil && *u.OutletID == request.Body.OutletId) ||
		(u.Role == auth.RoleDispatcher && (u.Depot == nil || *u.Depot == outletDepot))
	if !allowed {
		return nil, fmt.Errorf("%w: you may only place orders for your own outlet", ErrForbidden)
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
	u := auth.GetUser(ctx)
	if u == nil {
		return nil, ErrUnauthenticated
	}
	// A store manager may only read their own outlet's schedule.
	outletID := ""
	if u.OutletID != nil {
		outletID = *u.OutletID
	}
	if request.Params.OutletId != nil && (u.Role != auth.RoleStoreManager || *request.Params.OutletId == outletID) {
		outletID = *request.Params.OutletId
	}

	var stops []api.StoreScheduleStop
	rows, err := s.pool.Query(ctx, `
		SELECT o.id, o.ref, o.status, ts.window_open::text, ts.window_close::text, ts.eta, ''
		FROM orders o
		LEFT JOIN trip_stops ts ON ts.order_id = o.id
		LEFT JOIN stop_receipts sr ON sr.stop_id = ts.id
		WHERE o.outlet_id = $1 AND o.delivery_date = $2::date
	`, outletID, request.Params.Date.String())
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var oID uuid.UUID
			var oRef, status, wOpen, wClose, rCode string // rCode is unused: codes are shown only through the workspace
			var etaT *time.Time
			if err := rows.Scan(&oID, &oRef, &status, &wOpen, &wClose, &etaT, &rCode); err == nil {
				src := api.StoreScheduleStopEtaSource("rule")
				buf := 15
				stops = append(stops, api.StoreScheduleStop{
					OrderId:      oID,
					OrderRef:     oRef,
					Status:       api.OrderStatus(status),
					WindowOpen:   wOpen,
					WindowClose:  wClose,
					Eta:          etaT,
					EtaSource:    &src,
					EtaBufferMin: &buf,
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

	var lateCount int
	_ = s.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM orders o
		JOIN outlets outl ON outl.outlet_id = o.outlet_id
		WHERE outl.depot = $1
		  AND o.delivery_date = $2::date
		  AND o.is_late = true
	`, depot, dateStr).Scan(&lateCount)

	now := s.clk.Now()
	tag, _ := s.pool.Exec(ctx, `
		UPDATE orders o
		SET status = 'queued', confirmed_at = $3
		FROM outlets outl
		WHERE outl.outlet_id = o.outlet_id
		  AND outl.depot = $1
		  AND o.delivery_date = $2::date
		  AND o.status = 'submitted'
		  AND o.is_late = false
	`, depot, dateStr, now)

	closedCount := int(tag.RowsAffected())

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

	ref, err := s.planningRef(ctx, dateStr)
	if err != nil {
		return nil, err
	}

	ordersCtx, err := s.fetchOrdersForPlanning(ctx, depot, dateStr)
	if err != nil {
		return nil, err
	}

	fuelRemaining, err := s.fetchFuelRemaining(ctx, depot, dateStr)
	if err != nil {
		return nil, err
	}

	defFresh, err := departureOn(dateStr, s.cfg.FreshDepartDefault)
	if err != nil {
		return nil, err
	}
	defStyle, err := departureOn(dateStr, s.cfg.StyleTechDepartDefault)
	if err != nil {
		return nil, err
	}

	res, err := planning.Plan(ctx, depot, dateStr, strat, ordersCtx, ref, fuelRemaining, defFresh, defStyle, s.cfg.ReloadBufferMin, planning.WithMaxStopsPerTrip(s.cfg.MaxStopsPerTrip))
	if err != nil {
		return nil, err
	}

	planID := res.Plan.ID
	u := auth.GetUser(ctx)
	if u == nil {
		return nil, ErrUnauthenticated
	}
	creatorID := u.ID

	summaryJSON, _ := json.Marshal(res.Summary)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// A regenerated plan supersedes earlier drafts; a published plan is never replaced here.
	var published bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM plans WHERE depot=$1 AND plan_date=$2::date AND status='published')`, depot, dateStr).Scan(&published); err != nil {
		return nil, err
	}
	if published {
		return nil, errors.New("a plan is already published for this depot and date")
	}
	if _, err = tx.Exec(ctx, `UPDATE plans SET status='superseded' WHERE depot=$1 AND plan_date=$2::date AND status='draft'`, depot, dateStr); err != nil {
		return nil, err
	}
	var nextVersion int
	if err = tx.QueryRow(ctx, `SELECT COALESCE(MAX(version),0)+1 FROM plans WHERE depot=$1 AND plan_date=$2::date`, depot, dateStr).Scan(&nextVersion); err != nil {
		return nil, err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO plans (id, depot, plan_date, version, status, strategy, summary, created_by)
		VALUES ($1, $2, $3::date, $4, 'draft', $5, $6, $7)
	`, planID, depot, dateStr, nextVersion, string(strat), summaryJSON, creatorID)
	if err != nil {
		return nil, fmt.Errorf("failed to insert plan: %w", err)
	}

	baseDate, _ := time.ParseInLocation("2006-01-02", dateStr, tz.Colombo)

	for _, t := range res.Plan.Trips {
		dtKey := fmt.Sprintf("%s:%s", t.District, depot)
		dt := ref.DistrictTravel[dtKey]
		veh := ref.Vehicles[t.VehicleID]

		var serviceAllowances []int
		var stopTimingInputs []planning.StopTimingInput
		var loadedWeightG int64
		var loadedVolumeUl int64
		sumAllowance := 0

		for _, stop := range t.Stops {
			out := ref.Outlets[stop.Order.OutletID]
			saKey := fmt.Sprintf("%s:%s", stop.Order.Brand, out.DockType)
			sa := ref.ServiceAllowance[saKey]
			if sa == 0 {
				sa = 15
			}
			serviceAllowances = append(serviceAllowances, sa)
			sumAllowance += sa
			loadedWeightG += stop.Order.TotalWeightG
			loadedVolumeUl += stop.Order.TotalVolumeUl

			stopTimingInputs = append(stopTimingInputs, planning.StopTimingInput{
				Seq:                stop.Seq,
				ServiceMin:         sa,
				WindowOpenTimeStr:  out.WindowOpenTime,
				WindowCloseTimeStr: out.WindowCloseTime,
				MallWindowStr:      out.MallWindow,
			})
		}

		tripMinutes := planning.CalculateTripMinutes(dt.DepotToDistrictFreeflowMin, dt.InterStopFreeflowMin, serviceAllowances)
		estKm := planning.CalculateFuelDistanceKm(dt.DepotToDistrictKm, dt.InterStopKm, len(t.Stops))
		estFuelMl := planning.CalculateFuelUsageMl(dt.DepotToDistrictKm, dt.InterStopKm, len(t.Stops), veh.KmPerL)
		budgetLimit := 270
		if t.Brand != "Fresh" {
			budgetLimit = 480
		}

		minutesJSON, _ := json.Marshal(map[string]int{
			"depot_to_district_min":       dt.DepotToDistrictFreeflowMin,
			"inter_stop_min":              dt.InterStopFreeflowMin,
			"service_allowance_total_min": sumAllowance,
			"total_trip_min":              tripMinutes,
			"budget_limit_min":            budgetLimit,
		})

		_, err = tx.Exec(ctx, `
			INSERT INTO trips (id, plan_id, vehicle_id, trip_no, brand, district, status, planned_depart, minutes, est_km, est_fuel_ml, loaded_weight_g, loaded_volume_ul)
			VALUES ($1, $2, $3, $4, $5, $6, 'planned', $7, $8, $9, $10, $11, $12)
		`, t.ID, planID, t.VehicleID, t.TripNo, t.Brand, t.District, t.PlannedDepart, minutesJSON, estKm, estFuelMl, loadedWeightG, loadedVolumeUl)
		if err != nil {
			return nil, fmt.Errorf("failed to insert trip: %w", err)
		}

		etas, _ := planning.CalculateStopETAs(baseDate, t.PlannedDepart, dt.DepotToDistrictFreeflowMin, dt.InterStopFreeflowMin, stopTimingInputs)

		for i, stop := range t.Stops {
			out := ref.Outlets[stop.Order.OutletID]
			wOpen := out.WindowOpenTime
			if len(wOpen) == 5 {
				wOpen += ":00"
			}
			wClose := out.WindowCloseTime
			if len(wClose) == 5 {
				wClose += ":00"
			}

			var etaVal *time.Time
			var lateRisk float32
			if i < len(etas) {
				etaVal = &etas[i].ArrivalTime
				if etas[i].IsLate {
					lateRisk = 1.0
				}
			}

			_, err = tx.Exec(ctx, `
				INSERT INTO trip_stops (id, plan_id, trip_id, order_id, seq, window_open, window_close, eta, eta_source, late_risk, status)
				VALUES ($1, $2, $3, $4, $5, $6::time, $7::time, $8, 'rule', $9, 'pending')
			`, stop.ID, planID, t.ID, stop.Order.ID, stop.Seq, wOpen, wClose, etaVal, lateRisk)
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
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	for _, asgn := range request.Body.Assignments {
		switch asgn.Action {
		case "move":
			if asgn.TripId != nil {
				seq := 1
				if asgn.Seq != nil {
					seq = *asgn.Seq
				}
				_, _ = tx.Exec(ctx, `DELETE FROM deferrals WHERE plan_id = $1 AND order_id = $2`, request.Id, asgn.OrderId)
				_, _ = tx.Exec(ctx, `
					INSERT INTO trip_stops (id, plan_id, trip_id, order_id, seq, window_open, window_close, status)
					VALUES ($1, $2, $3, $4, $5, '04:00:00'::time, '08:00:00'::time, 'pending')
					ON CONFLICT (plan_id, order_id) DO UPDATE SET
						trip_id = EXCLUDED.trip_id,
						seq = EXCLUDED.seq
				`, uuid.New(), request.Id, *asgn.TripId, asgn.OrderId, seq)
			}
		case "reorder":
			if asgn.Seq != nil {
				_, _ = tx.Exec(ctx, `UPDATE trip_stops SET seq = $1 WHERE plan_id = $2 AND order_id = $3`, *asgn.Seq, request.Id, asgn.OrderId)
			}
		case "defer":
			_, _ = tx.Exec(ctx, `DELETE FROM trip_stops WHERE plan_id = $1 AND order_id = $2`, request.Id, asgn.OrderId)
			reason := "MANUAL"
			if asgn.OverrideReason != nil && *asgn.OverrideReason != "" {
				reason = *asgn.OverrideReason
			}
			explJSON, _ := json.Marshal(map[string]interface{}{"note": reason, "manual": true})
			_, _ = tx.Exec(ctx, `
				INSERT INTO deferrals (plan_id, order_id, reason_code, reason_params, explanation, decided_by, carried_to)
				VALUES ($1, $2, 'MANUAL', '{}'::jsonb, $3, 'dispatcher', CURRENT_DATE + INTERVAL '1 day')
				ON CONFLICT DO NOTHING
			`, request.Id, asgn.OrderId, explJSON)
		case "unassign":
			_, _ = tx.Exec(ctx, `DELETE FROM trip_stops WHERE plan_id = $1 AND order_id = $2`, request.Id, asgn.OrderId)
		}
	}

	_, _ = tx.Exec(ctx, `UPDATE plans SET version = version + 1 WHERE id = $1`, request.Id)

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	apiPlan, err := s.fetchAPIPlan(ctx, request.Id)
	if err != nil {
		return nil, err
	}

	planData, err := s.loadPlanDataFromDB(ctx, request.Id)
	if err != nil {
		return nil, err
	}
	ref, _ := s.fetchRefData(ctx)
	fuelRemaining, _ := s.fetchFuelRemaining(ctx, planData.Depot, planData.PlanDate)
	violations := planning.Validate(planData, ref, fuelRemaining)
	hardCount := 0
	var apiViolations []api.PlanViolation
	for _, v := range violations {
		if v.Severity == planning.SeverityHard {
			hardCount++
		}
		var pMap *map[string]interface{}
		if len(v.Params) > 0 {
			pMap = &v.Params
		}
		apiViolations = append(apiViolations, api.PlanViolation{
			Severity:  api.PlanViolationSeverity(v.Severity),
			Code:      api.PlanViolationCode(v.Code),
			Message:   v.Message,
			TripId:    v.TripID,
			OrderId:   v.OrderID,
			VehicleId: v.VehicleID,
			Params:    pMap,
		})
	}

	return api.UpdatePlanAssignments200JSONResponse{
		Body: struct {
			Plan       api.Plan                  `json:"plan"`
			Validation api.PlanValidationResult `json:"validation"`
		}{
			Plan: *apiPlan,
			Validation: api.PlanValidationResult{
				IsValid:             hardCount == 0,
				HardViolationsCount: hardCount,
				Violations:          apiViolations,
			},
		},
		Headers: api.UpdatePlanAssignments200ResponseHeaders{
			ETag: fmt.Sprintf(`W/"%d"`, apiPlan.Version),
		},
	}, nil
}

func (s *Server) ValidatePlan(ctx context.Context, request api.ValidatePlanRequestObject) (api.ValidatePlanResponseObject, error) {
	planData, err := s.loadPlanDataFromDB(ctx, request.Id)
	if err != nil {
		return nil, err
	}

	ref, err := s.fetchRefData(ctx)
	if err != nil {
		return nil, err
	}

	fuelRemaining, err := s.fetchFuelRemaining(ctx, planData.Depot, planData.PlanDate)
	if err != nil {
		return nil, err
	}

	violations := planning.Validate(planData, ref, fuelRemaining)
	hardCount := 0
	var apiViolations []api.PlanViolation
	for _, v := range violations {
		if v.Severity == planning.SeverityHard {
			hardCount++
		}
		var pMap *map[string]interface{}
		if len(v.Params) > 0 {
			pMap = &v.Params
		}
		apiViolations = append(apiViolations, api.PlanViolation{
			Severity:  api.PlanViolationSeverity(v.Severity),
			Code:      api.PlanViolationCode(v.Code),
			Message:   v.Message,
			TripId:    v.TripID,
			OrderId:   v.OrderID,
			VehicleId: v.VehicleID,
			Params:    pMap,
		})
	}

	return api.ValidatePlan200JSONResponse{
		IsValid:             hardCount == 0,
		HardViolationsCount: hardCount,
		Violations:          apiViolations,
	}, nil
}

func (s *Server) PublishPlan(ctx context.Context, request api.PublishPlanRequestObject) (api.PublishPlanResponseObject, error) {
	if planData, err := s.loadPlanDataFromDB(ctx, request.Id); err == nil {
		if ref, err := s.planningRef(ctx, planData.PlanDate); err == nil {
			fuel, _ := s.fetchFuelRemaining(ctx, planData.Depot, planData.PlanDate)
			var hard []string
			for _, v := range planning.Validate(planData, ref, fuel) {
				if v.Severity == planning.SeverityHard {
					hard = append(hard, v.Message)
				}
			}
			if len(hard) > 0 {
				return api.PublishPlan422ApplicationProblemPlusJSONResponse(
					problem("PLAN_INVALID", "Plan violates operating constraints", http.StatusUnprocessableEntity,
						fmt.Sprintf("%d hard violation(s): %s", len(hard), hard[0]), nil)), nil
			}
		}
	}
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

	// Update trips status to 'planned'
	_, _ = tx.Exec(ctx, `UPDATE trips SET status = 'planned' WHERE plan_id = $1`, request.Id)

	// Update orders in trip stops to 'planned'
	_, _ = tx.Exec(ctx, `
		UPDATE orders SET status = 'planned'
		WHERE id IN (SELECT order_id FROM trip_stops WHERE plan_id = $1)
	`, request.Id)

	// Update deferred orders to 'deferred'
	_, _ = tx.Exec(ctx, `
		UPDATE orders SET status = 'deferred'
		WHERE id IN (SELECT order_id FROM deferrals WHERE plan_id = $1)
	`, request.Id)

	// Update outlet_service_state
	_, _ = tx.Exec(ctx, `
		INSERT INTO outlet_service_state (outlet_id, last_served_date, skip_streak)
		SELECT DISTINCT o.outlet_id, $2::date, 0
		FROM trip_stops ts
		JOIN orders o ON o.id = ts.order_id
		WHERE ts.plan_id = $1
		ON CONFLICT (outlet_id) DO UPDATE SET
			last_served_date = EXCLUDED.last_served_date,
			skip_streak = 0
	`, request.Id, planDate)

	_, _ = tx.Exec(ctx, `
		INSERT INTO outlet_service_state (outlet_id, skip_streak)
		SELECT DISTINCT o.outlet_id, 1
		FROM deferrals d
		JOIN orders o ON o.id = d.order_id
		WHERE d.plan_id = $1
		ON CONFLICT (outlet_id) DO UPDATE SET
			skip_streak = outlet_service_state.skip_streak + 1
	`, request.Id)

	// Reserve fuel in fuel_ledger for each trip
	pDateT, _ := time.ParseInLocation("2006-01-02", planDate, tz.Colombo)
	isoY, isoW := pDateT.ISOWeek()
	_, _ = tx.Exec(ctx, `
		INSERT INTO fuel_ledger (vehicle_id, iso_year, iso_week, trip_id, liters_ml, kind)
		SELECT vehicle_id, $2, $3, id, est_fuel_ml, 'reserve'
		FROM trips
		WHERE plan_id = $1
	`, request.Id, isoY, isoW)

	// Receipt codes are issued by the store manager on arrival (workflow command receipt_code), never at publish.

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
	var ref, status string
	err := s.pool.QueryRow(ctx, `SELECT ref, status FROM orders WHERE id = $1`, request.OrderId).Scan(&ref, &status)
	if err != nil {
		return nil, err
	}

	var rCode string
	var rParams, expl []byte
	err = s.pool.QueryRow(ctx, `
		SELECT reason_code, reason_params, explanation
		FROM deferrals
		WHERE order_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`, request.OrderId).Scan(&rCode, &rParams, &expl)

	if err == nil {
		var explMap map[string]interface{}
		_ = json.Unmarshal(expl, &explMap)
		binding := rCode
		return api.ExplainOrderPlacement200JSONResponse{
			OrderId:             request.OrderId,
			OrderRef:            ref,
			Status:              "deferred",
			BindingConstraint:   &binding,
			CandidatesEvaluated: intPtr(len(explMap)),
			Trace: []map[string]interface{}{
				{"step": 1, "action": "evaluated_open_trips", "result": "no_fit"},
				{"step": 2, "action": "evaluated_fleet_capacity", "binding": rCode, "details": explMap},
			},
		}, nil
	}

	statusVal := api.OrderExplanationStatusServed
	if status == "deferred" {
		statusVal = api.OrderExplanationStatusDeferred
	}

	return api.ExplainOrderPlacement200JSONResponse{
		OrderId:             request.OrderId,
		OrderRef:            ref,
		Status:              statusVal,
		BindingConstraint:   nil,
		CandidatesEvaluated: intPtr(1),
		Trace: []map[string]interface{}{
			{"step": 1, "action": "allocated", "status": status},
		},
	}, nil
}

func (s *Server) GetDispatchProgress(ctx context.Context, request api.GetDispatchProgressRequestObject) (api.GetDispatchProgressResponseObject, error) {
	depot := request.Params.Depot
	dateStr := request.Params.Date.String()

	var totalTrips, departedTrips, completedTrips, totalStops, deliveredStops int
	err := s.pool.QueryRow(ctx, `
		SELECT
			COUNT(DISTINCT t.id) as total_trips,
			COUNT(DISTINCT CASE WHEN t.status IN ('departed', 'completed') THEN t.id END) as departed_trips,
			COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_trips,
			COUNT(ts.id) as total_stops,
			COUNT(CASE WHEN ts.status IN ('delivered', 'delivered_short', 'receipt_confirmed') THEN ts.id END) as delivered_stops
		FROM plans p
		JOIN trips t ON t.plan_id = p.id
		LEFT JOIN trip_stops ts ON ts.trip_id = t.id
		WHERE p.depot = $1 AND p.plan_date = $2::date AND p.status = 'published'
	`, depot, dateStr).Scan(&totalTrips, &departedTrips, &completedTrips, &totalStops, &deliveredStops)

	pct := float64(0)
	if err == nil && totalStops > 0 {
		pct = float64(deliveredStops) / float64(totalStops) * 100.0
	}

	return api.GetDispatchProgress200JSONResponse{
		Depot:          depot,
		Date:           request.Params.Date,
		TotalTrips:     totalTrips,
		DepartedTrips:  departedTrips,
		CompletedTrips: completedTrips,
		TotalStops:     totalStops,
		DeliveredStops: deliveredStops,
		CompletionPct:  pct,
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
	depot := request.Params.Depot
	year, week := s.clk.Now().ISOWeek()

	var opDays int
	var maxRamp float64
	var hasPayday, hasMonsoon int
	_ = s.pool.QueryRow(ctx, `
		SELECT COUNT(*), COALESCE(MAX(festival_ramp), 0), COALESCE(MAX(is_payday), 0), COALESCE(MAX(monsoon), 0)
		FROM calendar_days
		WHERE iso_year = $1 AND iso_week = $2 AND is_operating = 1
	`, year, week).Scan(&opDays, &maxRamp, &hasPayday, &hasMonsoon)

	if opDays == 0 {
		opDays = 6
	}

	surge := 1.0
	if hasPayday == 1 {
		surge += 0.20
	}
	if maxRamp > 0 {
		surge += maxRamp * 0.35
	}

	var freshCount, styleCount, techCount int
	_ = s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM outlets WHERE depot = $1 AND brand = 'Fresh'`, depot).Scan(&freshCount)
	_ = s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM outlets WHERE depot = $1 AND brand = 'Style'`, depot).Scan(&styleCount)
	_ = s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM outlets WHERE depot = $1 AND brand = 'Tech'`, depot).Scan(&techCount)

	freshVol := float64(freshCount*opDays) * 0.6 * surge
	freshWt := float64(freshCount*opDays) * 120.0 * surge
	styleVol := float64(styleCount) * 4.5 * surge
	styleWt := float64(styleCount) * 750.0 * surge
	techVol := float64(techCount) * 5.0 * surge
	techWt := float64(techCount) * 600.0 * surge

	reeferTrips := int(math.Ceil(freshVol * 0.45 / 15.0))
	dryTrips := int(math.Ceil((freshVol*0.55 + styleVol + techVol) / 20.0))

	return api.GetWeeklyForecast200JSONResponse{
		Depot:                depot,
		IsoYear:              year,
		IsoWeek:              week,
		EstimatedReeferTrips: reeferTrips,
		EstimatedDryTrips:    dryTrips,
		BrandForecasts: []struct {
			Brand         string  `json:"brand"`
			TotalVolumeM3 float64 `json:"total_volume_m3"`
			TotalWeightKg float64 `json:"total_weight_kg"`
		}{
			{"Fresh", math.Round(freshVol*10) / 10, math.Round(freshWt*10) / 10},
			{"Style", math.Round(styleVol*10) / 10, math.Round(styleWt*10) / 10},
			{"Tech", math.Round(techVol*10) / 10, math.Round(techWt*10) / 10},
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
		SELECT ts.id, ts.seq, o.id, o.outlet_id, o.brand, outl.dock_type
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
		orderID  uuid.UUID
		outletID string
		brand    string
		dockType string
	}
	var stops []stopData
	for rows.Next() {
		var sd stopData
		if err := rows.Scan(&sd.stopID, &sd.seq, &sd.orderID, &sd.outletID, &sd.brand, &sd.dockType); err == nil {
			stops = append(stops, sd)
		}
	}

	nStops := len(stops)
	var manifestStops []api.LoaderManifestStop
	for _, sd := range stops {
		reverseSeq := nStops - sd.seq + 1

		var lines []api.OrderLine
		lRows, err := s.pool.Query(ctx, `
			SELECT ol.line_no, ol.sku, ci.name_en, ol.qty, ol.weight_g, ol.volume_ul, ci.temp_requirement
			FROM order_lines ol
			JOIN catalog_items ci ON ci.sku = ol.sku
			WHERE ol.order_id = $1
			ORDER BY ol.line_no ASC
		`, sd.orderID)
		if err == nil {
			for lRows.Next() {
				var ln api.OrderLine
				var tReq string
				if err := lRows.Scan(&ln.LineNo, &ln.Sku, &ln.Name, &ln.Qty, &ln.WeightG, &ln.VolumeUl, &tReq); err == nil {
					ln.TempRequirement = api.OrderLineTempRequirement(tReq)
					lines = append(lines, ln)
				}
			}
			lRows.Close()
		}

		manifestStops = append(manifestStops, api.LoaderManifestStop{
			StopId:         sd.stopID,
			StopSeq:        sd.seq,
			ReverseLoadSeq: reverseSeq,
			OutletId:       sd.outletID,
			Brand:          sd.brand,
			DockType:       sd.dockType,
			Lines:          lines,
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
		ChangedAfterLoading: pVer > 1,
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
	if u == nil || u.VehicleID == nil {
		return nil, fmt.Errorf("%w: a driver session bound to a vehicle is required", ErrForbidden)
	}
	vehicleID := *u.VehicleID

	dateStr := s.clk.Now().Format("2006-01-02")

	var pID uuid.UUID
	var pVer int
	var depot string
	err := s.pool.QueryRow(ctx, `
		SELECT p.id, p.version, p.depot
		FROM trips t
		JOIN plans p ON p.id = t.plan_id
		WHERE t.vehicle_id = $1 AND p.plan_date = $2::date AND p.status = 'published'
		ORDER BY p.version DESC
		LIMIT 1
	`, vehicleID, dateStr).Scan(&pID, &pVer, &depot)
	if err != nil {
		err = s.pool.QueryRow(ctx, `
			SELECT id, version, depot
			FROM plans
			WHERE plan_date = $1::date AND status = 'published'
			ORDER BY version DESC
			LIMIT 1
		`, dateStr).Scan(&pID, &pVer, &depot)
		if err != nil {
			pID = uuid.New()
			pVer = 1
			depot = "Peliyagoda"
		}
	}

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

	var trips []tripType
	tRows, err := s.pool.Query(ctx, `
		SELECT t.id, t.trip_no, t.status
		FROM trips t
		JOIN plans p ON p.id = t.plan_id
		WHERE t.vehicle_id = $1 AND p.id = $2
		ORDER BY t.trip_no ASC
	`, vehicleID, pID)

	if err == nil {
		defer tRows.Close()
		for tRows.Next() {
			var tr tripType
			var tStatus string
			if err := tRows.Scan(&tr.TripId, &tr.TripNo, &tStatus); err == nil {
				tr.Status = api.TripStatus(tStatus)
				trips = append(trips, tr)
			}
		}
	}

	for i := range trips {
		tID := trips[i].TripId
		sRows, err := s.pool.Query(ctx, `
			SELECT ts.id, ts.seq, o.id, o.outlet_id, o.brand, outl.district, outl.dock_type, outl.parking_constraint,
			       ts.window_open::text, ts.window_close::text, ts.eta, ts.status,
			       COALESCE(sr.code_salt, ''), COALESCE(sr.code_hash, '')
			FROM trip_stops ts
			JOIN orders o ON o.id = ts.order_id
			JOIN outlets outl ON outl.outlet_id = o.outlet_id
			LEFT JOIN stop_receipts sr ON sr.stop_id = ts.id
			WHERE ts.trip_id = $1
			ORDER BY ts.seq ASC
		`, tID)
		if err == nil {
			var stops []stopType
			for sRows.Next() {
				var st stopType
				var oID uuid.UUID
				var dock, park string
				var statusStr string
				if err := sRows.Scan(&st.StopId, &st.Seq, &oID, &st.OutletId, &st.Brand, &st.District,
					&dock, &park, &st.WindowOpen, &st.WindowClose, &st.Eta, &statusStr, &st.ReceiptSalt, &st.ReceiptHash); err == nil {
					st.DockType = &dock
					st.ParkingConstraint = &park
					st.Status = api.StopStatus(statusStr)

					lRows, err := s.pool.Query(ctx, `
						SELECT ol.line_no, ol.sku, ci.name_en, ol.qty, ol.weight_g, ol.volume_ul, ci.temp_requirement
						FROM order_lines ol
						JOIN catalog_items ci ON ci.sku = ol.sku
						WHERE ol.order_id = $1
						ORDER BY ol.line_no ASC
					`, oID)
					if err == nil {
						var lines []api.OrderLine
						for lRows.Next() {
							var ln api.OrderLine
							var tReq string
							if err := lRows.Scan(&ln.LineNo, &ln.Sku, &ln.Name, &ln.Qty, &ln.WeightG, &ln.VolumeUl, &tReq); err == nil {
								ln.TempRequirement = api.OrderLineTempRequirement(tReq)
								lines = append(lines, ln)
							}
						}
						lRows.Close()
						st.Lines = lines
					} else {
						st.Lines = []api.OrderLine{}
					}

					stops = append(stops, st)
				}
			}
			sRows.Close()
			trips[i].Stops = stops
		}
	}

	var snapshot api.DriverRunSnapshot
	snapshot.Date = openapi_types.Date{Time: mustParseDate(dateStr)}
	snapshot.Depot = depot
	snapshot.VehicleId = vehicleID
	snapshot.PlanId = pID
	snapshot.PlanVersion = pVer
	snapshot.Trips = trips

	return api.GetDriverRun200JSONResponse(snapshot), nil
}

func (s *Server) SyncPush(ctx context.Context, request api.SyncPushRequestObject) (api.SyncPushResponseObject, error) {
	u := auth.GetUser(ctx)
	if u == nil {
		return nil, ErrUnauthenticated
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
	cursorSeq := int64(0)
	if request.Params.Cursor != nil && *request.Params.Cursor != "" {
		if parsed, err := strconv.ParseInt(*request.Params.Cursor, 10, 64); err == nil {
			cursorSeq = parsed
		}
	}

	rows, err := s.pool.Query(ctx, `
		SELECT seq, type, payload
		FROM event_feed
		WHERE seq > $1
		ORDER BY seq ASC
		LIMIT 100
	`, cursorSeq)

	type changeItem = struct {
		Action  api.SyncPullResponseChangesAction `json:"action"`
		Entity  api.SyncPullResponseChangesEntity `json:"entity"`
		Id      string                            `json:"id"`
		Payload map[string]interface{}            `json:"payload"`
		Version int                               `json:"version"`
	}

	var changes []changeItem
	maxSeq := cursorSeq

	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var seq int64
			var typ string
			var pBytes []byte
			if err := rows.Scan(&seq, &typ, &pBytes); err == nil {
				maxSeq = seq
				var payload map[string]interface{}
				_ = json.Unmarshal(pBytes, &payload)
				changes = append(changes, changeItem{
					Action:  api.Upsert,
					Entity:  api.SyncPullResponseChangesEntity(typ),
					Id:      fmt.Sprintf("%d", seq),
					Payload: payload,
					Version: int(seq),
				})
			}
		}
	}

	return api.SyncPull200JSONResponse{
		NextCursor: fmt.Sprintf("%d", maxSeq),
		Changes:    changes,
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
		WHERE outl.depot = $1 AND o.delivery_date = $2::date AND o.status IN ('queued', 'submitted') AND o.is_late = false
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

func (s *Server) fetchFuelRemaining(ctx context.Context, depot, planDateStr string) (map[string]int64, error) {
	t, err := time.ParseInLocation("2006-01-02", planDateStr, tz.Colombo)
	if err != nil {
		return nil, err
	}
	y, w := t.ISOWeek()

	fuelRemaining := make(map[string]int64)
	rows, err := s.pool.Query(ctx, `SELECT vehicle_id, weekly_fuel_quota_l FROM vehicles WHERE depot = $1`, depot)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var vID string
		var quotaL float64
		if err := rows.Scan(&vID, &quotaL); err == nil {
			fuelRemaining[vID] = int64(quotaL * 1000.0)
		}
	}

	ledRows, err := s.pool.Query(ctx, `
		SELECT vehicle_id, COALESCE(SUM(CASE WHEN kind = 'reserve' THEN liters_ml ELSE -liters_ml END), 0)
		FROM fuel_ledger
		WHERE iso_year = $1 AND iso_week = $2
		GROUP BY vehicle_id
	`, y, w)
	if err == nil {
		defer ledRows.Close()
		for ledRows.Next() {
			var vID string
			var usedMl int64
			if err := ledRows.Scan(&vID, &usedMl); err == nil {
				if rem, ok := fuelRemaining[vID]; ok {
					fuelRemaining[vID] = rem - usedMl
				}
			}
		}
	}

	return fuelRemaining, nil
}

func (s *Server) loadPlanDataFromDB(ctx context.Context, planID uuid.UUID) (*planning.PlanData, error) {
	var depot, planDateStr string
	err := s.pool.QueryRow(ctx, `SELECT depot, plan_date::text FROM plans WHERE id = $1`, planID).Scan(&depot, &planDateStr)
	if err != nil {
		return nil, err
	}

	planData := &planning.PlanData{
		ID:        planID,
		Depot:     depot,
		PlanDate:  planDateStr,
		Trips:     []planning.PlanTrip{},
		Deferrals: []planning.PlanOrder{},
	}

	tripRows, err := s.pool.Query(ctx, `
		SELECT id, vehicle_id, trip_no, brand, district, planned_depart
		FROM trips
		WHERE plan_id = $1
		ORDER BY trip_no ASC
	`, planID)
	if err == nil {
		defer tripRows.Close()
		for tripRows.Next() {
			var pt planning.PlanTrip
			if err := tripRows.Scan(&pt.ID, &pt.VehicleID, &pt.TripNo, &pt.Brand, &pt.District, &pt.PlannedDepart); err == nil {
				planData.Trips = append(planData.Trips, pt)
			}
		}
	}

	for i := range planData.Trips {
		tID := planData.Trips[i].ID
		stopRows, err := s.pool.Query(ctx, `
			SELECT ts.id, ts.seq, o.id, o.ref, o.outlet_id, o.brand, o.delivery_date::text, o.temp_requirement,
			       o.total_units, o.total_weight_g, o.total_volume_ul
			FROM trip_stops ts
			JOIN orders o ON o.id = ts.order_id
			WHERE ts.trip_id = $1
			ORDER BY ts.seq ASC
		`, tID)
		if err == nil {
			var stops []planning.PlanStop
			for stopRows.Next() {
				var ps planning.PlanStop
				ps.TripID = tID
				if err := stopRows.Scan(&ps.ID, &ps.Seq, &ps.Order.ID, &ps.Order.Ref, &ps.Order.OutletID, &ps.Order.Brand,
					&ps.Order.DeliveryDate, &ps.Order.TempRequirement, &ps.Order.TotalUnits, &ps.Order.TotalWeightG, &ps.Order.TotalVolumeUl); err == nil {
					stops = append(stops, ps)
				}
			}
			stopRows.Close()
			planData.Trips[i].Stops = stops
		}
	}

	defRows, err := s.pool.Query(ctx, `
		SELECT o.id, o.ref, o.outlet_id, o.brand, o.delivery_date::text, o.temp_requirement,
		       o.total_units, o.total_weight_g, o.total_volume_ul
		FROM deferrals d
		JOIN orders o ON o.id = d.order_id
		WHERE d.plan_id = $1
	`, planID)
	if err == nil {
		defer defRows.Close()
		for defRows.Next() {
			var po planning.PlanOrder
			if err := defRows.Scan(&po.ID, &po.Ref, &po.OutletID, &po.Brand, &po.DeliveryDate, &po.TempRequirement,
				&po.TotalUnits, &po.TotalWeightG, &po.TotalVolumeUl); err == nil {
				planData.Deferrals = append(planData.Deferrals, po)
			}
		}
	}

	return planData, nil
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

	tripRows, err := s.pool.Query(ctx, `
		SELECT t.id, t.vehicle_id, t.trip_no, t.brand, t.district, t.status, t.planned_depart,
		       t.minutes, t.est_km, t.est_fuel_ml, t.loaded_weight_g, t.loaded_volume_ul,
		       v.type, v.temp
		FROM trips t
		JOIN vehicles v ON v.vehicle_id = t.vehicle_id
		WHERE t.plan_id = $1
		ORDER BY t.vehicle_id ASC, t.trip_no ASC
	`, planID)

	var trips []api.Trip
	if err == nil {
		defer tripRows.Close()
		for tripRows.Next() {
			var t api.Trip
			var tNo int
			var minutesJSON []byte
			var vType, vTemp string
			var km float64
			if err := tripRows.Scan(&t.Id, &t.VehicleId, &tNo, &t.Brand, &t.District, &t.Status, &t.PlannedDepart,
				&minutesJSON, &km, &t.EstFuelMl, &t.LoadedWeightG, &t.LoadedVolumeUl, &vType, &vTemp); err == nil {
				t.PlanId = planID
				t.TripNo = api.TripTripNo(tNo)
				t.EstKm = km
				vt := api.TripVehicleType(vType)
				vtm := api.TripVehicleTemp(vTemp)
				t.VehicleType = &vt
				t.VehicleTemp = &vtm
				_ = json.Unmarshal(minutesJSON, &t.Minutes)
				trips = append(trips, t)
			}
		}
	}

	for i := range trips {
		tripID := trips[i].Id
		stopRows, err := s.pool.Query(ctx, `
			SELECT ts.id, ts.seq, ts.order_id, o.ref, o.outlet_id, o.brand,
			       ts.window_open::text, ts.window_close::text, ts.eta, ts.eta_source, ts.late_risk, ts.status
			FROM trip_stops ts
			JOIN orders o ON o.id = ts.order_id
			WHERE ts.trip_id = $1
			ORDER BY ts.seq ASC
		`, tripID)
		if err == nil {
			var stops []api.TripStop
			for stopRows.Next() {
				var st api.TripStop
				var etaSrc *string
				if err := stopRows.Scan(&st.Id, &st.Seq, &st.OrderId, &st.OrderRef, &st.OutletId, &st.Brand,
					&st.WindowOpen, &st.WindowClose, &st.Eta, &etaSrc, &st.LateRisk, &st.Status); err == nil {
					st.PlanId = planID
					st.TripId = tripID
					if etaSrc != nil {
						es := api.TripStopEtaSource(*etaSrc)
						st.EtaSource = &es
					}
					stops = append(stops, st)
				}
			}
			stopRows.Close()
			trips[i].Stops = stops
		}
	}

	defRows, err := s.pool.Query(ctx, `
		SELECT d.id, d.order_id, o.ref, o.outlet_id, o.brand, d.reason_code, d.reason_params, d.explanation,
		       d.decided_by, d.carried_to::text, d.created_at
		FROM deferrals d
		JOIN orders o ON o.id = d.order_id
		WHERE d.plan_id = $1
		ORDER BY d.created_at ASC
	`, planID)

	var deferrals []api.Deferral
	if err == nil {
		defer defRows.Close()
		for defRows.Next() {
			var def api.Deferral
			var rCode, cToStr string
			var rParams, expl []byte
			if err := defRows.Scan(&def.Id, &def.OrderId, &def.OrderRef, &def.OutletId, &def.Brand,
				&rCode, &rParams, &expl, &def.DecidedBy, &cToStr, &def.CreatedAt); err == nil {
				def.PlanId = planID
				def.ReasonCode = api.DeferralReasonCode(rCode)
				def.CarriedTo = openapi_types.Date{Time: mustParseDate(cToStr)}
				_ = json.Unmarshal(rParams, &def.ReasonParams)
				_ = json.Unmarshal(expl, &def.Explanation)
				deferrals = append(deferrals, def)
			}
		}
	}

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
		Trips:       trips,
		Deferrals:   deferrals,
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

// departureOn anchors a configured HH:MM departure to the plan date in Colombo business time.
func departureOn(date, hhmm string) (time.Time, error) {
	t, err := time.ParseInLocation("2006-01-02 15:04", date+" "+hhmm, tz.Colombo)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid departure %q on %s: %w", hhmm, date, err)
	}
	return t, nil
}

// planningRef loads reference data and applies the monsoon travel buffer (ASM-HK-01) for the plan date.
func (s *Server) planningRef(ctx context.Context, dateStr string) (planning.RefData, error) {
	ref, err := s.fetchRefData(ctx)
	if err != nil {
		return ref, err
	}
	var monsoon int
	_ = s.pool.QueryRow(ctx, `SELECT monsoon FROM calendar_days WHERE date = $1::date`, dateStr).Scan(&monsoon)
	if monsoon == 1 {
		for k, dt := range ref.DistrictTravel {
			dt.DepotToDistrictFreeflowMin = int(math.Round(float64(dt.DepotToDistrictFreeflowMin) * s.cfg.MonsoonTravelFactor))
			dt.InterStopFreeflowMin = int(math.Round(float64(dt.InterStopFreeflowMin) * s.cfg.MonsoonTravelFactor))
			ref.DistrictTravel[k] = dt
		}
	}
	return ref, nil
}

// Sentinel errors mapped to HTTP statuses by the response error handler.
var (
	ErrUnauthenticated = errors.New("authentication required")
	ErrForbidden       = errors.New("forbidden")
)
