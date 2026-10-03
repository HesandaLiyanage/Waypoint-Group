package idempotency

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/auth"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type memStore struct {
	mu      sync.Mutex
	records map[string]*Record
}

func newMemStore() *memStore {
	return &memStore{records: make(map[string]*Record)}
}

func (m *memStore) key(u uuid.UUID, k string) string {
	return u.String() + ":" + k
}

func (m *memStore) Get(ctx context.Context, userID uuid.UUID, key string) (*Record, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.records[m.key(userID, key)], nil
}

func (m *memStore) CreateInProgress(ctx context.Context, userID uuid.UUID, key, reqHash string, ttl time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.records[m.key(userID, key)] = &Record{
		RequestHash: reqHash,
		Status:      "in_progress",
		ExpiresAt:   time.Now().Add(ttl),
	}
	return nil
}

func (m *memStore) Complete(ctx context.Context, userID uuid.UUID, key string, statusCode int, body []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if rec, ok := m.records[m.key(userID, key)]; ok {
		rec.Status = "done"
		rec.ResponseCode = statusCode
		rec.ResponseBody = body
	}
	return nil
}

func TestIdempotencyMiddleware(t *testing.T) {
	store := newMemStore()
	callCount := 0

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"order_id":"12345"}`))
	})

	wrapped := Middleware(store)(handler)

	testUser := &auth.AuthUser{ID: uuid.New()}

	// 1. First execution
	req1 := httptest.NewRequest("POST", "/api/v1/orders", bytes.NewBufferString(`{"items":[1]}`))
	req1.Header.Set("Idempotency-Key", "key-abc-123")
	req1 = req1.WithContext(auth.WithUser(req1.Context(), testUser))
	rec1 := httptest.NewRecorder()

	wrapped.ServeHTTP(rec1, req1)
	assert.Equal(t, http.StatusCreated, rec1.Code)
	assert.Equal(t, 1, callCount)
	assert.Empty(t, rec1.Header().Get("Idempotent-Replay"))

	// 2. Exact same replay -> should return cached response without calling handler again
	req2 := httptest.NewRequest("POST", "/api/v1/orders", bytes.NewBufferString(`{"items":[1]}`))
	req2.Header.Set("Idempotency-Key", "key-abc-123")
	req2 = req2.WithContext(auth.WithUser(req2.Context(), testUser))
	rec2 := httptest.NewRecorder()

	wrapped.ServeHTTP(rec2, req2)
	assert.Equal(t, http.StatusCreated, rec2.Code)
	assert.Equal(t, 1, callCount, "Handler must NOT be executed on cached replay")
	assert.Equal(t, "true", rec2.Header().Get("Idempotent-Replay"))
	assert.Equal(t, `{"order_id":"12345"}`, rec2.Body.String())

	// 3. Different payload with same idempotency key -> should return 422
	req3 := httptest.NewRequest("POST", "/api/v1/orders", bytes.NewBufferString(`{"items":[2]}`))
	req3.Header.Set("Idempotency-Key", "key-abc-123")
	req3 = req3.WithContext(auth.WithUser(req3.Context(), testUser))
	rec3 := httptest.NewRecorder()

	wrapped.ServeHTTP(rec3, req3)
	assert.Equal(t, http.StatusUnprocessableEntity, rec3.Code)
	require.Equal(t, 1, callCount)
}
