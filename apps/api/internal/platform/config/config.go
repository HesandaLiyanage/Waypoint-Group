package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Environment             string
	Host                    string
	Port                    string
	DatabaseURL             string
	JWTSecret               string
	DemoMode                bool
	MLServiceURL            string
	AllowedOrigins          []string
	FreshDepartDefault      string
	StyleTechDepartDefault  string
	ReloadBufferMin         int
	MaxRequestBodyBytes     int64
	MaxPhotoBytes           int64
}

func Load() (*Config, error) {
	cfg := &Config{
		Environment:            getEnv("ENVIRONMENT", "development"),
		Host:                   getEnv("API_HOST", "0.0.0.0"),
		Port:                   getEnv("API_PORT", "8080"),
		DatabaseURL:            getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/waypoint_db?sslmode=disable"),
		JWTSecret:              getEnv("JWT_SECRET", "super-secret-jwt-key-change-in-production-32chars"),
		DemoMode:               getEnvBool("DEMO_MODE", true),
		MLServiceURL:           getEnv("ML_SERVICE_URL", "http://localhost:8000"),
		FreshDepartDefault:     getEnv("PLAN_FRESH_DEPART_DEFAULT", "03:30"),
		StyleTechDepartDefault: getEnv("PLAN_STYLETECH_DEPART_DEFAULT", "07:00"),
		ReloadBufferMin:        getEnvInt("RELOAD_BUFFER_MIN", 15),
		MaxRequestBodyBytes:    int64(getEnvInt("MAX_REQUEST_BODY_BYTES", 1024*1024)), // 1 MB
		MaxPhotoBytes:          int64(getEnvInt("MAX_PHOTO_BYTES", 2*1024*1024)),     // 2 MB
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
