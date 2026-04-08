from __future__ import annotations

from dataclasses import dataclass
import time

try:
    import httpx
except ImportError:  # pragma: no cover - optional dependency fallback
    httpx = None

from .settings import TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_BASE_URL


@dataclass
class CacheEntry:
    value: object
    expires_at: float


class TmdbCatalogClient:
    def __init__(self) -> None:
        self._cache: dict[str, CacheEntry] = {}

    @property
    def enabled(self) -> bool:
        return bool(TMDB_API_KEY)

    def _cache_get(self, key: str) -> object | None:
        entry = self._cache.get(key)
        now = time.time()
        if entry and entry.expires_at > now:
            return entry.value
        if entry:
            self._cache.pop(key, None)
        return None

    def _cache_set(self, key: str, value: object, ttl_seconds: int) -> object:
        self._cache[key] = CacheEntry(value=value, expires_at=time.time() + ttl_seconds)
        return value

    def _request_json(self, path: str, params: dict[str, object]) -> dict:
        if not self.enabled or httpx is None:
            return {}

        request_params = {
            "api_key": TMDB_API_KEY,
            "language": "en-US",
            **params,
        }
        url = f"{TMDB_BASE_URL}{path}"

        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.get(url, params=request_params)
                response.raise_for_status()
                return response.json()
        except Exception:
            return {}

    def _genre_maps(self) -> tuple[dict[int, str], dict[int, str]]:
        cache_key = "tmdb_genre_maps"
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached  # type: ignore[return-value]

        movie_data = self._request_json("/genre/movie/list", {})
        tv_data = self._request_json("/genre/tv/list", {})
        movie_map = {int(item["id"]): str(item["name"]) for item in movie_data.get("genres", []) if "id" in item and "name" in item}
        tv_map = {int(item["id"]): str(item["name"]) for item in tv_data.get("genres", []) if "id" in item and "name" in item}
        return self._cache_set(cache_key, (movie_map, tv_map), ttl_seconds=3600)  # type: ignore[return-value]

    def available_genres(self) -> list[str]:
        if not self.enabled:
            return []

        movie_map, tv_map = self._genre_maps()
        names = sorted({*movie_map.values(), *tv_map.values()})
        return names

    def _fetch_actors(self, media_type: str, media_id: int) -> list[str]:
        cache_key = f"cast:{media_type}:{media_id}"
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached  # type: ignore[return-value]

        data = self._request_json(f"/{media_type}/{media_id}/credits", {})
        cast_list = data.get("cast", [])
        names = [str(person.get("name")) for person in cast_list[:5] if person.get("name")]
        return self._cache_set(cache_key, names, ttl_seconds=1800)  # type: ignore[return-value]

    def latest_titles(
        self,
        media_type: str = "all",
        genre: str | None = None,
        query: str | None = None,
        limit: int = 24,
    ) -> list[dict[str, object]]:
        if not self.enabled:
            return []

        normalized_type = media_type if media_type in {"all", "movie", "tv"} else "all"
        normalized_query = (query or "").strip()
        genre_filter = (genre or "").strip().lower()
        movie_map, tv_map = self._genre_maps()

        cache_key = f"latest:{normalized_type}:{genre_filter}:{normalized_query.lower()}:{limit}"
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached  # type: ignore[return-value]

        if normalized_query:
            if normalized_type == "movie":
                path = "/search/movie"
            elif normalized_type == "tv":
                path = "/search/tv"
            else:
                path = "/search/multi"
            data = self._request_json(path, {"query": normalized_query, "include_adult": "false", "page": 1})
        else:
            data = self._request_json(f"/trending/{normalized_type}/day", {"page": 1})

        items: list[dict[str, object]] = []
        for raw in data.get("results", []):
            raw_type = str(raw.get("media_type") or normalized_type)
            if raw_type not in {"movie", "tv"}:
                continue

            raw_id = raw.get("id")
            if not raw_id:
                continue

            title = str(raw.get("title") or raw.get("name") or "Untitled")
            genre_ids = [int(genre_id) for genre_id in raw.get("genre_ids", []) if genre_id is not None]
            genre_names = [
                (movie_map if raw_type == "movie" else tv_map).get(genre_id)
                for genre_id in genre_ids
            ]
            genre_names = [name for name in genre_names if name]
            if genre_filter and not any(genre_filter in name.lower() for name in genre_names):
                continue

            actors = self._fetch_actors(raw_type, int(raw_id))
            poster_path = raw.get("poster_path")
            backdrop_path = raw.get("backdrop_path")
            poster_url = f"{TMDB_IMAGE_BASE_URL}{poster_path}" if poster_path else None
            backdrop_url = f"{TMDB_IMAGE_BASE_URL}{backdrop_path}" if backdrop_path else None
            release_date = str(raw.get("release_date") or raw.get("first_air_date") or "")

            items.append(
                {
                    "external_id": int(raw_id),
                    "movie_id": int(raw_id),
                    "title": title,
                    "genres": genre_names,
                    "actors": actors,
                    "overview": str(raw.get("overview") or ""),
                    "release_date": release_date,
                    "media_type": raw_type,
                    "poster_url": poster_url,
                    "backdrop_url": backdrop_url,
                    "score": float(raw.get("vote_average") or 0.0) / 10.0,
                    "signal_source": "tmdb_trending",
                    "why_this": "Live trending feed from TMDB.",
                }
            )

            if len(items) >= limit:
                break

        return self._cache_set(cache_key, items, ttl_seconds=300)  # type: ignore[return-value]