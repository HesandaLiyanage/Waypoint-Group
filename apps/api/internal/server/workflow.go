package server

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/ordering"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/auth"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/tz"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type WorkflowCommand struct {
	ID          uuid.UUID     `json:"id"`
	Action      string        `json:"action"`
	TripID      string        `json:"trip_id"`
	StopID      string        `json:"stop_id"`
	OrderID     string        `json:"order_id"`
	IssueID     string        `json:"issue_id"`
	PlanVersion int           `json:"plan_version"`
	LineNo      int           `json:"line_no"`
	Quantity    int           `json:"quantity"`
	Status      string        `json:"status"`
	Note        string        `json:"note"`
	Date        string        `json:"date"`
	Depot       string        `json:"depot"`
	Recipient   string        `json:"recipient"`
	Code        string        `json:"code"`
	Lines       []ReceiptLine `json:"lines"`
	Photo       string        `json:"photo"`
	UserID      string        `json:"user_id"`
	VehicleID   string        `json:"vehicle_id"`
	ClientAt    string        `json:"client_at"`
}
type ReceiptLine struct {
	LineNo   int `json:"line_no"`
	Received int `json:"received_qty"`
}

// codeError marks a wrong receipt code so the attempt can be counted after the transaction rolls back.
type codeError struct{ stopID string }

func (e *codeError) Error() string { return "Invalid four-digit receipt code" }

