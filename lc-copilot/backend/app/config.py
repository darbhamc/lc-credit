from pathlib import Path

from pydantic_settings import BaseSettings

ROOT = Path(__file__).resolve().parents[2]
SHARED = ROOT / "shared"


class Settings(BaseSettings):
    # SQLite by default so the repo runs with no infrastructure.
    # Point DATABASE_URL at Postgres in any shared environment.
    database_url: str = f"sqlite:///{ROOT / 'backend' / 'lc.db'}"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    cors_origins: str = "http://localhost:5173"
    upload_dir: str = str(ROOT / "backend" / "uploads")
    max_upload_mb: int = 20

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
