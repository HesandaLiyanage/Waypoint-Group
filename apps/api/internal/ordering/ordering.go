package ordering

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/clock"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/tz"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNonOperatingDay = errors.New("delivery date is not an operating day")
	ErrOrderLocked     = errors.New("order cannot be modified after 16:00 cutoff")
	ErrInvalidItem     = errors.New("catalog item not found")
	ErrInvalidPoDCode  = errors.New("invalid receipt code")
	ErrVersionConflict = errors.New("optimistic concurrency version conflict")
)

type Service struct {
	pool  *pgxpool.Pool
	clock clock.Clock
}

func NewService(pool *pgxpool.Pool, clk clock.Clock) *Service {
	return &Service{
		pool:  pool,
		clock: clk,
	}
}

type OrderItemInput struct {
	SKU string
	Qty int
}

type CreateOrderInput struct {
	ID           uuid.UUID
	OutletID     string
	DeliveryDate string // YYYY-MM-DD
	Items        []OrderItemInput
	Source       string
	CreatedBy    uuid.UUID
}

type OrderLineOutput struct {
	LineNo          int
	SKU             string
	Name            string
	Qty             int
	WeightG         int64
	VolumeUl        int64
	TempRequirement string
}

type OrderOutput struct {
	ID              uuid.UUID
	Ref             string
	OutletID        string
	Brand           string
	DeliveryDate    string
	TempRequirement string
	Status          string
	TotalUnits      int
	TotalWeightG    int64
	TotalVolumeUl   int64
	PlacedAt        time.Time
	ConfirmedAt     *time.Time
	IsLate          bool
	Source          string
	Version         int
	CreatedBy       uuid.UUID
	Lines           []OrderLineOutput
}

type enrichedItem struct {
	sku      string
	name     string
	tempReq  string
	unitWtG  int64
	unitVUl  int64
	qty      int
	weightG  int64
	volumeUl int64
}

