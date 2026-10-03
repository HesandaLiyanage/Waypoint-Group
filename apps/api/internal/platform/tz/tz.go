package tz

import (
	"time"
	_ "time/tzdata" // Embedded timezone database ensures correctness in slim containers
)

var (
	// Colombo represents the Asia/Colombo (UTC+05:30) timezone.
	Colombo *time.Location
)

func init() {
	loc, err := time.LoadLocation("Asia/Colombo")
	if err != nil {
		// Fallback fixed offset +05:30 if loading fails
		loc = time.FixedZone("Asia/Colombo", 5*3600+30*60)
	}
	Colombo = loc
}

// InColombo converts a UTC timestamp to Asia/Colombo.
func InColombo(t time.Time) time.Time {
	return t.In(Colombo)
}

// NowInColombo returns the current time in Asia/Colombo.
func NowInColombo() time.Time {
	return time.Now().In(Colombo)
}

// FormatISO returns an ISO-8601 formatted string with +05:30 offset.
func FormatISO(t time.Time) string {
	return InColombo(t).Format(time.RFC3339)
}
