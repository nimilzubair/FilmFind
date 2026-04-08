from __future__ import annotations

from pydantic import BaseModel, Field


class RecommendRequest(BaseModel):
    title: str | None = Field(default=None, description="Single seed movie title")
    liked_movies: list[str] = Field(default_factory=list, description="List of liked movie titles")
    top_n: int = Field(default=10, ge=1, le=25)


class PersonalizeRequest(BaseModel):
    genre: str | None = Field(default=None, description="Selected genre to personalize around")
    liked_movies: list[str] = Field(default_factory=list, description="Titles the user liked")
    disliked_movies: list[str] = Field(default_factory=list, description="Titles the user disliked")
    top_n: int = Field(default=12, ge=1, le=25)


class SearchResult(BaseModel):
    movie_id: int
    title: str
    genres: list[str]


class MovieCard(BaseModel):
    movie_id: int
    title: str
    genres: list[str]
    score: float
    signal_source: str
    why_this: str


class MovieDetail(MovieCard):
    popularity: float
    semantic_text: str | None = None


class MovieCatalogResponse(BaseModel):
    items: list[MovieCard]
    total: int
    page: int
    limit: int
    genre: str | None = None
    query: str | None = None
    sort: str = "popularity"


class GenreResponse(BaseModel):
    genres: list[str]


class LiveCatalogItem(BaseModel):
    external_id: int
    movie_id: int
    title: str
    genres: list[str]
    actors: list[str] = Field(default_factory=list)
    overview: str | None = None
    release_date: str | None = None
    media_type: str
    poster_url: str | None = None
    backdrop_url: str | None = None
    score: float
    signal_source: str
    why_this: str


class RecommendationItem(BaseModel):
    movie_id: int
    title: str
    genres: list[str]
    score: float
    signal_source: str
    signal_breakdown: dict[str, float]
    why_this: str


class TasteProfile(BaseModel):
    labels: list[str]
    values: list[float]


class RecommendResponse(BaseModel):
    query_type: str
    seeds: list[str]
    recommendations: list[RecommendationItem]
    taste_profile: TasteProfile


class ErrorResponse(BaseModel):
    detail: str
