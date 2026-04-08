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

    items = live_catalog.latest_titles(media_type="all", query=q, limit=limit, include_cast=False)
    return [
        {
            "movie_id": int(item["movie_id"]),
            "title": str(item["title"]),
            "genres": list(item.get("genres", [])),
        }
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
    limit: int = Query(default=24, ge=1, le=40),
):
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        raise HTTPException(status_code=503, detail="TMDB is not configured")

    return live_catalog.latest_titles(media_type=media_type, genre=genre, query=query, limit=limit, include_cast=False)


@app.get("/trending", response_model=list[MovieCard])
async def trending(genre: str | None = Query(default=None), limit: int = Query(12, ge=1, le=24)):
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        raise HTTPException(status_code=503, detail="TMDB is not configured")

    items = live_catalog.latest_titles(media_type="all", genre=genre, query=None, limit=limit, include_cast=False)
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


@app.post("/personalize", response_model=list[MovieCard])
async def personalize(request: PersonalizeRequest):
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        raise HTTPException(status_code=503, detail="TMDB is not configured")

    disliked = {title.strip().lower() for title in request.disliked_movies if title.strip()}

    seeds = [title.strip() for title in request.liked_movies if title.strip()]
    collected: list[dict[str, object]] = []
    seen_ids: set[int] = set()

    if seeds:
        for seed in seeds[:5]:
            for item in live_catalog.latest_titles(
                media_type="all",
                genre=request.genre,
                query=seed,
                limit=max(4, request.top_n // 2),
                include_cast=False,
            ):
                item_id = int(item["movie_id"])
                title_key = str(item["title"]).strip().lower()
                if item_id in seen_ids or title_key in disliked:
                    continue
                seen_ids.add(item_id)
                collected.append(item)
                if len(collected) >= request.top_n:
                    break
            if len(collected) >= request.top_n:
                break

    if len(collected) < request.top_n:
        for item in live_catalog.latest_titles(media_type="all", genre=request.genre, limit=request.top_n * 2, include_cast=False):
            item_id = int(item["movie_id"])
            title_key = str(item["title"]).strip().lower()
            if item_id in seen_ids or title_key in disliked:
                continue
            seen_ids.add(item_id)
            collected.append(item)
            if len(collected) >= request.top_n:
                break

    return [
        {
            "movie_id": int(item["movie_id"]),
            "title": str(item["title"]),
            "genres": list(item.get("genres", [])),
            "poster_url": item.get("poster_url"),
            "backdrop_url": item.get("backdrop_url"),
            "score": float(item.get("score") or 0.0),
            "signal_source": "tmdb_personalized",
            "why_this": "Matched to your likes/dislikes using TMDB search and trending signals.",
        }
        for item in collected[: request.top_n]
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
