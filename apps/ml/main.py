import os
import glob
import math
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    import joblib
except ImportError:
    joblib = None

app = FastAPI(
    title="Waypoint ML Inference Service",
    version="1.0.0",
    description="Dedicated lightweight ML service for trip service duration and late delivery risk prediction"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load trained models if present
MODEL_DIR = os.getenv("MODEL_DIR", "model")
models = {}
if joblib and os.path.exists(MODEL_DIR):
    for model_path in glob.glob(os.path.join(MODEL_DIR, "*.joblib")):
        name = os.path.splitext(os.path.basename(model_path))[0]
        try:
            models[name] = joblib.load(model_path)
            print(f"Loaded ML model: {name}")
        except Exception as e:
            print(f"Failed to load model {model_path}: {e}")

class StopFeatures(BaseModel):
    stop_id: str
    order_id: Optional[str] = None
    brand: str
    dock_type: str
    service_allowance_min: float
    unit_count: int = 1
    weight_kg: float = 0.0
    volume_m3: float = 0.0
    planned_arrival_min: float = 0.0
    window_close_min: float = 0.0
    road_class: str = "A"
    monsoon: int = 0

class StopPrediction(BaseModel):
    stop_id: str
    service_min: float
    late_prob: float
    source: str

class BatchPredictionRequest(BaseModel):
    stops: List[StopFeatures]

class BatchPredictionResponse(BaseModel):
    predictions: List[StopPrediction]

@app.get("/healthz", tags=["Ops"])
def healthz():
    return {
        "status": "ok",
        "service": "waypoint-ml",
        "models_loaded": list(models.keys())
    }

@app.get("/health", tags=["Ops"])
def health():
    return healthz()

@app.post("/predict/stops", response_model=BatchPredictionResponse, tags=["Inference"])
def predict_stops(req: BatchPredictionRequest):
    results = []
    has_model = "service_time" in models and "late_risk" in models

    for f in req.stops:
        if has_model:
            try:
                # If Datathon trained models are plugged in
                pred_service = float(models["service_time"].predict([[f.unit_count, f.weight_kg, f.volume_m3]])[0])
                pred_late = float(models["late_risk"].predict_proba([[f.planned_arrival_min, f.window_close_min, f.monsoon]])[0][1])
                results.append(StopPrediction(
                    stop_id=f.stop_id,
                    service_min=round(pred_service, 1),
                    late_prob=round(pred_late, 3),
                    source="model"
                ))
                continue
            except Exception:
                pass # fallback to heuristic below

        # Heuristic Predictor (Section 13)
        # Service min = service_allowance_min * unit-size factor
        unit_factor = 1.0 + min(0.4, float(f.unit_count) / 250.0 * 0.1)
        if f.dock_type == "street":
            unit_factor += 0.05
        service_min = round(f.service_allowance_min * unit_factor, 1)

        # Late probability = logistic of slack (window_close - ETA) scaled by road_class and monsoon
        slack = f.window_close_min - f.planned_arrival_min
        risk_multiplier = 1.0
        if f.monsoon == 1:
            risk_multiplier *= 1.25
        if f.road_class == "B":
            risk_multiplier *= 1.15
        elif f.road_class == "C":
            risk_multiplier *= 1.35

        # Logistic curve: slack > 30min -> ~0.02, slack = 0 -> ~0.50, slack < -15min -> ~0.90
        # z = - (slack / 15.0) * risk_multiplier
        z = -(slack / 15.0) * risk_multiplier
        # Clamp z to avoid overflow
        z = max(-10.0, min(10.0, z))
        late_prob = 1.0 / (1.0 + math.exp(-z))

        results.append(StopPrediction(
            stop_id=f.stop_id,
            service_min=service_min,
            late_prob=round(late_prob, 3),
            source="rule"
        ))

    return BatchPredictionResponse(predictions=results)
