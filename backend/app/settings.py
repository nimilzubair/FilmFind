import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]


def _load_local_env() -> None:
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


_load_local_env()

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in ("http://localhost:5173", "http://127.0.0.1:5173")
    if origin.strip()
]

# FastAPI CORS does not support wildcard hosts in allow_origins.
# Use regex for preview deployments like https://my-app-abc123.vercel.app.
ALLOWED_ORIGIN_REGEX = os.getenv("ALLOWED_ORIGIN_REGEX", r"https://.*\.vercel\.app")

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "").strip()
TMDB_READ_ACCESS_TOKEN = os.getenv("TMDB_READ_ACCESS_TOKEN", "").strip()
TMDB_BASE_URL = os.getenv("TMDB_BASE_URL", "https://api.themoviedb.org/3").rstrip("/")
TMDB_IMAGE_BASE_URL = os.getenv("TMDB_IMAGE_BASE_URL", "https://image.tmdb.org/t/p/w500").rstrip("/")
