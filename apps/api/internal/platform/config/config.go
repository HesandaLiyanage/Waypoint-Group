package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Environment            string
	Host                   string
	Port                   string
	DatabaseURL            string
	JWTSecret              string
	DemoMode               bool
	MonsoonTravelFactor    float64 // planning buffer on travel time when calendar.csv flags monsoon
	MaxStopsPerTrip        int     // 0 = unlimited; keeps walkthrough trips short
	BusinessNow            string  // RFC3339 start of the business clock; must fall inside the official calendar
	MLServiceURL           string
	AllowedOrigins         []string
	FreshDepartDefault     string
	StyleTechDepartDefault string
	ReloadBufferMin        int
	MaxRequestBodyBytes    int64
	MaxPhotoBytes          int64
}

func Load() (*Config, error) {
	cfg := &Config{
		Environment:            getEnv("ENVIRONMENT", "development"),
		Host:                   getEnv("API_HOST", "0.0.0.0"),
		Port:                   getEnv("API_PORT", "8080"),
		DatabaseURL:            getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/waypoint_db?sslmode=disable"),
		JWTSecret:              getEnv("JWT_SECRET", "super-secret-jwt-key-change-in-production-32chars"),
		DemoMode:               getEnvBool("DEMO_MODE", false),
		MonsoonTravelFactor:    getEnvFloat("PLAN_MONSOON_TRAVEL_FACTOR", 1.15),
		MaxStopsPerTrip:        getEnvInt("PLAN_MAX_STOPS_PER_TRIP", 0),
		BusinessNow:            getEnv("BUSINESS_NOW", "2026-06-21T15:00:00+05:30"),
		MLServiceURL:           getEnv("ML_SERVICE_URL", "http://localhost:8000"),
		FreshDepartDefault:     getEnv("PLAN_FRESH_DEPART_DEFAULT", "03:30"),
		StyleTechDepartDefault: getEnv("PLAN_STYLETECH_DEPART_DEFAULT", "07:00"),
		ReloadBufferMin:        getEnvInt("RELOAD_BUFFER_MIN", 15),
		MaxRequestBodyBytes:    int64(getEnvInt("MAX_REQUEST_BODY_BYTES", 4*1024*1024)), // 4 MB: room for a 2 MB photo sent as base64
		MaxPhotoBytes:          int64(getEnvInt("MAX_PHOTO_BYTES", 2*1024*1024)),        // 2 MB
	}

	origins := getEnv("CORS_ALLOWED_ORIGINS", "*")
	for _, o := range strings.Split(origins, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			cfg.AllowedOrigins = append(cfg.AllowedOrigins, o)
		}
	}

	if len(cfg.JWTSecret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 32 characters long, got %d", len(cfg.JWTSecret))
	}

	return cfg, nil
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getEnvInt(key string, defaultVal int) int {
	if val := os.Getenv(key); val != "" {
		if n, err := strconv.Atoi(val); err == nil {
			return n
		}
	}
	return defaultVal
}

func getEnvBool(key string, defaultVal bool) bool {
	if val := os.Getenv(key); val != "" {
		low := strings.ToLower(val)
		return low == "true" || low == "1" || low == "yes"
	}
	return defaultVal
}

func getEnvFloat(key string, defaultVal float64) float64 {
	if val := os.Getenv(key); val != "" {
		if f, err := strconv.ParseFloat(val, 64); err == nil && f >= 1 {
			return f
		}
	}
	return defaultVal
}
