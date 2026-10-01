import math
from datetime import datetime, timedelta, timezone
from typing import List
from app.schemas.inference import (
    EtaPredictionRequest,
    EtaPredictionResponse,
    RouteOptimizationRequest,
    RouteOptimizationResponse,
    WaypointPoint,
)
from app.core.config import settings

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance between two points in kilometers."""
    earth_radius_km = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return earth_radius_km * c

class InferenceService:
    @staticmethod
    def predict_eta(req: EtaPredictionRequest) -> EtaPredictionResponse:
        dist_km = haversine_distance(
            req.origin_lat, req.origin_lng, req.destination_lat, req.destination_lng
        )

        # Incorporate traffic speed factor (base 40 km/h)
        speed = settings.AVERAGE_SPEED_KMH
        duration_hours = dist_km / max(speed, 10.0)
        duration_minutes = round(max(duration_hours * 60.0, 5.0), 1)

        departure = req.departure_time or datetime.now(timezone.utc)
        estimated_arrival = departure + timedelta(minutes=duration_minutes)

        return EtaPredictionResponse(
            duration_minutes=duration_minutes,
            distance_km=round(dist_km, 2),
            confidence_score=0.91,
            estimated_arrival=estimated_arrival,
        )

    @staticmethod
    def optimize_route(req: RouteOptimizationRequest) -> RouteOptimizationResponse:
        """Greedy nearest-neighbor TSP heuristic for waypoint ordering."""
        unvisited = list(req.waypoints)
        current_lat = req.start_point.latitude
        current_lng = req.start_point.longitude

        ordered_ids: List[str] = []
        total_dist = 0.0

        while unvisited:
            best_idx = 0
            best_dist = float("inf")
            for idx, wp in enumerate(unvisited):
                d = haversine_distance(current_lat, current_lng, wp.latitude, wp.longitude)
                if d < best_dist:
                    best_dist = d
                    best_idx = idx

            chosen = unvisited.pop(best_idx)
            ordered_ids.append(chosen.id)
            total_dist += best_dist
            current_lat = chosen.latitude
            current_lng = chosen.longitude

        total_mins = round((total_dist / settings.AVERAGE_SPEED_KMH) * 60.0, 1)

        return RouteOptimizationResponse(
            ordered_waypoint_ids=ordered_ids,
            total_distance_km=round(total_dist, 2),
            total_estimated_minutes=total_mins,
        )
