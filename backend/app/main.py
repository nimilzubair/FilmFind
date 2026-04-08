from __future__ import annotations

from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .data_loader import load_catalog_data
from .external_catalog import TmdbCatalogClient
from .recommender import HybridRecommender
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
from .settings import ALLOWED_ORIGINS


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_catalog_data()
    app.state.recommender = HybridRecommender()
    app.state.live_catalog = TmdbCatalogClient()
    yield


app = FastAPI(
    title="MovieLens Hybrid Recommender",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin for origin in ALLOWED_ORIGINS if origin],
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
    recommender: HybridRecommender = app.state.recommender
    return recommender.search(q, limit=limit)


@app.get("/genres", response_model=GenreResponse)
async def genres() -> GenreResponse:
    recommender: HybridRecommender = app.state.recommender
    return GenreResponse(genres=recommender.available_genres())


@app.get("/catalog/genres", response_model=GenreResponse)
async def catalog_genres() -> GenreResponse:
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if live_catalog.enabled:
        return GenreResponse(genres=live_catalog.available_genres())

    recommender: HybridRecommender = app.state.recommender
    return GenreResponse(genres=recommender.available_genres())


@app.get("/catalog/latest", response_model=list[LiveCatalogItem])
async def catalog_latest(
    media_type: str = Query(default="all", pattern="^(all|movie|tv)$"),
    genre: str | None = Query(default=None),
    query: str | None = Query(default=None),
    limit: int = Query(default=24, ge=1, le=40),
):
    live_catalog: TmdbCatalogClient = app.state.live_catalog
    if not live_catalog.enabled:
        recommender: HybridRecommender = app.state.recommender
        fallback = recommender.trending(genre=genre, limit=limit)
        return [
            {
                "external_id": item["movie_id"],
                "movie_id": item["movie_id"],
                "title": item["title"],
                "genres": item["genres"],
                "actors": [],
                "overview": item["why_this"],
                "release_date": None,
                "media_type": "movie",
                "poster_url": None,
                "backdrop_url": None,
                "score": item["score"],
                "signal_source": item["signal_source"],
                "why_this": item["why_this"],
            }
            for item in fallback
        ]

    return live_catalog.latest_titles(media_type=media_type, genre=genre, query=query, limit=limit)


@app.get("/trending", response_model=list[MovieCard])
async def trending(genre: str | None = Query(default=None), limit: int = Query(12, ge=1, le=24)):
    recommender: HybridRecommender = app.state.recommender
    return recommender.trending(genre=genre, limit=limit)


@app.get("/movies", response_model=MovieCatalogResponse)
async def movies(
    genre: str | None = Query(default=None),
    query: str | None = Query(default=None),
    sort: str = Query(default="popularity", pattern="^(popularity|title)$"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=24, ge=1, le=48),
):
    recommender: HybridRecommender = app.state.recommender
    return recommender.browse_movies(genre=genre, query=query, sort=sort, page=page, limit=limit)


@app.get("/movies/{movie_id}", response_model=MovieDetail)
async def movie_detail(movie_id: int):
    recommender: HybridRecommender = app.state.recommender
    detail = recommender.movie_detail(movie_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Movie not found")
    return detail


@app.post("/personalize", response_model=list[MovieCard])
async def personalize(request: PersonalizeRequest):
    recommender: HybridRecommender = app.state.recommender
    return recommender.personalize(
        genre=request.genre,
        liked_movies=request.liked_movies,
        disliked_movies=request.disliked_movies,
        top_n=request.top_n,
    )


@app.post("/recommend", response_model=RecommendResponse, responses={400: {"model": ErrorResponse}})
async def recommend(request: RecommendRequest):
    recommender: HybridRecommender = app.state.recommender

    if not request.title and not request.liked_movies:
        raise HTTPException(status_code=400, detail="Provide a movie title or liked_movies list.")

    try:
        payload = recommender.recommend(
            title=request.title,
            liked_movies=request.liked_movies,
            top_n=request.top_n,
        )
        return payload
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )
