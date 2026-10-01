import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Waypoint ML Inference Service"
    API_V1_STR: str = "/api/v1"
    PORT: int = int(os.getenv("ML_PORT", "8000"))
    HOST: str = os.getenv("ML_HOST", "0.0.0.0")
    ENVIRONMENT: str = os.getenv("MODEL_ENV", "development")
    AVERAGE_SPEED_KMH: float = 40.0

    class Config:
        case_sensitive = True

settings = Settings()
