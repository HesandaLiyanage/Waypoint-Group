package db

import (
	"context"
	"fmt"
	"time"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/migrations"
	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool initializes a pgx connection pool tuned for small server instances.
func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database URL: %w", err)
	}

	// Single small server limits: max 10 connections
	config.MaxConns = 10
	config.MinConns = 2
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute
	config.HealthCheckPeriod = 1 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Verify connection
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return pool, nil
}

// RunMigrations executes embedded Goose migrations against PostgreSQL.
func RunMigrations(databaseURL string) error {
	return migrations.Run(databaseURL)
}
