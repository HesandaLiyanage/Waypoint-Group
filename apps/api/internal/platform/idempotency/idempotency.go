package idempotency

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/auth"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/httpx"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store interface {
	Get(ctx context.Context, userID uuid.UUID, key string) (*Record, error)
	CreateInProgress(ctx context.Context, userID uuid.UUID, key, reqHash string, ttl time.Duration) error
	Complete(ctx context.Context, userID uuid.UUID, key string, statusCode int, body []byte) error
}

type Record struct {
	RequestHash  string
	Status       string // in_progress | done
	ResponseCode int
	ResponseBody []byte
	ExpiresAt    time.Time
}

type PostgresStore struct {
	pool *pgxpool.Pool
}

func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{pool: pool}
}

func (s *PostgresStore) Get(ctx context.Context, userID uuid.UUID, key string) (*Record, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT request_hash, status, response_code, response_body, expires_at
		FROM idempotency_keys
		WHERE user_id = $1 AND key = $2 AND expires_at > CURRENT_TIMESTAMP
	`, userID, key)

	var rec Record
	var respCode *int
	var respBody []byte
	if err := row.Scan(&rec.RequestHash, &rec.Status, &respCode, &respBody, &rec.ExpiresAt); err != nil {
		return nil, err
	}
	if respCode != nil {
		rec.ResponseCode = *respCode
	}
	rec.ResponseBody = respBody
	return &rec, nil
}

func (s *PostgresStore) CreateInProgress(ctx context.Context, userID uuid.UUID, key, reqHash string, ttl time.Duration) error {
	expiresAt := time.Now().Add(ttl)
	_, err := s.pool.Exec(ctx, `
		INSERT INTO idempotency_keys (user_id, key, request_hash, status, created_at, expires_at)
		VALUES ($1, $2, $3, 'in_progress', CURRENT_TIMESTAMP, $4)
	`, userID, key, reqHash, expiresAt)
	return err
}

func (s *PostgresStore) Complete(ctx context.Context, userID uuid.UUID, key string, statusCode int, body []byte) error {
	var bodyJSON interface{}
	if len(body) > 0 {
		_ = json.Unmarshal(body, &bodyJSON)
	}
	_, err := s.pool.Exec(ctx, `
		UPDATE idempotency_keys
		SET status = 'done', response_code = $1, response_body = $2
		WHERE user_id = $3 AND key = $4
	`, statusCode, body, userID, key)
	return err
}

// Middleware returns an HTTP middleware enforcing Idempotency-Key guarantees.
func Middleware(store Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := r.Header.Get("Idempotency-Key")
			if key == "" {
				next.ServeHTTP(w, r)
				return
			}

			user := auth.GetUser(r.Context())
			if user == nil {
				next.ServeHTTP(w, r)
				return
			}

			// Read and hash the request body
			var bodyBytes []byte
			if r.Body != nil {
				var err error
				bodyBytes, err = io.ReadAll(r.Body)
				if err != nil {
					httpx.WriteProblem(w, r, http.StatusBadRequest, "INVALID_BODY", "Invalid Request Body", err.Error(), nil)
					return
				}
				r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
			}

			h := sha256.New()
			h.Write([]byte(r.Method))
			h.Write([]byte(r.URL.Path))
			h.Write(bodyBytes)
			reqHash := hex.EncodeToString(h.Sum(nil))

			ctx := r.Context()
			rec, err := store.Get(ctx, user.ID, key)
			if err == nil && rec != nil {
				if rec.RequestHash != reqHash {
					httpx.WriteProblem(w, r, http.StatusUnprocessableEntity, "IDEMPOTENCY_KEY_REUSED",
						"Idempotency Key Reused", "The idempotency key was previously used with a different request payload", nil)
					return
				}

				if rec.Status == "in_progress" {
					w.Header().Set("Retry-After", "1")
					httpx.WriteProblem(w, r, http.StatusConflict, "CONCURRENT_REQUEST",
						"Concurrent Request In Flight", "An identical request with this idempotency key is currently processing", nil)
					return
				}

				// Replay cached response
				w.Header().Set("Idempotent-Replay", "true")
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(rec.ResponseCode)
				_, _ = w.Write(rec.ResponseBody)
				return
			}

			// Register in-progress
			if err := store.CreateInProgress(ctx, user.ID, key, reqHash, 24*time.Hour); err != nil {
				// If race condition hit, retry get
				rec2, err2 := store.Get(ctx, user.ID, key)
				if err2 == nil && rec2 != nil && rec2.Status == "in_progress" {
					w.Header().Set("Retry-After", "1")
					httpx.WriteProblem(w, r, http.StatusConflict, "CONCURRENT_REQUEST",
						"Concurrent Request In Flight", "An identical request is currently processing", nil)
					return
				}
			}

			// Capture response
			recorder := &responseRecorder{
				ResponseWriter: w,
				statusCode:     http.StatusOK,
				body:           bytes.NewBuffer(nil),
			}

			next.ServeHTTP(recorder, r)

			// Store completed response if status < 500
			if recorder.statusCode < 500 {
				_ = store.Complete(ctx, user.ID, key, recorder.statusCode, recorder.body.Bytes())
			}
		})
	}
}

type responseRecorder struct {
	http.ResponseWriter
	statusCode int
	body       *bytes.Buffer
}

func (r *responseRecorder) WriteHeader(code int) {
	r.statusCode = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *responseRecorder) Write(b []byte) (int, error) {
	r.body.Write(b)
	return r.ResponseWriter.Write(b)
}
