from fastapi import APIRouter
from app.schemas.inference import (
    EtaPredictionRequest,
    EtaPredictionResponse,
    RouteOptimizationRequest,
    RouteOptimizationResponse,
)
from app.services.inference import InferenceService

router = APIRouter()

@router.post("/eta", response_model=EtaPredictionResponse, summary="Predict ETA between waypoints")
def predict_eta(request: EtaPredictionRequest):
    return InferenceService.predict_eta(request)

@router.post("/optimize-route", response_model=RouteOptimizationResponse, summary="Optimize waypoint sequence")
def optimize_route(request: RouteOptimizationRequest):
    return InferenceService.optimize_route(request)
