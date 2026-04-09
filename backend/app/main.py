from __future__ import annotations

from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .external_catalog import TmdbCatalogClient
from .schemas import (
    ErrorResponse,
    GenreResponse,
    LiveCatalogItem,
    MovieCard,
    MovieCatalogResponse,
    MovieDetail,
    PersonalizeRequest,
    RecommendRequest,
    RecommendResponse,
    SearchResult,
)
from .settings import ALLOWED_ORIGIN_REGEX, ALLOWED_ORIGINS


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.live_catalog = TmdbCatalogClient()
    yield


app = FastAPI(
    title="FilmFind External Catalog API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin for origin in ALLOWED_ORIGINS if origin],
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", response_model=dict[str, str])
async def root() -> dict[str, str]:
    return {
        "app": "FilmFind API",
        "status": "ready",
        "docs": "/docs",
    }


@app.get("/search", response_model=list[SearchResult])
async def search(q: str = Query(..., min_length=1), limit: int = Query(8, ge=1, le=20)):
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        raise HTTPException(status_code=503, detail="TMDB is not configured")

    items = live_catalog.search_titles(media_type="all", query=q, limit=limit)
    return [
        {
            "movie_id": int(item["movie_id"]),
            "title": str(item["title"]),
            "genres": list(item.get("genres", [])),
        }
        for item in items
    ]


@app.get("/search/movie", response_model=list[SearchResult])
async def search_movie(query: str = Query(..., min_length=1), limit: int = Query(8, ge=1, le=30)):
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        raise HTTPException(status_code=503, detail="TMDB is not configured")

    items = live_catalog.search_titles(media_type="movie", query=query, limit=limit)
    return [
        {"movie_id": int(item["movie_id"]), "title": str(item["title"]), "genres": list(item.get("genres", []))}
        for item in items
    ]


@app.get("/search/tv", response_model=list[SearchResult])
async def search_tv(query: str = Query(..., min_length=1), limit: int = Query(8, ge=1, le=30)):
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        raise HTTPException(status_code=503, detail="TMDB is not configured")

    items = live_catalog.search_titles(media_type="tv", query=query, limit=limit)
    return [
        {"movie_id": int(item["movie_id"]), "title": str(item["title"]), "genres": list(item.get("genres", []))}
        for item in items
    ]


@app.get("/genres", response_model=GenreResponse)
async def genres() -> GenreResponse:
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        return GenreResponse(genres=[])
    return GenreResponse(genres=live_catalog.available_genres())


@app.get("/catalog/genres", response_model=GenreResponse)
async def catalog_genres() -> GenreResponse:
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        return GenreResponse(genres=[])
    return GenreResponse(genres=live_catalog.available_genres())


@app.get("/catalog/latest", response_model=list[LiveCatalogItem])
async def catalog_latest(
    media_type: str = Query(default="all", pattern="^(all|movie|tv)$"),
    genre: str | None = Query(default=None),
    query: str | None = Query(default=None),
    limit: int = Query(default=24, ge=1, le=120),
):
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        raise HTTPException(status_code=503, detail="TMDB is not configured")

    return live_catalog.latest_titles(media_type=media_type, genre=genre, query=query, limit=limit, include_cast=False)


@app.get("/catalog/highly-rated", response_model=list[LiveCatalogItem])
async def catalog_highly_rated(
    media_type: str = Query(default="all", pattern="^(all|movie|tv)$"),
    genre: str | None = Query(default=None),
    limit: int = Query(default=24, ge=1, le=120),
):
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        raise HTTPException(status_code=503, detail="TMDB is not configured")

    return live_catalog.highly_rated_titles(media_type=media_type, genre=genre, limit=limit)


@app.get("/trending", response_model=list[MovieCard])
async def trending(genre: str | None = Query(default=None), limit: int = Query(12, ge=1, le=24)):
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        raise HTTPException(status_code=503, detail="TMDB is not configured")

    items = live_catalog.trending_titles(media_type="all", genre=genre, limit=limit)
    return [
        {
            "movie_id": int(item["movie_id"]),
            "title": str(item["title"]),
            "genres": list(item.get("genres", [])),
            "poster_url": item.get("poster_url"),
            "backdrop_url": item.get("backdrop_url"),
            "score": float(item.get("score") or 0.0),
            "signal_source": str(item.get("signal_source") or "tmdb_trending"),
            "why_this": str(item.get("why_this") or "Live trending feed from TMDB."),
        }
        for item in items
    ]


@app.get("/trending/movie/day", response_model=list[MovieCard])
async def trending_movie_day(limit: int = Query(12, ge=1, le=30)):
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        raise HTTPException(status_code=503, detail="TMDB is not configured")

    items = live_catalog.trending_titles(media_type="movie", genre=None, limit=limit)
    return [
        {
            "movie_id": int(item["movie_id"]),
            "title": str(item["title"]),
            "genres": list(item.get("genres", [])),
            "poster_url": item.get("poster_url"),
            "backdrop_url": item.get("backdrop_url"),
            "score": float(item.get("score") or 0.0),
            "signal_source": str(item.get("signal_source") or "tmdb_trending"),
            "why_this": str(item.get("why_this") or "Trending movies today."),
        }
        for item in items
    ]


@app.get("/movies", response_model=MovieCatalogResponse)
async def movies(
    genre: str | None = Query(default=None),
    query: str | None = Query(default=None),
    sort: str = Query(default="popularity", pattern="^(popularity|title)$"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=24, ge=1, le=48),
):
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        raise HTTPException(status_code=503, detail="TMDB is not configured")

    catalog_items = live_catalog.latest_titles(media_type="all", genre=genre, query=query, limit=limit, include_cast=False)
    cards = [
        {
            "movie_id": int(item["movie_id"]),
            "title": str(item["title"]),
            "genres": list(item.get("genres", [])),
            "poster_url": item.get("poster_url"),
            "backdrop_url": item.get("backdrop_url"),
            "score": float(item.get("score") or 0.0),
            "signal_source": str(item.get("signal_source") or "tmdb_trending"),
            "why_this": str(item.get("why_this") or "Live catalog item from TMDB."),
        }
        for item in catalog_items
    ]

    if sort == "title":
        cards = sorted(cards, key=lambda item: item["title"].lower())
    else:
        cards = sorted(cards, key=lambda item: float(item["score"]), reverse=True)

    return {
        "items": cards,
        "total": len(cards),
        "page": page,
        "limit": limit,
        "genre": genre,
        "query": query,
        "sort": sort,
    }


@app.get("/movies/{movie_id}", response_model=MovieDetail)
async def movie_detail(movie_id: int, media_type: str | None = Query(default=None, pattern="^(movie|tv)?$")):
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        raise HTTPException(status_code=503, detail="TMDB is not configured")

    detail = live_catalog.title_detail(movie_id=movie_id, media_type=media_type)
    if detail is None:
        raise HTTPException(status_code=404, detail="Movie not found")

    return detail


@app.get("/movies/{movie_id}/videos", response_model=dict[str, str | None])
async def movie_videos(movie_id: int):
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        raise HTTPException(status_code=503, detail="TMDB is not configured")

    return {"trailer_url": live_catalog._extract_trailer_url("movie", int(movie_id))}


@app.get("/movies/{movie_id}/recommendations", response_model=list[MovieCard])
async def movie_recommendations(movie_id: int, limit: int = Query(default=12, ge=1, le=30)):
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        raise HTTPException(status_code=503, detail="TMDB is not configured")

    items = live_catalog.movie_recommendations(movie_id=movie_id, limit=limit)
    return [
        {
            "movie_id": int(item["movie_id"]),
            "title": str(item["title"]),
            "genres": list(item.get("genres", [])),
            "poster_url": item.get("poster_url"),
            "backdrop_url": item.get("backdrop_url"),
            "score": float(item.get("score") or 0.0),
            "signal_source": str(item.get("signal_source") or "tmdb_recommendations"),
            "why_this": str(item.get("why_this") or "Recommended by TMDB."),
        }
        for item in items
    ]


@app.get("/movies/{movie_id}/similar", response_model=list[MovieCard])
async def movie_similar(movie_id: int, limit: int = Query(default=12, ge=1, le=30)):
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        raise HTTPException(status_code=503, detail="TMDB is not configured")

    items = live_catalog.movie_similar(movie_id=movie_id, limit=limit)
    return [
        {
            "movie_id": int(item["movie_id"]),
            "title": str(item["title"]),
            "genres": list(item.get("genres", [])),
            "poster_url": item.get("poster_url"),
            "backdrop_url": item.get("backdrop_url"),
            "score": float(item.get("score") or 0.0),
            "signal_source": str(item.get("signal_source") or "tmdb_similar"),
            "why_this": str(item.get("why_this") or "Similar to this movie."),
        }
        for item in items
    ]


@app.post("/personalize", response_model=list[MovieCard])
async def personalize(request: PersonalizeRequest):
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        raise HTTPException(status_code=503, detail="TMDB is not configured")

    rated_items = sorted(request.rated_items, key=lambda item: float(item.rating), reverse=True)
    positive_seeds = [item for item in rated_items if item.rating >= 4]
    negative_ids = {int(item.movie_id) for item in rated_items if item.rating <= 2}
    rated_ids = {int(item.movie_id) for item in rated_items}

    target_count = request.top_n
    genre_hint = (request.genre or "").strip().lower()
    preferred_genres = {name.strip().lower() for name in request.preferred_genres if name.strip()}
    if genre_hint:
        preferred_genres.add(genre_hint)

    mood_key = (request.mood or "").strip().lower()
    mood_genre_map = {
        "cinematic": {"drama", "history", "war", "mystery"},
        "comfort": {"family", "comedy", "romance", "animation"},
        "thriller": {"thriller", "crime", "horror", "action"},
        "mind-bending": {"science fiction", "sci-fi & fantasy", "mystery", "fantasy"},
    }
    mood_genres = mood_genre_map.get(mood_key, set())

    candidate_map: dict[int, dict[str, object]] = {}

    for seed in positive_seeds[:8]:
        base_weight = max(0.1, float(seed.rating) / 5.0)

        rec_items = live_catalog.movie_recommendations(int(seed.movie_id), limit=max(8, target_count))
        sim_items = live_catalog.movie_similar(int(seed.movie_id), limit=max(8, target_count))

        for source_items, source_boost in ((rec_items, 0.18), (sim_items, 0.13)):
            for item in source_items:
                item_id = int(item["movie_id"])
                if item_id in rated_ids or item_id in negative_ids:
                    continue

                item_genres = {str(name).lower() for name in item.get("genres", [])}
                if genre_hint and genre_hint not in item_genres:
                    continue

                entry = candidate_map.get(item_id)
                if entry is None:
                    entry = {
                        "item": item,
                        "score": 0.0,
                        "hits": 0,
                    }
                    candidate_map[item_id] = entry

                shared_preferred = len(preferred_genres.intersection(item_genres))
                mood_match = len(mood_genres.intersection(item_genres))
                preference_boost = min(0.24, (0.07 * shared_preferred) + (0.05 * mood_match))

                entry["hits"] = int(entry["hits"]) + 1
                entry["score"] = float(entry["score"]) + float(item.get("score") or 0.0) + source_boost + (base_weight * 0.2) + preference_boost

    if len(candidate_map) < target_count:
        for item in live_catalog.latest_titles(
            media_type="all",
            genre=request.genre,
            limit=max(target_count * 3, 24),
            include_cast=False,
        ):
            item_id = int(item["movie_id"])
            if item_id in rated_ids or item_id in negative_ids or item_id in candidate_map:
                continue

            item_genres = {str(name).lower() for name in item.get("genres", [])}
            shared_preferred = len(preferred_genres.intersection(item_genres))
            mood_match = len(mood_genres.intersection(item_genres))
            cold_start_boost = min(0.18, (0.06 * shared_preferred) + (0.04 * mood_match))

            candidate_map[item_id] = {
                "item": item,
                "score": float(item.get("score") or 0.0) + cold_start_boost,
                "hits": 0,
            }

            if len(candidate_map) >= max(target_count * 2, 20):
                break

    ranked = sorted(
        candidate_map.values(),
        key=lambda entry: (float(entry["score"]), int(entry["hits"])),
        reverse=True,
    )

    why_line = (
        "Ranked from your rating history using TMDB recommendations + similar endpoints. "
        f"High-rated seeds: {len(positive_seeds)}. Mood: {request.mood or 'none'}."
    )

    return [
        {
            "movie_id": int(entry["item"]["movie_id"]),
            "title": str(entry["item"]["title"]),
            "genres": list(entry["item"].get("genres", [])),
            "poster_url": entry["item"].get("poster_url"),
            "backdrop_url": entry["item"].get("backdrop_url"),
            "score": float(entry["item"].get("score") or 0.0),
            "signal_source": "tmdb_rating_personalized",
            "why_this": why_line,
        }
        for entry in ranked[:target_count]
    ]


@app.post("/recommend", response_model=RecommendResponse, responses={400: {"model": ErrorResponse}})
async def recommend(request: RecommendRequest):
    if not request.title and not request.liked_movies:
        raise HTTPException(status_code=400, detail="Provide a movie title or liked_movies list.")

    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        raise HTTPException(status_code=503, detail="TMDB is not configured")

    seed_titles = [item.strip() for item in request.liked_movies if item.strip()]
    if request.title and request.title.strip():
        seed_titles = [request.title.strip(), *seed_titles]

    results: list[dict[str, object]] = []
    seen_ids: set[int] = set()

    for seed in seed_titles[:6]:
        for item in live_catalog.latest_titles(media_type="all", query=seed, limit=max(4, request.top_n // 2), include_cast=False):
            item_id = int(item["movie_id"])
            if item_id in seen_ids:
                continue
            seen_ids.add(item_id)
            score = float(item.get("score") or 0.0)
            results.append(
                {
                    "movie_id": item_id,
                    "title": str(item["title"]),
                    "genres": list(item.get("genres", [])),
                    "score": score,
                    "signal_source": "tmdb_query",
                    "signal_breakdown": {
                        "semantic": round(score * 0.7, 4),
                        "collaborative": 0.0,
                        "popularity": round(score * 0.3, 4),
                    },
                    "why_this": f"Related to your seed: {seed}",
                }
            )
            if len(results) >= request.top_n:
                break
        if len(results) >= request.top_n:
            break

    return {
        "query_type": "multi" if len(seed_titles) > 1 else "single",
        "seeds": seed_titles,
        "recommendations": results[: request.top_n],
        "taste_profile": {
            "labels": [],
            "values": [],
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )
