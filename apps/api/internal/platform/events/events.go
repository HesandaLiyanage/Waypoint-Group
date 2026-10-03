package events

import (
	"context"
	"sync"
	"time"
)

type Event struct {
	Type      string      `json:"type"`
	Payload   interface{} `json:"payload"`
	CreatedAt time.Time   `json:"created_at"`
}

type Handler func(ctx context.Context, e Event) error

type Bus struct {
	mu       sync.RWMutex
	handlers map[string][]Handler
}

func NewBus() *Bus {
	return &Bus{
		handlers: make(map[string][]Handler),
	}
}

func (b *Bus) Subscribe(eventType string, h Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers[eventType] = append(b.handlers[eventType], h)
}

func (b *Bus) Publish(ctx context.Context, e Event) {
	b.mu.RLock()
	handlers := b.handlers[e.Type]
	b.mu.RUnlock()

	for _, h := range handlers {
		go func(handler Handler) {
			_ = handler(context.Background(), e)
		}(h)
	}
}
