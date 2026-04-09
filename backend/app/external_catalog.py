from __future__ import annotations

from dataclasses import dataclass
import time

try:
    import httpx
except ImportError:  # pragma: no cover - optional dependency fallback
    httpx = None

from .settings import TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_BASE_URL, TMDB_READ_ACCESS_TOKEN


@dataclass
class CacheEntry:
    value: object
    expires_at: float


class TmdbCatalogClient:
    def __init__(self) -> None:
        self._cache: dict[str, CacheEntry] = {}
        self._client = httpx.Client(timeout=6.0) if httpx is not None else None

    @property
    def enabled(self) -> bool:
        return bool(TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY)

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
            "language": "en-US",
            **params,
        }
        request_headers: dict[str, str] = {}

        # Prefer TMDB v4 bearer token when available, with API key fallback.
        if TMDB_READ_ACCESS_TOKEN:
            request_headers["Authorization"] = f"Bearer {TMDB_READ_ACCESS_TOKEN}"
        elif TMDB_API_KEY:
            request_params["api_key"] = TMDB_API_KEY

        url = f"{TMDB_BASE_URL}{path}"

        try:
            if self._client is None:
                return {}

            response = self._client.get(url, params=request_params, headers=request_headers)
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

    def _image_url(self, path: str | None) -> str | None:
        if not path:
            return None
        return f"{TMDB_IMAGE_BASE_URL}{path}"

    def _format_result_item(self, raw: dict[str, object], fallback_media_type: str = "movie") -> dict[str, object] | None:
        raw_id = raw.get("id")
        if not raw_id:
            return None

        raw_type = str(raw.get("media_type") or fallback_media_type)
        if raw_type not in {"movie", "tv"}:
            return None

        movie_map, tv_map = self._genre_maps()
        title = str(raw.get("title") or raw.get("name") or "Untitled")
        genre_ids = [int(genre_id) for genre_id in raw.get("genre_ids", []) if genre_id is not None]
        genre_names = [
            (movie_map if raw_type == "movie" else tv_map).get(genre_id)
            for genre_id in genre_ids
        ]
        genre_names = [name for name in genre_names if name]

        poster_url = self._image_url(raw.get("poster_path"))
        backdrop_url = self._image_url(raw.get("backdrop_path"))
        release_date = str(raw.get("release_date") or raw.get("first_air_date") or "")

        return {
            "external_id": int(raw_id),
            "movie_id": int(raw_id),
            "title": title,
            "genres": genre_names,
            "actors": [],
            "overview": str(raw.get("overview") or ""),
            "release_date": release_date,
            "media_type": raw_type,
            "poster_url": poster_url,
            "backdrop_url": backdrop_url,
            "score": float(raw.get("vote_average") or 0.0),
            "signal_source": "tmdb_trending",
            "why_this": "Live TMDB item.",
        }

    def _collect_items_from_paths(
        self,
        paths_with_type: list[tuple[str, str]],
        genre_filter: str,
        limit: int,
        extra_params: dict[str, object] | None = None,
    ) -> list[dict[str, object]]:
        items: list[dict[str, object]] = []
        seen_ids: set[int] = set()

        for path, fallback_type in paths_with_type:
            data = self._request_json(path, extra_params or {"page": 1})
            for raw in data.get("results", []):
                formatted = self._format_result_item(raw, fallback_media_type=fallback_type)
                if not formatted:
                    continue

                item_id = int(formatted["movie_id"])
                if item_id in seen_ids:
                    continue

                if genre_filter:
                    item_genres = [str(name).lower() for name in formatted.get("genres", [])]
                    if not any(genre_filter in genre_name for genre_name in item_genres):
                        continue

                seen_ids.add(item_id)
                items.append(formatted)
                if len(items) >= limit:
                    return items

        return items

    def search_titles(self, media_type: str = "all", query: str = "", limit: int = 24) -> list[dict[str, object]]:
        if not self.enabled:
            return []

        normalized_type = media_type if media_type in {"all", "movie", "tv"} else "all"
        normalized_query = query.strip()
        if not normalized_query:
            return []

        cache_key = f"search:{normalized_type}:{normalized_query.lower()}:{limit}"
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached  # type: ignore[return-value]

        if normalized_type == "movie":
            paths = [("/search/movie", "movie")]
        elif normalized_type == "tv":
            paths = [("/search/tv", "tv")]
        else:
            paths = [("/search/movie", "movie"), ("/search/tv", "tv")]

        items = self._collect_items_from_paths(
            paths_with_type=paths,
            genre_filter="",
            limit=limit,
            extra_params={"query": normalized_query, "include_adult": "false", "page": 1},
        )

        return self._cache_set(cache_key, items, ttl_seconds=240)  # type: ignore[return-value]

    def popular_titles(self, media_type: str = "all", genre: str | None = None, limit: int = 24) -> list[dict[str, object]]:
        if not self.enabled:
            return []

        normalized_type = media_type if media_type in {"all", "movie", "tv"} else "all"
        genre_filter = (genre or "").strip().lower()

        cache_key = f"popular:{normalized_type}:{genre_filter}:{limit}"
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached  # type: ignore[return-value]

        if normalized_type == "movie":
            paths = [("/movie/popular", "movie")]
        elif normalized_type == "tv":
            paths = [("/tv/popular", "tv")]
        else:
            paths = [("/movie/popular", "movie"), ("/tv/popular", "tv")]

        items = self._collect_items_from_paths(paths, genre_filter, limit, {"page": 1})
        return self._cache_set(cache_key, items, ttl_seconds=300)  # type: ignore[return-value]

    def trending_titles(self, media_type: str = "all", genre: str | None = None, limit: int = 24) -> list[dict[str, object]]:
        if not self.enabled:
            return []

        normalized_type = media_type if media_type in {"all", "movie", "tv"} else "all"
        genre_filter = (genre or "").strip().lower()

        cache_key = f"trending:{normalized_type}:{genre_filter}:{limit}"
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached  # type: ignore[return-value]

        if normalized_type == "movie":
            paths = [("/trending/movie/day", "movie")]
        elif normalized_type == "tv":
            paths = [("/trending/tv/day", "tv")]
        else:
            paths = [("/trending/movie/day", "movie"), ("/trending/tv/day", "tv")]

        items = self._collect_items_from_paths(paths, genre_filter, limit, {"page": 1})
        return self._cache_set(cache_key, items, ttl_seconds=300)  # type: ignore[return-value]

    def highly_rated_titles(self, media_type: str = "all", genre: str | None = None, limit: int = 24) -> list[dict[str, object]]:
        # Build from popular endpoints, then rank by TMDB vote average.
        candidates = self.popular_titles(media_type=media_type, genre=genre, limit=max(limit * 2, 48))
        ranked = sorted(candidates, key=lambda item: float(item.get("score") or 0.0), reverse=True)
        return ranked[:limit]

    def latest_titles(
        self,
        media_type: str = "all",
        genre: str | None = None,
        query: str | None = None,
        limit: int = 24,
        include_cast: bool = True,
    ) -> list[dict[str, object]]:
        if not self.enabled:
            return []

        normalized_type = media_type if media_type in {"all", "movie", "tv"} else "all"
        normalized_query = (query or "").strip()
        genre_filter = (genre or "").strip().lower()
        movie_map, tv_map = self._genre_maps()

        cache_key = f"latest:{normalized_type}:{genre_filter}:{normalized_query.lower()}:{limit}:{int(include_cast)}"
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached  # type: ignore[return-value]

        if normalized_query:
            items = self.search_titles(media_type=normalized_type, query=normalized_query, limit=limit)
        else:
            items = self.popular_titles(media_type=normalized_type, genre=genre_filter or None, limit=limit)

        if include_cast and not normalized_query:
            hydrated: list[dict[str, object]] = []
            for item in items:
                media = str(item.get("media_type") or "movie")
                item_copy = dict(item)
                item_copy["actors"] = self._fetch_actors(media, int(item_copy["movie_id"]))
                hydrated.append(item_copy)
            items = hydrated

        return self._cache_set(cache_key, items, ttl_seconds=300)  # type: ignore[return-value]

    def title_detail(self, movie_id: int, media_type: str | None = None) -> dict[str, object] | None:
        if not self.enabled:
            return None

        preferred = (media_type or "").strip().lower()
        ordered_types = [preferred] if preferred in {"movie", "tv"} else ["movie", "tv"]
        if preferred in {"movie", "tv"}:
            ordered_types.append("tv" if preferred == "movie" else "movie")

        movie_map, tv_map = self._genre_maps()

        for current_type in ordered_types:
            cache_key = f"detail:{current_type}:{int(movie_id)}"
            cached = self._cache_get(cache_key)
            if cached is not None:
                return cached  # type: ignore[return-value]

            data = self._request_json(
                f"/{current_type}/{int(movie_id)}",
                {"append_to_response": "credits"},
            )

            if not data or not data.get("id"):
                continue

            title = str(data.get("title") or data.get("name") or "Untitled")
            genre_names = [str(item.get("name")) for item in data.get("genres", []) if item.get("name")]
            if not genre_names:
                genre_ids = [int(genre_id) for genre_id in data.get("genre_ids", []) if genre_id is not None]
                genre_names = [
                    (movie_map if current_type == "movie" else tv_map).get(genre_id)
                    for genre_id in genre_ids
                ]
                genre_names = [name for name in genre_names if name]

            credits = data.get("credits", {}) if isinstance(data.get("credits", {}), dict) else {}
            cast_list = credits.get("cast", []) if isinstance(credits.get("cast", []), list) else []
            actors = [str(person.get("name")) for person in cast_list[:10] if person.get("name")]
            cast_members = [
                {
                    "name": str(person.get("name")),
                    "role": str(person.get("character") or "") or None,
                    "profile_url": self._image_url(person.get("profile_path")),
                }
                for person in cast_list[:12]
                if person.get("name")
            ]

            crew_list = credits.get("crew", []) if isinstance(credits.get("crew", []), list) else []
            directors = [
                {
                    "name": str(person.get("name")),
                    "role": str(person.get("job") or "Director"),
                    "profile_url": self._image_url(person.get("profile_path")),
                }
                for person in crew_list
                if str(person.get("job") or "").lower() == "director" and person.get("name")
            ][:5]

            runtime = data.get("runtime")
            if runtime is None and current_type == "tv":
                episode_runtime = data.get("episode_run_time", [])
                if isinstance(episode_runtime, list) and episode_runtime:
                    runtime = episode_runtime[0]

            detail = {
                "movie_id": int(data.get("id")),
                "title": title,
                "genres": genre_names,
                "poster_url": self._image_url(data.get("poster_path")),
                "backdrop_url": self._image_url(data.get("backdrop_path")),
                "score": float(data.get("vote_average") or 0.0),
                "signal_source": "tmdb_detail",
                "why_this": "Detailed metadata from TMDB.",
                "popularity": float(data.get("popularity") or 0.0),
                "semantic_text": str(data.get("overview") or "") or None,
                "overview": str(data.get("overview") or "") or None,
                "actors": actors,
                "cast_members": cast_members,
                "directors": directors,
                "duration_minutes": int(runtime) if runtime else None,
                "media_type": current_type,
                "release_date": str(data.get("release_date") or data.get("first_air_date") or "") or None,
                "trailer_url": self._extract_trailer_url(current_type, int(movie_id)),
            }

            return self._cache_set(cache_key, detail, ttl_seconds=900)  # type: ignore[return-value]

        return None

    def movie_recommendations(self, movie_id: int, limit: int = 12) -> list[dict[str, object]]:
        cache_key = f"movie_recommendations:{int(movie_id)}:{int(limit)}"
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached  # type: ignore[return-value]

        data = self._request_json(f"/movie/{int(movie_id)}/recommendations", {"page": 1})
        items: list[dict[str, object]] = []
        for raw in data.get("results", []):
            formatted = self._format_result_item(raw, fallback_media_type="movie")
            if not formatted:
                continue
            formatted["signal_source"] = "tmdb_recommendations"
            formatted["why_this"] = "Recommended by TMDB based on similar audience behavior."
            items.append(formatted)
            if len(items) >= limit:
                break

        return self._cache_set(cache_key, items, ttl_seconds=600)  # type: ignore[return-value]

    def movie_similar(self, movie_id: int, limit: int = 12) -> list[dict[str, object]]:
        cache_key = f"movie_similar:{int(movie_id)}:{int(limit)}"
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached  # type: ignore[return-value]

        data = self._request_json(f"/movie/{int(movie_id)}/similar", {"page": 1})
        items: list[dict[str, object]] = []
        for raw in data.get("results", []):
            formatted = self._format_result_item(raw, fallback_media_type="movie")
            if not formatted:
                continue
            formatted["signal_source"] = "tmdb_similar"
            formatted["why_this"] = "Similar to titles you rated highly."
            items.append(formatted)
            if len(items) >= limit:
                break

        return self._cache_set(cache_key, items, ttl_seconds=600)  # type: ignore[return-value]

    def _extract_trailer_url(self, media_type: str, media_id: int) -> str | None:
        cache_key = f"videos:{media_type}:{media_id}"
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached  # type: ignore[return-value]

        data = self._request_json(f"/{media_type}/{media_id}/videos", {"page": 1})
        results = data.get("results", []) if isinstance(data.get("results", []), list) else []

        trailer_key = None
        for item in results:
            site = str(item.get("site") or "").lower()
            item_type = str(item.get("type") or "").lower()
            key = item.get("key")
            if site == "youtube" and item_type in {"trailer", "teaser"} and key:
                trailer_key = str(key)
                break

        trailer_url = f"https://www.youtube.com/watch?v={trailer_key}" if trailer_key else None
        return self._cache_set(cache_key, trailer_url, ttl_seconds=3600)  # type: ignore[return-value]