package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/api"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/eta"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/ordering"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/auth"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/clock"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/config"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/db"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/httpx"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/idempotency"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/outbox"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/ratelimit"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/sse"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/server"
	syncpkg "github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/sync"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/seed"
	"golang.org/x/time/rate"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "FATAL: failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	var logLevel slog.Level
	if cfg.Environment == "development" {
		logLevel = slog.LevelDebug
	} else {
		logLevel = slog.LevelInfo
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel}))
	slog.SetDefault(logger)

	slog.Info("Starting Waypoint Modular Monolith API...",
		"env", cfg.Environment,
		"host", cfg.Host,
		"port", cfg.Port,
		"demo_mode", cfg.DemoMode,
	)

	// Database initialization & embedded migrations
	ctx := context.Background()
	if err := db.RunMigrations(cfg.DatabaseURL); err != nil {
		slog.Error("failed to run database migrations", "error", err)
		os.Exit(1)
	}
	slog.Info("Database migrations applied successfully")

	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to initialize database pool", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	slog.Info("Database connection pool established")

	// Advisory-locked seed loading
	seedDataDir := os.Getenv("SEED_DATA_DIR")
	if seedDataDir == "" {
		seedDataDir = "db/seed/data"
	}
	if err := seed.SeedDatabase(ctx, pool, seedDataDir); err != nil {
		slog.Warn("seed database warning", "error", err)
	} else {
		slog.Info("Database seed verified and loaded")
	}

	// Domain components
	initialTime, _ := time.Parse(time.RFC3339, "2026-10-05T03:00:00+05:30")
	demoClock := clock.NewDemoClock(&initialTime)
	tokens := auth.NewTokenService(cfg.JWTSecret)
	outboxWriter := outbox.NewWriter()

	outboxProcessor := outbox.NewProcessor(pool, 2)
	outboxProcessor.Start(ctx)
	defer outboxProcessor.Stop()

	sseHub := sse.NewHub(pool)
	etaPred := eta.NewHTTPPredictor(cfg.MLServiceURL)
	orderingSvc := ordering.NewService(pool, demoClock)
	syncSvc := syncpkg.NewSyncService(pool, demoClock, outboxWriter, sseHub)

	srv := server.NewServer(
		pool,
		cfg,
		demoClock,
		tokens,
		orderingSvc,
		syncSvc,
		etaPred,
		sseHub,
		outboxWriter,
	)

	strictHandler := api.NewStrictHandlerWithOptions(
		srv,
		nil,
		api.StrictHTTPServerOptions{
			RequestErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
				httpx.WriteProblem(w, r, http.StatusBadRequest, "BAD_REQUEST", "Bad Request", err.Error(), nil)
			},
			ResponseErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
				httpx.WriteProblem(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "Internal Server Error", err.Error(), nil)
			},
		},
	)

	mux := http.NewServeMux()

	// Direct root health & ready probes
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := pool.Ping(r.Context()); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"status":"unavailable"}`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ready"}`))
	})

	// Mount contract-generated OpenAPI routes under /api/v1
	api.HandlerFromMuxWithBaseURL(strictHandler, mux, "/api/v1")

	// Middleware pipeline
	corsHandler := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id, Idempotency-Key, Last-Event-ID, If-Match")
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Expose-Headers", "ETag, X-Request-Id, Retry-After, Idempotent-Replay")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}

	limiter := ratelimit.NewLimiter(rate.Limit(50), 100, 5*time.Minute)
	rateLimitKeyFunc := func(r *http.Request) string {
		if u := auth.GetUser(r.Context()); u != nil {
			return u.ID.String()
		}
		return r.RemoteAddr
	}

	idempStore := idempotency.NewPostgresStore(pool)

	rootHandler := httpx.RecovererMiddleware(
		httpx.RequestIDMiddleware(
			corsHandler(
				httpx.SecurityHeadersMiddleware(
					httpx.MaxBodyBytesMiddleware(cfg.MaxRequestBodyBytes)(
						httpx.LoggingMiddleware(
							tokens.Middleware(
								limiter.Middleware(rateLimitKeyFunc, 1)(
									idempotency.Middleware(idempStore)(
										mux,
									),
								),
							),
						),
					),
				),
			),
		),
	)

	httpServer := &http.Server{
		Addr:              fmt.Sprintf("%s:%s", cfg.Host, cfg.Port),
		Handler:           rootHandler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		IdleTimeout:       120 * time.Second,
		// WriteTimeout is left 0 to allow long-lived SSE streaming
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		slog.Info("Waypoint API HTTP server listening", "addr", httpServer.Addr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server fatal error", "error", err)
			os.Exit(1)
		}
	}()

	<-stop
	slog.Info("Shutting down API server gracefully...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		slog.Error("server shutdown failed", "error", err)
	}
	slog.Info("Server gracefully stopped")
}
