# Waypoint ML Inference Service

FastAPI-powered machine learning inference service for Waypoint operations.

## Features
- **ETA Prediction**: Predict travel duration and estimated time of arrival based on coordinates and route parameters.
- **Route Optimization**: Nearest-neighbor TSP heuristic for multi-stop waypoint route sequencing.
- **Health Check**: High-availability diagnostics at `/health`.

## Running Locally

```bash
cd apps/ml
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
