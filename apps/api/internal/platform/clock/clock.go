package clock

import (
	"sync"
	"time"

	"github.com/HesandaLiyanage/Waypoint-Group/apps/api/internal/platform/tz"
)

// Clock provides current time abstraction supporting simulated demo time.
type Clock interface {
	Now() time.Time
	SetSimulatedNow(t time.Time)
	Advance(d time.Duration)
	Reset()
}

type RealClock struct{}

func NewRealClock() *RealClock {
	return &RealClock{}
}

func (c *RealClock) Now() time.Time {
	return tz.NowInColombo()
}

func (c *RealClock) SetSimulatedNow(t time.Time) {}
func (c *RealClock) Advance(d time.Duration)     {}
func (c *RealClock) Reset()                      {}

// DemoClock allows advancing or setting arbitrary business time for testing and judge walkthroughs.
type DemoClock struct {
	mu        sync.RWMutex
	simulated *time.Time
}

func NewDemoClock(initial *time.Time) *DemoClock {
	c := &DemoClock{}
	if initial != nil {
		t := tz.InColombo(*initial)
		c.simulated = &t
	}
	return c
}

func (c *DemoClock) Now() time.Time {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.simulated != nil {
		return *c.simulated
	}
	return tz.NowInColombo()
}

func (c *DemoClock) SetSimulatedNow(t time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	val := tz.InColombo(t)
	c.simulated = &val
}

func (c *DemoClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.simulated == nil {
		now := tz.NowInColombo().Add(d)
		c.simulated = &now
	} else {
		next := c.simulated.Add(d)
		c.simulated = &next
	}
}

func (c *DemoClock) Reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.simulated = nil
}
