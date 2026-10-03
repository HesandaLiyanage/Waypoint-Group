package httpx

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWriteProblem(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Request-Id", "req-123456")

	WriteProblem(rec, req, http.StatusBadRequest, "BAD_INPUT", "Bad Input Title", "Specific detail", map[string]interface{}{"field": "outlet_id"})

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Equal(t, "application/problem+json", rec.Header().Get("Content-Type"))

	var prob ProblemDetails
	err := json.Unmarshal(rec.Body.Bytes(), &prob)
	require.NoError(t, err)

	assert.Equal(t, "BAD_INPUT", prob.Code)
	assert.Equal(t, "Bad Input Title", prob.Title)
	assert.Equal(t, "Specific detail", prob.Detail)
	assert.Equal(t, "req-123456", prob.RequestID)
	assert.Equal(t, "outlet_id", prob.Params["field"])
}

func TestSecurityHeadersMiddleware(t *testing.T) {
	handler := SecurityHeadersMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/", nil)
	handler.ServeHTTP(rec, req)

	assert.Equal(t, "nosniff", rec.Header().Get("X-Content-Type-Options"))
	assert.Equal(t, "DENY", rec.Header().Get("X-Frame-Options"))
	assert.Equal(t, "strict-origin-when-cross-origin", rec.Header().Get("Referrer-Policy"))
}

func TestRecovererMiddleware(t *testing.T) {
	handler := RecovererMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("unexpected critical failure")
	}))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/panic", nil)
	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusInternalServerError, rec.Code)
	assert.Equal(t, "application/problem+json", rec.Header().Get("Content-Type"))

	var prob ProblemDetails
	err := json.Unmarshal(rec.Body.Bytes(), &prob)
	require.NoError(t, err)
	assert.Equal(t, "INTERNAL_ERROR", prob.Code)
}
