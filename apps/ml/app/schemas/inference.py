from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

class EtaPredictionRequest(BaseModel):
    origin_lat: float = Field(..., description="Latitude of origin")
    origin_lng: float = Field(..., description="Longitude of origin")
    destination_lat: float = Field(..., description="Latitude of destination")
    destination_lng: float = Field(..., description="Longitude of destination")
    departure_time: Optional[datetime] = None

class EtaPredictionResponse(BaseModel):
    duration_minutes: float
    distance_km: float
    confidence_score: float
    estimated_arrival: datetime

class WaypointPoint(BaseModel):
    id: str
    latitude: float
    longitude: float

class RouteOptimizationRequest(BaseModel):
    start_point: WaypointPoint
    waypoints: List[WaypointPoint]

class RouteOptimizationResponse(BaseModel):
    ordered_waypoint_ids: List[str]
    total_distance_km: float
    total_estimated_minutes: float
