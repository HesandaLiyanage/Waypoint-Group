package eta

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/sony/gobreaker"
)

type StopFeatures struct {
	StopID              string  `json:"stop_id"`
	OrderID             string  `json:"order_id,omitempty"`
	Brand               string  `json:"brand"`
	DockType            string  `json:"dock_type"`
	ServiceAllowanceMin float64 `json:"service_allowance_min"`
	UnitCount           int     `json:"unit_count"`
	WeightKg            float64 `json:"weight_kg"`
	VolumeM3            float64 `json:"volume_m3"`
	PlannedArrivalMin   float64 `json:"planned_arrival_min"`
	WindowCloseMin      float64 `json:"window_close_min"`
	RoadClass           string  `json:"road_class"`
	Monsoon             int     `json:"monsoon"`
}

type Prediction struct {
	StopID     string  `json:"stop_id"`
	ServiceMin float64 `json:"service_min"`
	LateProb   float64 `json:"late_prob"`
	Source     string  `json:"source"` // "model" or "rule"
}

type Predictor interface {
	Predict(ctx context.Context, features []StopFeatures) ([]Prediction, error)
}

// HeuristicPredictor provides deterministic heuristic predictions (Section 13).
type HeuristicPredictor struct{}

func NewHeuristicPredictor() *HeuristicPredictor {
	return &HeuristicPredictor{}
}

func (h *HeuristicPredictor) Predict(ctx context.Context, features []StopFeatures) ([]Prediction, error) {
	predictions := make([]Prediction, len(features))
	for i, f := range features {
		// Service duration = service_allowance_min * unit-size factor
		unitFactor := 1.0 + math.Min(0.4, float64(f.UnitCount)/250.0*0.1)
		if f.DockType == "street" {
			unitFactor += 0.05
		}
		serviceMin := math.Round(f.ServiceAllowanceMin*unitFactor*10) / 10

		// Late probability = logistic of slack (window_close - ETA) scaled by road_class and monsoon
		slack := f.WindowCloseMin - f.PlannedArrivalMin
		riskMult := 1.0
		if f.Monsoon == 1 {
			riskMult *= 1.25
		}
		switch f.RoadClass {
		case "B":
			riskMult *= 1.15
		case "C":
			riskMult *= 1.35
		}

		z := -(slack / 15.0) * riskMult
		if z > 10.0 {
			z = 10.0
		} else if z < -10.0 {
			z = -10.0
		}
		lateProb := 1.0 / (1.0 + math.Exp(-z))

		predictions[i] = Prediction{
			StopID:     f.StopID,
			ServiceMin: serviceMin,
			LateProb:   math.Round(lateProb*1000) / 1000,
			Source:     "rule",
		}
	}
	return predictions, nil
}

// HTTPPredictor calls the external ML service via circuit breaker with tight 300ms timeout.
// Falls back to HeuristicPredictor on failure.
type HTTPPredictor struct {
	client    *http.Client
	mlURL     string
	breaker   *gobreaker.CircuitBreaker
	heuristic *HeuristicPredictor
}

func NewHTTPPredictor(mlURL string) *HTTPPredictor {
	st := gobreaker.Settings{
		Name:        "ml-service-breaker",
		MaxRequests: 3,
		Interval:    10 * time.Second,
		Timeout:     5 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return counts.Requests >= 3 && failureRatio >= 0.6
		},
	}

	return &HTTPPredictor{
		client: &http.Client{
			Timeout: 300 * time.Millisecond,
		},
		mlURL:     mlURL,
		breaker:   gobreaker.NewCircuitBreaker(st),
		heuristic: NewHeuristicPredictor(),
	}
}

type mlRequest struct {
	Stops []StopFeatures `json:"stops"`
}

type mlResponse struct {
	Predictions []Prediction `json:"predictions"`
}

func (p *HTTPPredictor) Predict(ctx context.Context, features []StopFeatures) ([]Prediction, error) {
	if len(features) == 0 {
		return nil, nil
	}

	result, err := p.breaker.Execute(func() (interface{}, error) {
		reqBody, err := json.Marshal(mlRequest{Stops: features})
		if err != nil {
			return nil, err
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.mlURL+"/predict/stops", bytes.NewBuffer(reqBody))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := p.client.Do(req)
		if err != nil {
			return nil, err
		}
		defer func() { _ = resp.Body.Close() }()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("ml service returned status %d", resp.StatusCode)
		}

		var mlResp mlResponse
		if err := json.NewDecoder(resp.Body).Decode(&mlResp); err != nil {
			return nil, err
		}

		return mlResp.Predictions, nil
	})

	if err != nil {
		// Circuit breaker tripped or ML call failed -> fallback to heuristic with source="rule"
		return p.heuristic.Predict(ctx, features)
	}

	return result.([]Prediction), nil
}
