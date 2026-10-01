package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/config"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/modules/auth"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/modules/ml"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/modules/sync"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/modules/waypoint"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/middleware"
	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/response"
)

func main() {
	cfg := config.Load()
	log.Printf("Starting Waypoint Modular Monolith API in %s mode...", cfg.Environment)

	// Initialize modular handlers
	authHandler := auth.NewHandler(cfg.JWTSecret)
	waypointHandler := waypoint.NewHandler()
	syncHandler := sync.NewHandler()
	mlHandler := ml.NewHandler(cfg.MLServiceURL)

	mux := http.NewServeMux()

	// System Health
	mux.HandleFunc("GET /api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		response.JSON(w, http.StatusOK, map[string]interface{}{
			"status":    "ok",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
			"service":   "waypoint-api",
			"version":   "1.0.0",
		})
	})

	// Auth Endpoints
	mux.HandleFunc("POST /api/v1/auth/login", authHandler.Login)
	mux.HandleFunc("GET /api/v1/auth/me", authHandler.GetCurrentUser)

	// Waypoints CRUD
	mux.HandleFunc("GET /api/v1/waypoints", waypointHandler.ListWaypoints)
	mux.HandleFunc("POST /api/v1/waypoints", waypointHandler.CreateWaypoint)
	mux.HandleFunc("GET /api/v1/waypoints/{id}", waypointHandler.GetWaypoint)
	mux.HandleFunc("PATCH /api/v1/waypoints/{id}/status", waypointHandler.UpdateStatus)

	// Offline-First Sync Endpoints
	mux.HandleFunc("POST /api/v1/sync/push", syncHandler.Push)
	mux.HandleFunc("GET /api/v1/sync/pull", syncHandler.Pull)

	// ML Inference
	mux.HandleFunc("POST /api/v1/ml/eta", mlHandler.PredictEta)

	// Apply Middlewares
	handler := middleware.Logging(middleware.CORS(cfg.AllowedOrigins)(mux))

	server := &http.Server{
		Addr:         fmt.Sprintf("%s:%s", cfg.Host, cfg.Port),
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown listener
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("Waypoint Modular Monolith listening on %s", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-stop
	log.Println("Shutting down API server gracefully...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server shutdown failed: %v", err)
	}

	log.Println("Server gracefully stopped.")
}
