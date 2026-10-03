package ratelimit

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/httpx"
	"golang.org/x/time/rate"
)

type Limiter struct {
	mu      sync.Mutex
	buckets map[string]*clientBucket
	rate    rate.Limit
	burst   int
	cleanup time.Duration
}

type clientBucket struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func NewLimiter(r rate.Limit, b int, cleanupInterval time.Duration) *Limiter {
	l := &Limiter{
		buckets: make(map[string]*clientBucket),
		rate:    r,
		burst:   b,
		cleanup: cleanupInterval,
	}

	go l.startJanitor()
	return l
}

func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	bucket, exists := l.buckets[key]
	if !exists {
		bucket = &clientBucket{
			limiter:  rate.NewLimiter(l.rate, l.burst),
			lastSeen: time.Now(),
		}
		l.buckets[key] = bucket
	}
	bucket.lastSeen = time.Now()
	return bucket.limiter.Allow()
}

func (l *Limiter) startJanitor() {
	ticker := time.NewTicker(l.cleanup)
	for range ticker.C {
		l.mu.Lock()
		cutoff := time.Now().Add(-l.cleanup * 2)
		for k, v := range l.buckets {
			if v.lastSeen.Before(cutoff) {
				delete(l.buckets, k)
			}
		}
		l.mu.Unlock()
	}
}

// Middleware creates an HTTP rate limiting middleware on a key extractor.
func (l *Limiter) Middleware(keyFunc func(r *http.Request) string, retryAfterSeconds int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := keyFunc(r)
			if !l.Allow(key) {
				w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfterSeconds))
				httpx.WriteProblem(w, r, http.StatusTooManyRequests, "RATE_LIMIT_EXCEEDED",
					"Too Many Requests", "Rate limit exceeded. Please slow down and retry after the specified duration.",
					map[string]interface{}{"retry_after_seconds": retryAfterSeconds})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
