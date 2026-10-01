package config

import (
	"os"
	"strings"
)

type Config struct {
	Port               string
	Host               string
	DatabaseURL        string
	JWTSecret          string
	AllowedOrigins     []string
	MLServiceURL       string
	Environment        string
}

func Load() *Config {
	port := getEnv("API_PORT", "8080")
	host := getEnv("API_HOST", "0.0.0.0")
	dbURL := getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/waypoint_db?sslmode=disable")
	jwtSecret := getEnv("JWT_SECRET", "super-secret-jwt-key-change-in-production-32chars")
	originsStr := getEnv("CORS_ALLOWED_ORIGINS", "*")
	mlURL := getEnv("ML_SERVICE_URL", "http://localhost:8000")
	env := getEnv("ENVIRONMENT", "development")

	var origins []string
	if originsStr == "*" {
		origins = []string{"*"}
	} else {
		for _, o := range strings.Split(originsStr, ",") {
			origins = append(origins, strings.TrimSpace(o))
		}
	}

	return &Config{
		Port:           port,
		Host:           host,
		DatabaseURL:    dbURL,
		JWTSecret:      jwtSecret,
		AllowedOrigins: origins,
		MLServiceURL:   mlURL,
		Environment:    env,
	}
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
