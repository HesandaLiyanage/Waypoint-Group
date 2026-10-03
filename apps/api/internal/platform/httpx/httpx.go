package httpx

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strings"
	"time"
)

type contextKey string

const (
	RequestIDKey contextKey = "request_id"
	UserKey      contextKey = "auth_user"
)

// ProblemDetails represents an RFC 9457 compliant error payload.
type ProblemDetails struct {
	Type      string                 `json:"type"`
	Title     string                 `json:"title"`
	Status    int                    `json:"status"`
	Code      string                 `json:"code"`
	RequestID string                 `json:"request_id"`
	Detail    string                 `json:"detail,omitempty"`
	Params    map[string]interface{} `json:"params,omitempty"`
}

// WriteJSON sends a JSON response with status code.
func WriteJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		_ = json.NewEncoder(w).Encode(data)
	}
}

// WriteProblem responds with an RFC 9457 application/problem+json payload.
func WriteProblem(w http.ResponseWriter, r *http.Request, status int, code, title, detail string, params map[string]interface{}) {
	reqID := GetRequestID(r)
	prob := ProblemDetails{
		Type:      fmt.Sprintf("https://waypoint.lk/errors/%s", strings.ToLower(strings.ReplaceAll(code, "_", "-"))),
		Title:     title,
		Status:    status,
		Code:      code,
		RequestID: reqID,
		Detail:    detail,
		Params:    params,
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(prob)
}

// GetRequestID retrieves request ID from request context or generates a fallback.
func GetRequestID(r *http.Request) string {
	if val, ok := r.Context().Value(RequestIDKey).(string); ok && val != "" {
		return val
	}
	if val := r.Header.Get("X-Request-Id"); val != "" {
		return val
	}
	return newRandomID()
}

func newRandomID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return "req-" + hex.EncodeToString(b)
}

// RequestIDMiddleware injects an X-Request-Id header and context value.
func RequestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := r.Header.Get("X-Request-Id")
		if reqID == "" {
			reqID = newRandomID()
		}
		w.Header().Set("X-Request-Id", reqID)
		ctx := context.WithValue(r.Context(), RequestIDKey, reqID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// SecurityHeadersMiddleware sets standard modern security headers.
func SecurityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		next.ServeHTTP(w, r)
	})
}

// MaxBodyBytesMiddleware limits request body sizes.
func MaxBodyBytesMiddleware(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			next.ServeHTTP(w, r)
		})
	}
}

// LoggingMiddleware logs HTTP requests in structured JSON with latency.
func LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		latency := time.Since(start)

		slog.Info("http_request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rw.status,
			"latency_ms", latency.Milliseconds(),
			"request_id", GetRequestID(r),
			"ip", r.RemoteAddr,
		)
	})
}

// RecovererMiddleware safely recovers from panics and returns 500 ProblemDetails.
func RecovererMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic_recovered",
					"error", fmt.Sprintf("%v", rec),
					"stack", string(debug.Stack()),
					"request_id", GetRequestID(r),
				)
				WriteProblem(w, r, http.StatusInternalServerError, "INTERNAL_ERROR",
					"Internal Server Error", "An unexpected server error occurred", nil)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}