// CreateOrder handles order submission, server-side unit/weight/volume calculation,
// multi-temp splitting for Fresh baskets, and post-16:00 cutoff detection (Section 5.2).
func (s *Service) CreateOrder(ctx context.Context, input CreateOrderInput) ([]OrderOutput, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Check if already submitted with this ID (Idempotency)
	existingOrders, err := s.getExistingOrdersByID(ctx, tx, input.ID)
	if err == nil && len(existingOrders) > 0 {
		_ = tx.Commit(ctx)
		return existingOrders, nil
	}

	// 1. Verify delivery date is operating day
	var isOperating int
	err = tx.QueryRow(ctx, `SELECT is_operating FROM calendar_days WHERE date = $1::date`, input.DeliveryDate).Scan(&isOperating)
	if err != nil || isOperating == 0 {
		return nil, ErrNonOperatingDay
	}

	// 2. Fetch outlet details
	var brand string
	err = tx.QueryRow(ctx, `SELECT brand FROM outlets WHERE outlet_id = $1`, input.OutletID).Scan(&brand)
	if err != nil {
		return nil, fmt.Errorf("outlet %s not found: %w", input.OutletID, err)
	}

	// 3. Cutoff evaluation: orders for next operating day close at 16:00 Asia/Colombo
	now := s.clock.Now()
	nowColombo := tz.InColombo(now)

	isLate := false
	deliveryT, parseErr := time.Parse("2006-01-02", input.DeliveryDate)
	if parseErr == nil {
		cutoffToday := time.Date(nowColombo.Year(), nowColombo.Month(), nowColombo.Day(), 16, 0, 0, 0, tz.Colombo)
		tomorrowDate := nowColombo.AddDate(0, 0, 1)
		// If placing for today or tomorrow and current Colombo time >= 16:00
		if (deliveryT.Before(tomorrowDate) || deliveryT.Equal(tomorrowDate)) && nowColombo.After(cutoffToday) {
			isLate = true
		}
	}

	// 4. Fetch catalog details for each item and validate brand
	var ambientItems []enrichedItem
	var chilledItems []enrichedItem

	for _, item := range input.Items {
		if item.Qty <= 0 {
			continue
		}
		var iBrand, nameEn, tempReq string
		var unitWtKg, unitVolM3 float64

		err := tx.QueryRow(ctx, `
			SELECT brand, name_en, temp_requirement, unit_weight_kg, unit_volume_m3
			FROM catalog_items
			WHERE sku = $1
		`, item.SKU).Scan(&iBrand, &nameEn, &tempReq, &unitWtKg, &unitVolM3)
		if err != nil {
			return nil, fmt.Errorf("%w: %s", ErrInvalidItem, item.SKU)
		}

		if iBrand != brand {
			return nil, fmt.Errorf("item %s brand %s does not match outlet brand %s", item.SKU, iBrand, brand)
		}

		unitWtG := int64(unitWtKg * 1000)
		unitVUl := int64(unitVolM3 * 1000000000)
		en := enrichedItem{
			sku:      item.SKU,
			name:     nameEn,
			tempReq:  tempReq,
			unitWtG:  unitWtG,
			unitVUl:  unitVUl,
			qty:      item.Qty,
			weightG:  unitWtG * int64(item.Qty),
			volumeUl: unitVUl * int64(item.Qty),
		}

		if tempReq == "chilled" {
			chilledItems = append(chilledItems, en)
		} else {
			ambientItems = append(ambientItems, en)
		}
	}

	var createdOrders []OrderOutput

	// Split logic: Fresh baskets mixing ambient and chilled are split into two orders
	if brand == "Fresh" && len(ambientItems) > 0 && len(chilledItems) > 0 {
		// Ambient Order
		ambientID := input.ID
		ordAmb, err := s.insertOrder(ctx, tx, ambientID, input.OutletID, brand, input.DeliveryDate, "ambient", ambientItems, isLate, input.Source, input.CreatedBy, nowColombo)
		if err != nil {
			return nil, err
		}
		createdOrders = append(createdOrders, *ordAmb)

		// Chilled Order (Generate second deterministic UUID based on first ID)
		chilledID := uuid.NewMD5(input.ID, []byte("chilled_split"))
		ordChilled, err := s.insertOrder(ctx, tx, chilledID, input.OutletID, brand, input.DeliveryDate, "chilled", chilledItems, isLate, input.Source, input.CreatedBy, nowColombo)
		if err != nil {
			return nil, err
		}
		createdOrders = append(createdOrders, *ordChilled)
	} else {
		// Single order
		tempReq := "ambient"
		items := ambientItems
		if len(chilledItems) > 0 {
			tempReq = "chilled"
			items = chilledItems
		}
		ord, err := s.insertOrder(ctx, tx, input.ID, input.OutletID, brand, input.DeliveryDate, tempReq, items, isLate, input.Source, input.CreatedBy, nowColombo)
		if err != nil {
			return nil, err
		}
		createdOrders = append(createdOrders, *ord)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return createdOrders, nil
}

func (s *Service) insertOrder(
	ctx context.Context,
	tx pgx.Tx,
	orderID uuid.UUID,
	outletID, brand, deliveryDate, tempReq string,
	items []enrichedItem,
	isLate bool,
	source string,
	createdBy uuid.UUID,
	now time.Time,
) (*OrderOutput, error) {

	var totalUnits int
	var totalWeightG int64
	var totalVolumeUl int64

	for _, it := range items {
		totalUnits += it.qty
		totalWeightG += it.weightG
		totalVolumeUl += it.volumeUl
	}

	// Generate human ref: ORD-YYYYMMDD-XXXX
	cleanDate := strings.ReplaceAll(deliveryDate, "-", "")
	var count int
	_ = tx.QueryRow(ctx, `SELECT count(*) FROM orders WHERE delivery_date = $1::date`, deliveryDate).Scan(&count)
	ref := fmt.Sprintf("ORD-%s-%03d", cleanDate, count+1)

	status := "queued"
	confirmedAt := now

	query := `
		INSERT INTO orders (id, ref, outlet_id, brand, delivery_date, temp_requirement, status, total_units, total_weight_g, total_volume_ul, placed_at, confirmed_at, is_late, source, version, created_by)
		VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11, $12, $13, $14, 1, $15)
		RETURNING version
	`
	var ver int
	err := tx.QueryRow(ctx, query, orderID, ref, outletID, brand, deliveryDate, tempReq, status, totalUnits, totalWeightG, totalVolumeUl, now, confirmedAt, isLate, source, createdBy).Scan(&ver)
	if err != nil {
		return nil, fmt.Errorf("failed to insert order: %w", err)
	}

	var linesOut []OrderLineOutput
	for i, it := range items {
		lineNo := i + 1
		_, err := tx.Exec(ctx, `
			INSERT INTO order_lines (order_id, line_no, sku, qty, weight_g, volume_ul)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, orderID, lineNo, it.sku, it.qty, it.weightG, it.volumeUl)
		if err != nil {
			return nil, fmt.Errorf("failed to insert order line %d: %w", lineNo, err)
		}

		linesOut = append(linesOut, OrderLineOutput{
			LineNo:          lineNo,
			SKU:             it.sku,
			Name:            it.name,
			Qty:             it.qty,
			WeightG:         it.weightG,
			VolumeUl:        it.volumeUl,
			TempRequirement: it.tempReq,
		})
	}

	return &OrderOutput{
		ID:              orderID,
		Ref:             ref,
		OutletID:        outletID,
		Brand:           brand,
		DeliveryDate:    deliveryDate,
		TempRequirement: tempReq,
		Status:          status,
		TotalUnits:      totalUnits,
		TotalWeightG:    totalWeightG,
		TotalVolumeUl:   totalVolumeUl,
		PlacedAt:        now,
		ConfirmedAt:     &confirmedAt,
		IsLate:          isLate,
		Source:          source,
		Version:         ver,
		CreatedBy:       createdBy,
		Lines:           linesOut,
	}, nil
}

func (s *Service) getExistingOrdersByID(ctx context.Context, tx pgx.Tx, orderID uuid.UUID) ([]OrderOutput, error) {
	rows, err := tx.Query(ctx, `
		SELECT id, ref, outlet_id, brand, delivery_date::text, temp_requirement, status, total_units, total_weight_g, total_volume_ul, placed_at, confirmed_at, is_late, source, version, created_by
		FROM orders
		WHERE id = $1
	`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []OrderOutput
	for rows.Next() {
		var o OrderOutput
		if err := rows.Scan(&o.ID, &o.Ref, &o.OutletID, &o.Brand, &o.DeliveryDate, &o.TempRequirement, &o.Status, &o.TotalUnits, &o.TotalWeightG, &o.TotalVolumeUl, &o.PlacedAt, &o.ConfirmedAt, &o.IsLate, &o.Source, &o.Version, &o.CreatedBy); err == nil {
			list = append(list, o)
		}
	}
	return list, nil
}

// VerifyReceiptCode checks a 6-digit PoD code against the stored HMAC hash.
func VerifyReceiptCode(codeEntered, salt, expectedHash string) bool {
	h := hmac.New(sha256.New, []byte(salt))
	h.Write([]byte(codeEntered))
	computed := hex.EncodeToString(h.Sum(nil))
	return hmac.Equal([]byte(computed), []byte(expectedHash))
}
