package outbox

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Message struct {
	ID          int64           `json:"id"`
	Topic       string          `json:"topic"`
	Payload     json.RawMessage `json:"payload"`
	DedupeKey   *string         `json:"dedupe_key"`
	AvailableAt time.Time       `json:"available_at"`
	Attempts    int             `json:"attempts"`
}

type Handler func(ctx context.Context, msg Message) error

// Writer assists in persisting outbox messages inside existing database transactions.
type Writer struct{}

func NewWriter() *Writer {
	return &Writer{}
}

// Write enqueues an outbox entry within the provided database transaction.
func (w *Writer) Write(ctx context.Context, tx pgx.Tx, topic string, payload interface{}, dedupeKey *string) error {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal outbox payload: %w", err)
	}

	query := `
		INSERT INTO outbox (topic, payload, dedupe_key, available_at, attempts, created_at)
		VALUES ($1, $2, $3, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP)
		ON CONFLICT (dedupe_key) DO NOTHING
	`
	_, err = tx.Exec(ctx, query, topic, payloadBytes, dedupeKey)
	return err
}

// Processor manages the background worker pool processing outbox messages.
type Processor struct {
	pool       *pgxpool.Pool
	handlers   map[string]Handler
	mu         sync.RWMutex
	stopChan   chan struct{}
	workerWg   sync.WaitGroup
	numWorkers int
}

func NewProcessor(pool *pgxpool.Pool, numWorkers int) *Processor {
	return &Processor{
		pool:       pool,
		handlers:   make(map[string]Handler),
		stopChan:   make(chan struct{}),
		numWorkers: numWorkers,
	}
}

func (p *Processor) Register(topic string, h Handler) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.handlers[topic] = h
}

func (p *Processor) Start(ctx context.Context) {
	slog.Info("Starting outbox background workers", "workers", p.numWorkers)
	for i := 0; i < p.numWorkers; i++ {
		p.workerWg.Add(1)
		go p.workerLoop(ctx, i)
	}
}

func (p *Processor) Stop() {
	close(p.stopChan)
	p.workerWg.Wait()
	slog.Info("Outbox workers gracefully stopped")
}

func (p *Processor) workerLoop(ctx context.Context, workerID int) {
	defer p.workerWg.Done()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-p.stopChan:
			return
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.processBatch(ctx, workerID)
		}
	}
}

func (p *Processor) processBatch(ctx context.Context, workerID int) {
	// Claim up to 10 rows with FOR UPDATE SKIP LOCKED
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	query := `
		SELECT id, topic, payload, dedupe_key, available_at, attempts
		FROM outbox
		WHERE done_at IS NULL
		  AND available_at <= CURRENT_TIMESTAMP
		  AND (locked_until IS NULL OR locked_until < CURRENT_TIMESTAMP)
		  AND attempts < 8
		ORDER BY id ASC
		LIMIT 10
		FOR UPDATE SKIP LOCKED
	`

	rows, err := tx.Query(ctx, query)
	if err != nil {
		return
	}

	var messages []Message
	for rows.Next() {
		var msg Message
		if err := rows.Scan(&msg.ID, &msg.Topic, &msg.Payload, &msg.DedupeKey, &msg.AvailableAt, &msg.Attempts); err == nil {
			messages = append(messages, msg)
		}
	}
	rows.Close()

	if len(messages) == 0 {
		return
	}

	// Lock claimed messages for 30 seconds
	lockUntil := time.Now().Add(30 * time.Second)
	for _, m := range messages {
		_, _ = tx.Exec(ctx, `UPDATE outbox SET locked_until = $1 WHERE id = $2`, lockUntil, m.ID)
	}

	if err := tx.Commit(ctx); err != nil {
		return
	}

	// Process each message
	for _, m := range messages {
		p.mu.RLock()
		handler, exists := p.handlers[m.Topic]
		p.mu.RUnlock()

		if !exists {
			// Mark done if no handler exists
			_, _ = p.pool.Exec(ctx, `UPDATE outbox SET done_at = CURRENT_TIMESTAMP WHERE id = $1`, m.ID)
			continue
		}

		err := handler(ctx, m)
		if err == nil {
			_, _ = p.pool.Exec(ctx, `UPDATE outbox SET done_at = CURRENT_TIMESTAMP, locked_until = NULL WHERE id = $1`, m.ID)
		} else {
			backoff := time.Duration(1<<m.Attempts) * 5 * time.Second
			nextTry := time.Now().Add(backoff)
			_, _ = p.pool.Exec(ctx, `
				UPDATE outbox
				SET attempts = attempts + 1,
				    available_at = $1,
				    locked_until = NULL,
				    last_error = $2
				WHERE id = $3
			`, nextTry, err.Error(), m.ID)
		}
	}
}