func respond(w http.ResponseWriter, status int, value interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func failure(w http.ResponseWriter, err error) {
	respond(w, 409, map[string]string{"detail": err.Error()})
}

// RegisterWorkflow mounts the persisted cross-role workflow alongside generated contracts.
func (s *Server) RegisterWorkflow(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/workspace", s.workspace)
	mux.HandleFunc("POST /api/v1/workflow/commands", s.workflowCommand)
	s.registerPublicAuth(mux)
}

func (s *Server) workspace(w http.ResponseWriter, r *http.Request) {
	u := auth.GetUser(r.Context())
	if u == nil {
		respond(w, 401, map[string]string{"detail": "Sign in required"})
		return
	}
	ctx := r.Context()
	result := map[string]interface{}{"server_time": s.clk.Now()}
	queries := map[string]string{
		"outlets":  `SELECT o.* FROM outlets o WHERE $1='dispatcher' OR ($1='store_manager' AND o.outlet_id=$3) OR ($1 IN ('loader','driver') AND o.depot=$2)`,
		"vehicles": `SELECT v.* FROM vehicles v WHERE $1='dispatcher' OR ($1='driver' AND v.vehicle_id=$4) OR ($1='loader' AND v.depot=$2)`,
		"calendar": `SELECT * FROM calendar_days ORDER BY date`,
		"catalog":  `SELECT * FROM catalog_items`,
		"orders":   `SELECT o.* FROM orders o JOIN outlets a USING(outlet_id) WHERE ($1='dispatcher' AND ($2='' OR a.depot=$2)) OR ($1='store_manager' AND o.outlet_id=$3) OR ($1='loader' AND a.depot=$2) OR ($1='driver' AND EXISTS(SELECT 1 FROM trip_stops st JOIN trips t ON t.id=st.trip_id WHERE st.order_id=o.id AND t.vehicle_id=$4)) ORDER BY o.placed_at DESC`,
		"plans":    `SELECT p.* FROM plans p WHERE ($1 IN ('dispatcher','loader') AND ($2='' OR p.depot=$2)) OR ($1='driver' AND EXISTS(SELECT 1 FROM trips t WHERE t.plan_id=p.id AND t.vehicle_id=$4)) OR ($1='store_manager' AND EXISTS(SELECT 1 FROM trip_stops st JOIN orders o ON o.id=st.order_id WHERE st.plan_id=p.id AND o.outlet_id=$3)) ORDER BY p.plan_date DESC,p.version DESC`,
		"trips":    `SELECT t.* FROM trips t JOIN plans p ON p.id=t.plan_id WHERE ($1='dispatcher' AND ($2='' OR p.depot=$2)) OR ($1='loader' AND p.depot=$2 AND p.status='published') OR ($1='driver' AND t.vehicle_id=$4 AND p.status='published') OR ($1='store_manager' AND p.status='published' AND EXISTS(SELECT 1 FROM trip_stops st JOIN orders o ON o.id=st.order_id WHERE st.trip_id=t.id AND o.outlet_id=$3)) ORDER BY t.planned_depart,t.trip_no`,
	}
	args := []interface{}{string(u.Role), value(u.Depot), value(u.OutletID), value(u.VehicleID)}
	// A fixed argument CTE makes all four scope parameters available to every query.
	get := func(query string) (json.RawMessage, error) {
		var b []byte
		err := s.pool.QueryRow(ctx, `WITH scope AS (SELECT $1::text,$2::text,$3::text,$4::text) SELECT COALESCE(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (`+query+`) q`, args...).Scan(&b)
		return b, err
	}
	for key, query := range queries {
		v, err := get(query)
		if err != nil {
			failure(w, err)
			return
		}
		result[key] = v
	}
	orderScope := `SELECT o.id FROM orders o JOIN outlets a USING(outlet_id) WHERE ($1='dispatcher' AND ($2='' OR a.depot=$2)) OR ($1='store_manager' AND o.outlet_id=$3) OR ($1='loader' AND a.depot=$2) OR ($1='driver' AND EXISTS(SELECT 1 FROM trip_stops st JOIN trips t ON t.id=st.trip_id WHERE st.order_id=o.id AND t.vehicle_id=$4))`
	for key, query := range map[string]string{
		"lines":         `SELECT ol.*,c.name_en,c.temp_requirement FROM order_lines ol JOIN catalog_items c USING(sku) WHERE ol.order_id IN (` + orderScope + `)`,
		"stops":         `SELECT st.* FROM trip_stops st JOIN plans p ON p.id=st.plan_id WHERE st.order_id IN (` + orderScope + `) AND ($1='dispatcher' OR p.status='published') ORDER BY st.seq`,
		"checks":        `SELECT lc.* FROM load_checks lc JOIN trip_stops st ON st.id=lc.stop_id WHERE st.order_id IN (` + orderScope + `) ORDER BY lc.at,lc.id`,
		"deferrals":     `SELECT d.* FROM deferrals d JOIN plans p ON p.id=d.plan_id WHERE d.order_id IN (` + orderScope + `) AND ($1='dispatcher' OR p.status='published')`,
		"issues":        `SELECT i.* FROM issues i WHERE i.raised_by='` + u.ID.String() + `' OR i.order_id IN (` + orderScope + `) OR i.stop_id IN (SELECT id FROM trip_stops WHERE order_id IN (` + orderScope + `))`,
		"confirmations": `SELECT sc.* FROM store_confirmations sc JOIN trip_stops st ON st.id=sc.stop_id WHERE st.order_id IN (` + orderScope + `)`,
		"receipts":      `SELECT rc.* FROM receipt_confirmations rc JOIN trip_stops st ON st.id=rc.stop_id WHERE st.order_id IN (` + orderScope + `)`,
		"codes":         `SELECT sr.stop_id,sr.receipt_code,sr.expires_at FROM stop_receipts sr JOIN trip_stops st ON st.id=sr.stop_id JOIN orders o ON o.id=st.order_id WHERE $1='store_manager' AND o.outlet_id=$3 AND sr.verified_at IS NULL AND st.status='arrived'`,
		"pending_users": `SELECT id,name,email,role,depot,outlet_id,phone,work_id,created_at FROM users WHERE $1='dispatcher' AND active=false AND ($2='' OR depot=$2) ORDER BY created_at`,
		"capacity":      `SELECT * FROM capacity_requests WHERE $1='dispatcher' AND ($2='' OR depot=$2) ORDER BY created_at DESC`,
	} {
		v, err := get(query)
		if err != nil {
			failure(w, err)
			return
		}
		result[key] = v
	}
	respond(w, 200, result)
}
func value(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func (s *Server) workflowCommand(w http.ResponseWriter, r *http.Request) {
	u := auth.GetUser(r.Context())
	if u == nil {
		respond(w, 401, map[string]string{"detail": "Sign in required"})
		return
	}
	var c WorkflowCommand
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil || c.ID == uuid.Nil {
		respond(w, 400, map[string]string{"detail": "A command ID and valid payload are required"})
		return
	}
	result, err := s.executeCommand(r.Context(), u, c)
	if err != nil {
		failure(w, err)
		return
	}
	respond(w, 200, result)
}
func (s *Server) executeCommand(ctx context.Context, u *auth.AuthUser, c WorkflowCommand) (map[string]interface{}, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, c.ID.String()); err != nil {
		return nil, err
	}
	var prior []byte
	err = tx.QueryRow(ctx, `SELECT result FROM workflow_commands WHERE id=$1 AND user_id=$2`, c.ID, u.ID).Scan(&prior)
	if err == nil {
		var result map[string]interface{}
		_ = json.Unmarshal(prior, &result)
		return result, nil
	}
	result, err := s.applyCommand(ctx, tx, u, c)
	var ce *codeError
	if errors.As(err, &ce) {
		_ = tx.Rollback(ctx)
		_, _ = s.pool.Exec(ctx, `UPDATE stop_receipts SET attempts=attempts+1 WHERE stop_id=$1`, ce.stopID)
		return nil, err
	}
	if err != nil {
		return nil, err
	}
	b, _ := json.Marshal(result)
	_, err = tx.Exec(ctx, `INSERT INTO workflow_commands(id,user_id,result)VALUES($1,$2,$3)`, c.ID, u.ID, b)
	if err != nil {
		return nil, err
	}
	audit, _ := json.Marshal(map[string]interface{}{"action": c.Action, "trip_id": c.TripID, "stop_id": c.StopID, "note": c.Note})
	_, err = tx.Exec(ctx, `INSERT INTO audit_log(actor_id,action,entity,entity_id,after)VALUES($1,$2,'workflow',$3,$4)`, u.ID, c.Action, c.ID.String(), audit)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return result, nil
}

func (s *Server) applyCommand(ctx context.Context, tx pgx.Tx, u *auth.AuthUser, c WorkflowCommand) (map[string]interface{}, error) {
	deny := func(msg string) (map[string]interface{}, error) { return nil, fmt.Errorf("%s", msg) }
	if c.Action == "capacity" {
		if u.Role != auth.RoleDispatcher || strings.TrimSpace(c.Note) == "" || c.Depot == "" || (value(u.Depot) != "" && value(u.Depot) != c.Depot) {
			return deny("Dispatcher depot and capacity reason required")
		}
		_, err := tx.Exec(ctx, `INSERT INTO capacity_requests(id,depot,week_start,action,note,created_by)VALUES($1,$2,$3::date,$4,$5,$6)`, c.ID, c.Depot, c.Date, c.Status, c.Note, u.ID)
		return map[string]interface{}{"status": "proposed"}, err
	}
	if c.Action == "defer" {
		if u.Role != auth.RoleDispatcher || strings.TrimSpace(c.Note) == "" {
			return deny("Dispatcher reason required")
		}
		var depot, date, status string
		if err := tx.QueryRow(ctx, `SELECT a.depot,o.delivery_date::text,o.status FROM orders o JOIN outlets a USING(outlet_id) WHERE o.id=$1 FOR UPDATE OF o`, c.OrderID).Scan(&depot, &date, &status); err != nil {
			return nil, err
		}
		if value(u.Depot) != "" && value(u.Depot) != depot {
			return deny("Different depot")
		}
		if status == "on_route" || status == "delivered" || status == "delivered_short" {
			return deny("Cannot defer an active or received delivery")
		}
		var operating bool
		err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM calendar_days WHERE date=$1::date AND is_operating=1 AND date>$2::date)`, c.Date, date).Scan(&operating)
		if err != nil || !operating {
			return deny("Choose a later operating date within the official calendar")
		}
		var plan string
		err = tx.QueryRow(ctx, `SELECT id::text FROM plans WHERE depot=$1 AND plan_date=$2::date AND status='draft' ORDER BY version DESC LIMIT 1 FOR UPDATE`, depot, date).Scan(&plan)
		if err != nil {
			return deny("Generate a draft plan first")
		}
		var active bool
		_ = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM trip_stops st JOIN trips t ON t.id=st.trip_id WHERE st.order_id=$1 AND t.status IN ('sealed','departed','completed'))`, c.OrderID).Scan(&active)
		if active {
			return deny("Reopen or resolve the assigned trip before deferral")
		}
		var oldTrip *uuid.UUID
		_ = tx.QueryRow(ctx, `SELECT trip_id FROM trip_stops WHERE order_id=$1 AND plan_id=$2`, c.OrderID, plan).Scan(&oldTrip)
		if _, err = tx.Exec(ctx, `DELETE FROM trip_stops WHERE order_id=$1 AND plan_id=$2`, c.OrderID, plan); err != nil {
			return nil, err
		}
		if oldTrip != nil {
			ref, err := s.planningRef(ctx, date)
			if err != nil {
				return nil, err
			}
			if err = s.recomputeTrip(ctx, tx, ref, *oldTrip); err != nil {
				return nil, err
			}
		}
		if _, err = tx.Exec(ctx, `DELETE FROM deferrals WHERE order_id=$1 AND plan_id=$2`, c.OrderID, plan); err != nil {
			return nil, err
		}
		detail, _ := json.Marshal(map[string]string{"reason": c.Note})
		_, err = tx.Exec(ctx, `INSERT INTO deferrals(plan_id,order_id,reason_code,decided_by,carried_to,explanation)VALUES($1,$2,'MANUAL','dispatcher',$3::date,$4)`, plan, c.OrderID, c.Date, detail)
		if err != nil {
			return nil, err
		}
		_, err = tx.Exec(ctx, `UPDATE orders SET status='deferred',version=version+1 WHERE id=$1`, c.OrderID)
		return map[string]interface{}{"status": "deferred"}, err
	}
	if c.Action == "user_decision" {
		return s.userDecision(ctx, tx, u, c)
	}
	if c.Action == "reassign" {
		return s.reassign(ctx, tx, u, c)
	}
	if c.Action == "issue_ack" || c.Action == "issue_instruction" || c.Action == "issue_resolve" {
		if u.Role != auth.RoleDispatcher {
			return deny("Dispatcher access required")
		}
		var old, depot string
		err := tx.QueryRow(ctx, `SELECT i.status,a.depot FROM issues i JOIN trip_stops st ON st.id=i.stop_id JOIN orders o ON o.id=st.order_id JOIN outlets a USING(outlet_id) WHERE i.id=$1 FOR UPDATE OF i`, c.IssueID).Scan(&old, &depot)
		if err != nil {
			return nil, err
		}
		if value(u.Depot) != "" && value(u.Depot) != depot {
			return deny("Different depot")
		}
		next := "ack"
		if c.Action == "issue_resolve" {
			next = "resolved"
			if old != "ack" || strings.TrimSpace(c.Note) == "" {
				return deny("Acknowledge first and record the confirmed outcome")
			}
		}
		if c.Action == "issue_instruction" && (old != "ack" || strings.TrimSpace(c.Note) == "") {
			return deny("Acknowledge first and record agreed instructions")
		}
		detail, _ := json.Marshal(map[string]interface{}{c.Action: map[string]interface{}{"note": c.Note, "by": u.ID, "at": s.clk.Now()}})
		_, err = tx.Exec(ctx, `UPDATE issues SET status=$2,detail=detail||$3::jsonb,resolved_at=CASE WHEN $2='resolved' THEN now() ELSE NULL END WHERE id=$1`, c.IssueID, next, detail)
		return map[string]interface{}{"status": next}, err
	}
	var tripID, orderID, depot, vehicle, tripStatus, stopStatus string
	var version int
	if c.StopID != "" {
		err := tx.QueryRow(ctx, `SELECT st.trip_id::text,st.order_id::text,p.depot,t.vehicle_id,t.status,st.status,p.version FROM trip_stops st JOIN trips t ON t.id=st.trip_id JOIN plans p ON p.id=t.plan_id WHERE st.id=$1 AND p.status='published' FOR UPDATE OF st,t`, c.StopID).Scan(&tripID, &orderID, &depot, &vehicle, &tripStatus, &stopStatus, &version)
		if err != nil {
			return deny("Stop is missing or its plan is no longer published; reload and review")
		}
	} else {
		tripID = c.TripID
		err := tx.QueryRow(ctx, `SELECT p.depot,t.vehicle_id,t.status,p.version FROM trips t JOIN plans p ON p.id=t.plan_id WHERE t.id=$1 AND p.status='published' FOR UPDATE OF t`, tripID).Scan(&depot, &vehicle, &tripStatus, &version)
		if err != nil {
			return deny("Published trip not found")
		}
	}
	if u.Role == auth.RoleDriver && value(u.VehicleID) != vehicle {
		return deny("Trip is not assigned to this driver")
	}
	if (u.Role == auth.RoleLoader || u.Role == auth.RoleDispatcher) && value(u.Depot) != "" && value(u.Depot) != depot {
		return deny("Different depot")
	}
	if u.Role == auth.RoleStoreManager {
		var outlet string
		if err := tx.QueryRow(ctx, `SELECT outlet_id FROM orders WHERE id=$1`, orderID).Scan(&outlet); err != nil || value(u.OutletID) != outlet {
			return deny("Different outlet")
		}
	}
	if c.PlanVersion != version {
		return deny("PLAN_CHANGED: reload the manifest before retrying; the original action is retained on your device")
	}
	exec := func(q string, args ...interface{}) error { _, err := tx.Exec(ctx, q, args...); return err }
	switch c.Action {
	case "load_check":
		if u.Role != auth.RoleLoader || !(tripStatus == "planned" || tripStatus == "loading") {
			return deny("Only the loader can edit an unsealed load")
		}
		var expected int
		if err := tx.QueryRow(ctx, `SELECT qty FROM order_lines WHERE order_id=$1 AND line_no=$2`, orderID, c.LineNo).Scan(&expected); err != nil {
			return nil, err
		}
		if c.Quantity < 0 || c.Quantity > expected {
			return deny("Usable quantity must be within the manifest quantity")
		}
		status := "ok"
		if c.Quantity < expected {
			status = "short"
			if c.Status == "damaged" {
				status = "damaged"
			}
			if strings.TrimSpace(c.Note) == "" {
				return deny("A shortfall reason is required")
			}
		}
		err := exec(`INSERT INTO load_checks(trip_id,stop_id,line_no,status,qty_short,note,by_user,client_event_id)VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, tripID, c.StopID, c.LineNo, status, expected-c.Quantity, c.Note, u.ID, c.ID)
		if err != nil {
			return nil, err
		}
		if status != "ok" {
			detail, _ := json.Marshal(map[string]interface{}{"line_no": c.LineNo, "expected": expected, "usable": c.Quantity, "note": c.Note, "check_id": c.ID})
			if err = exec(`INSERT INTO issues(kind,trip_id,stop_id,order_id,raised_by,raised_role,detail)VALUES('load_shortfall',$1,$2,$3,$4,'loader',$5)`, tripID, c.StopID, orderID, u.ID, detail); err != nil {
				return nil, err
			}
		}
		if err = exec(`UPDATE trips SET status='loading' WHERE id=$1`, tripID); err != nil {
			return nil, err
		}
	case "accept_shortfall":
		if u.Role != auth.RoleDispatcher || strings.TrimSpace(c.Note) == "" || tripStatus == "departed" {
			return deny("Dispatcher acknowledgment and reason required before departure")
		}
		if err := exec(`UPDATE load_checks SET acknowledged_by=$1,acknowledged_at=now(),acknowledgment_note=$2 WHERE id=(SELECT id FROM load_checks WHERE stop_id=$3 AND line_no=$4 ORDER BY at DESC,id DESC LIMIT 1) AND status!='ok'`, u.ID, c.Note, c.StopID, c.LineNo); err != nil {
			return nil, err
		}
	case "reopen":
		if u.Role != auth.RoleDispatcher || tripStatus != "sealed" || strings.TrimSpace(c.Note) == "" {
			return deny("Only dispatch can reopen a sealed trip with a reason")
		}
		if err := exec(`UPDATE trips SET status='loading',acknowledged_version=NULL WHERE id=$1`, tripID); err != nil {
			return nil, err
		}
		if err := exec(`UPDATE plans SET version=version+1 WHERE id=(SELECT plan_id FROM trips WHERE id=$1)`, tripID); err != nil {
			return nil, err
		}
	case "ack_plan":
		if u.Role != auth.RoleLoader {
			return deny("Loader required")
		}
		if err := exec(`UPDATE trips SET acknowledged_version=$2 WHERE id=$1`, tripID, version); err != nil {
			return nil, err
		}
	case "seal":
		if u.Role != auth.RoleLoader || !(tripStatus == "planned" || tripStatus == "loading") {
			return deny("Only an unsealed load can be sealed")
		}
		var missing int
		err := tx.QueryRow(ctx, `SELECT count(*) FROM trip_stops st JOIN order_lines ol ON ol.order_id=st.order_id LEFT JOIN LATERAL(SELECT * FROM load_checks WHERE stop_id=st.id AND line_no=ol.line_no ORDER BY at DESC,id DESC LIMIT 1) lc ON true WHERE st.trip_id=$1 AND (lc.id IS NULL OR (lc.status!='ok' AND lc.acknowledged_at IS NULL))`, tripID).Scan(&missing)
		if err != nil {
			return nil, err
		}
		if missing > 0 {
			return deny("Complete every item check and obtain dispatcher acknowledgment for each shortfall")
		}
		var ack *int
		_ = tx.QueryRow(ctx, `SELECT acknowledged_version FROM trips WHERE id=$1`, tripID).Scan(&ack)
		if ack == nil || *ack != version {
			return deny("Reload and acknowledge the current plan before sealing")
		}
		if err = exec(`UPDATE trips SET status='sealed' WHERE id=$1`, tripID); err != nil {
			return nil, err
		}
	case "TRIP_DEPARTED":
		if u.Role != auth.RoleDriver || tripStatus != "sealed" {
			return deny("Only the assigned driver can depart a sealed trip")
		}
		if err := exec(`UPDATE trips SET status='departed' WHERE id=$1`, tripID); err != nil {
			return nil, err
		}
		if err := exec(`UPDATE orders SET status='on_route' WHERE id IN (SELECT order_id FROM trip_stops WHERE trip_id=$1)`, tripID); err != nil {
			return nil, err
		}
	case "STOP_ARRIVED":
		if u.Role != auth.RoleDriver || tripStatus != "departed" || stopStatus != "pending" {
			return deny("Depart the trip before recording arrival")
		}
		var earlier int
		_ = tx.QueryRow(ctx, `SELECT count(*) FROM trip_stops WHERE trip_id=$1 AND seq<(SELECT seq FROM trip_stops WHERE id=$2) AND status NOT IN ('delivered','delivered_short','failed','receipt_confirmed','receipt_disputed')`, tripID, c.StopID).Scan(&earlier)
		if earlier > 0 {
			return deny("Follow the planned stop sequence; ask dispatch to change it if blocked")
		}
		if err := exec(`UPDATE trip_stops SET status='arrived' WHERE id=$1`, c.StopID); err != nil {
			return nil, err
		}
	case "ISSUE_REPORTED":
		if strings.TrimSpace(c.Note) == "" {
			return deny("Issue details required")
		}
		detail, _ := json.Marshal(map[string]string{"note": c.Note})
		if err := exec(`INSERT INTO issues(id,kind,trip_id,stop_id,order_id,raised_by,raised_role,detail)VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, c.ID, c.Status, tripID, c.StopID, orderID, u.ID, u.Role, detail); err != nil {
			return nil, err
		}
	case "STOP_FAILED":
		if u.Role != auth.RoleDriver || tripStatus != "departed" || strings.TrimSpace(c.Note) == "" {
			return deny("Driver failure reason required")
		}
		if err := exec(`UPDATE trip_stops SET status='failed' WHERE id=$1`, c.StopID); err != nil {
			return nil, err
		}
		if err := exec(`UPDATE orders SET status='failed' WHERE id=$1`, orderID); err != nil {
			return nil, err
		}
	case "STOP_DELIVERED":
		if u.Role != auth.RoleDriver || tripStatus != "departed" || stopStatus != "arrived" {
			return deny("Arrival required before handover")
		}
		if strings.TrimSpace(c.Recipient) == "" {
			return deny("Recipient name required")
		}
		var salt, hash string
		var expires time.Time
		var attempts int
		if err := tx.QueryRow(ctx, `SELECT code_salt,code_hash,expires_at,attempts FROM stop_receipts WHERE stop_id=$1 AND verified_at IS NULL FOR UPDATE`, c.StopID).Scan(&salt, &hash, &expires, &attempts); err != nil {
			return deny("Ask the store manager to issue a current receipt code")
		}
		// An offline delivery is judged at the time the driver recorded it, not when it reaches the server.
		at := s.clk.Now()
		if t, perr := time.Parse(time.RFC3339, c.ClientAt); perr == nil && t.Before(at) && t.After(at.Add(-24*time.Hour)) {
			at = t
		}
		if attempts >= 5 || at.After(expires) {
			return deny("Receipt code expired or locked; ask the store manager to reissue")
		}
		if !ordering.VerifyReceiptCode(c.Code, salt, hash) {
			return nil, &codeError{stopID: c.StopID}
		}
		rows, err := tx.Query(ctx, `SELECT line_no,qty FROM order_lines WHERE order_id=$1 ORDER BY line_no`, orderID)
		if err != nil {
			return nil, err
		}
		expected := map[int]int{}
		for rows.Next() {
			var line, qty int
			if err = rows.Scan(&line, &qty); err != nil {
				rows.Close()
				return nil, err
			}
			expected[line] = qty
		}
		rows.Close()
		if len(c.Lines) != len(expected) {
			return deny("Record every manifest line")
		}
		seen := map[int]bool{}
		total := 0
		short := false
		for _, ln := range c.Lines {
			qty, ok := expected[ln.LineNo]
			if !ok || seen[ln.LineNo] || ln.Received < 0 || ln.Received > qty {
				return deny("Invalid accepted quantities")
			}
			seen[ln.LineNo] = true
			total += ln.Received
			short = short || ln.Received < qty
		}
		if total == 0 {
			return deny("No goods accepted: report failed delivery instead")
		}
		if short && strings.TrimSpace(c.Note) == "" {
			return deny("Discrepancy reason required")
		}
		status := "delivered"
		receiptStatus := "ok"
		if short {
			status = "delivered_short"
			receiptStatus = "short"
		}
		lines, _ := json.Marshal(map[string]interface{}{"items": c.Lines, "recipient": c.Recipient, "note": c.Note})
		if err = exec(`INSERT INTO receipt_confirmations(stop_id,confirmed_by,status,lines)VALUES($1,$2,$3,$4)`, c.StopID, u.ID, receiptStatus, lines); err != nil {
			return nil, err
		}
		if err = exec(`UPDATE trip_stops SET status=$2 WHERE id=$1`, c.StopID, status); err != nil {
			return nil, err
		}
		if err = exec(`UPDATE orders SET status=$2,version=version+1 WHERE id=$1`, orderID, status); err != nil {
			return nil, err
		}
		if err = exec(`UPDATE stop_receipts SET verified_at=now(),receipt_code=NULL WHERE stop_id=$1`, c.StopID); err != nil {
			return nil, err
		}
		if short {
			detail, _ := json.Marshal(map[string]interface{}{"note": c.Note, "lines": c.Lines})
			if err = exec(`INSERT INTO issues(kind,stop_id,order_id,trip_id,raised_by,raised_role,detail)VALUES('receipt_shortfall',$1,$2,$3,$4,'driver',$5)`, c.StopID, orderID, tripID, u.ID, detail); err != nil {
				return nil, err
			}
		}
	case "receipt_confirm":
		if u.Role != auth.RoleStoreManager || !(stopStatus == "delivered" || stopStatus == "delivered_short") {
			return deny("Only the outlet manager can confirm a delivered stop")
		}
		outcome := "confirmed"
		next := "receipt_confirmed"
		if c.Status == "disputed" {
			outcome, next = "disputed", "receipt_disputed"
			if strings.TrimSpace(c.Note) == "" {
				return deny("Describe what was wrong with the delivery")
			}
		}
		if err := exec(`INSERT INTO store_confirmations(stop_id,confirmed_by,outcome,note) VALUES($1,$2,$3,$4)`, c.StopID, u.ID, outcome, c.Note); err != nil {
			return nil, err
		}
		if err := exec(`UPDATE trip_stops SET status=$2 WHERE id=$1`, c.StopID, next); err != nil {
			return nil, err
		}
		if outcome == "disputed" {
			detail, _ := json.Marshal(map[string]string{"note": c.Note})
			if err := exec(`INSERT INTO issues(kind,stop_id,order_id,trip_id,raised_by,raised_role,detail) VALUES('receipt_dispute',$1,$2,$3,$4,'store_manager',$5)`, c.StopID, orderID, tripID, u.ID, detail); err != nil {
				return nil, err
			}
		}
	case "receipt_code":
		if u.Role != auth.RoleStoreManager || stopStatus != "arrived" {
			return deny("Only the outlet manager can issue a code after arrival")
		}
		n, err := rand.Int(rand.Reader, big.NewInt(10000))
		if err != nil {
			return nil, err
		}
		code := fmt.Sprintf("%04d", n.Int64())
		salt, err := auth.GenerateRandomToken(16)
		if err != nil {
			return nil, err
		}
		h := hmac.New(sha256.New, []byte(salt))
		h.Write([]byte(code))
		hash := hex.EncodeToString(h.Sum(nil))
		if err = exec(`INSERT INTO stop_receipts(stop_id,code_salt,code_hash,receipt_code,expires_at)VALUES($1,$2,$3,$4,$5) ON CONFLICT(stop_id) DO UPDATE SET code_salt=$2,code_hash=$3,receipt_code=$4,expires_at=$5,attempts=0,verified_at=NULL,issued_at=now()`, c.StopID, salt, hash, code, s.clk.Now().Add(30*time.Minute)); err != nil {
			return nil, err
		}
	case "TRIP_COMPLETED":
		if u.Role != auth.RoleDriver || tripStatus != "departed" {
			return deny("Only the assigned driver can complete an active trip")
		}
		var pending int
		_ = tx.QueryRow(ctx, `SELECT count(*) FROM trip_stops WHERE trip_id=$1 AND status IN ('pending','arrived')`, tripID).Scan(&pending)
		if pending > 0 {
			return deny("Record every stop outcome first")
		}
		if err := exec(`UPDATE trips SET status='completed' WHERE id=$1`, tripID); err != nil {
			return nil, err
		}
	default:
		return deny("Unsupported workflow action")
	}
	if c.Photo != "" {
		parts := strings.SplitN(c.Photo, ",", 2)
		if len(parts) != 2 {
			return deny("Invalid photo")
		}
		data, err := base64.StdEncoding.DecodeString(parts[1])
		if err != nil || len(data) > 2*1024*1024 {
			return deny("Photo must be an image no larger than 2 MB")
		}
		mime := http.DetectContentType(data)
		if mime != "image/jpeg" && mime != "image/png" && mime != "image/webp" {
			return deny("Unsupported image type")
		}
		sum := sha256.Sum256(data)
		if err = exec(`INSERT INTO photos(id,stop_id,kind,content_type,bytes,sha256,storage_key,uploaded_by,content)VALUES($1,$2,'issue',$3,$4,$5,$6,$7,$8)`, uuid.New(), c.StopID, mime, len(data), hex.EncodeToString(sum[:]), c.ID.String(), u.ID, data); err != nil {
			return nil, err
		}
	}
	_ = tz.Colombo
	return map[string]interface{}{"status": "accepted", "id": c.ID}, nil
}
