package ratelimit

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"golang.org/x/time/rate"
)

func TestLimiter_Allow(t *testing.T) {
	// 1 token per second, burst 2
	limiter := NewLimiter(rate.Limit(1), 2, 10*time.Minute)

	assert.True(t, limiter.Allow("user-1"))
	assert.True(t, limiter.Allow("user-1"))
	// 3rd in quick succession should be rejected
	assert.False(t, limiter.Allow("user-1"))

	// user-2 has their own bucket
	assert.True(t, limiter.Allow("user-2"))
}

func TestLimiter_Middleware(t *testing.T) {
	limiter := NewLimiter(rate.Limit(1), 1, 10*time.Minute)

	handler := limiter.Middleware(func(r *http.Request) string {
		return "static-ip"
	}, 2)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// First request succeeds
	rec1 := httptest.NewRecorder()
	req1 := httptest.NewRequest("GET", "/", nil)
	handler.ServeHTTP(rec1, req1)
	assert.Equal(t, http.StatusOK, rec1.Code)

	// Second immediate request fails with 429
	rec2 := httptest.NewRecorder()
	req2 := httptest.NewRequest("GET", "/", nil)
	handler.ServeHTTP(rec2, req2)
	assert.Equal(t, http.StatusTooManyRequests, rec2.Code)
	assert.Equal(t, "2", rec2.Header().Get("Retry-After"))
}
