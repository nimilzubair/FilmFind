from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, asdict
from typing import Iterable

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer
from sklearn.decomposition import TruncatedSVD

from .data_loader import CatalogData, load_catalog_data


@dataclass(slots=True)
class RecommendationCandidate:
    movie_id: int
    title: str
    genres: list[str]
    score: float
    signal_source: str
    signal_breakdown: dict[str, float]
    why_this: str


class HybridRecommender:
    def __init__(self, catalog: CatalogData | None = None) -> None:
        self.catalog = catalog or load_catalog_data()
        self.movies = self.catalog.movies.reset_index(drop=True).copy()
        self.ratings = self.catalog.ratings.copy()

        self.movies["movie_index"] = np.arange(len(self.movies))
        self.movie_id_to_index = {
            int(movie_id): int(index)
            for index, movie_id in enumerate(self.movies["movieId"].tolist())
        }
        self.title_to_indices = self._build_title_lookup(self.movies)

        self.semantic_model = SentenceTransformer("all-MiniLM-L6-v2")
        semantic_inputs = self.movies["semantic_text"].fillna("").tolist()
        self.semantic_embeddings = self.semantic_model.encode(
            semantic_inputs,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        ).astype(np.float32)

        self.collab_embeddings = self._build_collaborative_embeddings()
        self.popularity_scores = self._build_popularity_scores()

    def _movie_card(self, index: int, score: float, signal_source: str, why_this: str) -> dict[str, object]:
        movie = self.movies.iloc[index]
        return {
            "movie_id": int(movie["movieId"]),
            "title": str(movie["title"]),
            "genres": list(movie["genres_list"]),
            "score": float(score),
            "signal_source": signal_source,
            "why_this": why_this,
        }

    def movie_detail(self, movie_id: int) -> dict[str, object] | None:
        movie_index = self.movie_id_to_index.get(int(movie_id))
        if movie_index is None:
            return None

        movie = self.movies.iloc[movie_index]
        popularity = float(self.popularity_scores[movie_index])
        return {
            "movie_id": int(movie["movieId"]),
            "title": str(movie["title"]),
            "genres": list(movie["genres_list"]),
            "score": popularity,
            "signal_source": "popularity",
            "why_this": "This title is highlighted from the FilmFind catalog.",
            "popularity": popularity,
            "semantic_text": str(movie.get("semantic_text", "")) or None,
        }

    def browse_movies(
        self,
        genre: str | None = None,
        query: str | None = None,
        sort: str = "popularity",
        page: int = 1,
        limit: int = 24,
    ) -> dict[str, object]:
        candidate_indices = self._filter_indices_by_genre(genre)

        if query:
            normalized_query = query.strip().lower()
            if normalized_query:
                candidate_indices = [
                    index
                    for index in candidate_indices
                    if normalized_query in self.movies.iloc[index]["title_key"]
                    or normalized_query in str(self.movies.iloc[index]["semantic_text"]).lower()
                ]

        if sort == "title":
            ranked_indices = sorted(candidate_indices, key=lambda index: self.movies.iloc[index]["title_key"])
        else:
            ranked_indices = sorted(candidate_indices, key=lambda index: float(self.popularity_scores[index]), reverse=True)

        start = max(page - 1, 0) * limit
        end = start + limit
        page_indices = ranked_indices[start:end]

        items = [
            self._movie_card(
                index,
                float(self.popularity_scores[index]),
                "popularity",
                "Trending based on Bayesian popularity and recency weighting.",
            )
            for index in page_indices
        ]

        return {
            "items": items,
            "total": len(ranked_indices),
            "page": page,
            "limit": limit,
            "genre": genre,
            "query": query,
            "sort": sort,
        }

    @staticmethod
    def _build_title_lookup(movies: pd.DataFrame) -> dict[str, list[int]]:
        lookup: dict[str, list[int]] = {}
        for index, title_key in enumerate(movies["title_key"].tolist()):
            lookup.setdefault(title_key, []).append(index)
        return lookup

    def available_genres(self) -> list[str]:
        genres = sorted({genre for row in self.movies["genres_list"].tolist() for genre in row})
        return genres

    def _filter_indices_by_genre(self, genre: str | None) -> list[int]:
        if not genre:
            return list(range(len(self.movies)))

        normalized = genre.strip().lower()
        return [
            index
            for index, genres in enumerate(self.movies["genres_list"].tolist())
            if any(normalized == item.lower() or normalized in item.lower() for item in genres)
        ]

    def _build_collaborative_embeddings(self) -> np.ndarray:
        ratings_matrix = self.ratings.pivot_table(
            index="movieId",
            columns="userId",
            values="rating",
            aggfunc="mean",
        )

        if ratings_matrix.empty:
            return np.zeros((len(self.movies), 8), dtype=np.float32)

        centered = ratings_matrix.sub(ratings_matrix.mean(axis=0), axis=1).fillna(0.0)
        n_components = max(2, min(64, min(centered.shape) - 1))
        svd = TruncatedSVD(n_components=n_components, random_state=42)
        reduced = svd.fit_transform(centered.values.astype(np.float32))

        normalized = self._normalize_rows(reduced)
        embeddings = np.zeros((len(self.movies), normalized.shape[1]), dtype=np.float32)

        for row_position, movie_id in enumerate(ratings_matrix.index.tolist()):
            movie_index = self.movie_id_to_index.get(int(movie_id))
            if movie_index is not None:
                embeddings[movie_index] = normalized[row_position]

        return embeddings

    def _build_popularity_scores(self) -> np.ndarray:
        if self.ratings.empty:
            return np.zeros(len(self.movies), dtype=np.float32)

        max_timestamp = float(self.ratings["timestamp"].max())
        ratings = self.ratings.copy()
        ratings["decay"] = np.exp(-((max_timestamp - ratings["timestamp"]) / (86400.0 * 365.0)))
        ratings["weighted_rating"] = ratings["rating"] * ratings["decay"]

        stats = ratings.groupby("movieId").agg(
            rating_count=("rating", "size"),
            mean_rating=("rating", "mean"),
            weighted_sum=("weighted_rating", "sum"),
            decay_sum=("decay", "sum"),
            latest_timestamp=("timestamp", "max"),
        )

        global_mean = float(self.ratings["rating"].mean())
        rating_count_prior = float(max(25, int(self.ratings.groupby("movieId").size().median())))

        stats["bayesian"] = (
            (stats["rating_count"] / (stats["rating_count"] + rating_count_prior)) * stats["mean_rating"]
            + (rating_count_prior / (stats["rating_count"] + rating_count_prior)) * global_mean
        )

        stats["recency"] = np.exp(-((max_timestamp - stats["latest_timestamp"]) / (86400.0 * 365.0 * 2.0)))
        stats["weighted_mean"] = np.where(
            stats["decay_sum"] > 0,
            stats["weighted_sum"] / stats["decay_sum"],
            global_mean,
        )

        raw_scores = 0.65 * (stats["bayesian"] / 5.0) + 0.25 * (stats["weighted_mean"] / 5.0) + 0.10 * stats["recency"]
        raw_scores = raw_scores.clip(lower=0.0, upper=1.0)

        popularity = np.zeros(len(self.movies), dtype=np.float32)
        raw_min = float(raw_scores.min())
        raw_max = float(raw_scores.max())

        if raw_max > raw_min:
            normalized = (raw_scores - raw_min) / (raw_max - raw_min)
        else:
            normalized = raw_scores * 0.0

        for movie_id, score in normalized.items():
            movie_index = self.movie_id_to_index.get(int(movie_id))
            if movie_index is not None:
                popularity[movie_index] = float(score)

        return popularity

    @staticmethod
    def _normalize_rows(matrix: np.ndarray) -> np.ndarray:
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return (matrix / norms).astype(np.float32)

    @staticmethod
    def _normalize_scores(scores: np.ndarray) -> np.ndarray:
        scores = np.nan_to_num(scores.astype(np.float32), nan=0.0, posinf=0.0, neginf=0.0)
        min_score = float(scores.min())
        max_score = float(scores.max())
        if max_score > min_score:
            return (scores - min_score) / (max_score - min_score)
        return np.zeros_like(scores)

    def _resolve_titles(self, titles: Iterable[str]) -> list[int]:
        seed_indices: list[int] = []
        for title in titles:
            normalized = title.strip().lower()
            if not normalized:
                continue

            if normalized in self.title_to_indices:
                seed_indices.extend(self.title_to_indices[normalized])
                continue

            matches = self.movies.index[self.movies["title_key"].str.contains(normalized, regex=False, na=False)].tolist()
            if matches:
                seed_indices.append(int(matches[0]))

        unique_indices = sorted(set(seed_indices))
        return unique_indices

    def search(self, query: str, limit: int = 8) -> list[dict[str, object]]:
        normalized = query.strip().lower()
        if not normalized:
            return []

        exact = self.movies[self.movies["title_key"].eq(normalized)]
        partial = self.movies[self.movies["title_key"].str.contains(normalized, regex=False, na=False)]
        matches = pd.concat([exact, partial]).drop_duplicates(subset=["movieId"]).head(limit)

        return [
            {
                "movie_id": int(row.movieId),
                "title": row.title,
                "genres": row.genres_list,
            }
            for row in matches.itertuples()
        ]

    def _profile_vector(self, seed_indices: list[int], matrix: np.ndarray) -> np.ndarray:
        if not seed_indices:
            return np.zeros(matrix.shape[1], dtype=np.float32)
        vector = matrix[seed_indices].mean(axis=0)
        return vector.astype(np.float32)

    def _cosine_scores(self, profile: np.ndarray, matrix: np.ndarray) -> np.ndarray:
        profile_norm = float(np.linalg.norm(profile))
        if profile_norm == 0 or not np.isfinite(profile_norm):
            return np.zeros(matrix.shape[0], dtype=np.float32)
        profile = profile / profile_norm
        return np.dot(matrix, profile.astype(np.float32)).astype(np.float32)

    def _build_taste_profile(self, seed_indices: list[int], top_k: int = 6) -> dict[str, list[float | str]]:
        if not seed_indices:
            return {"labels": [], "values": []}

        counter: Counter[str] = Counter()
        for index in seed_indices:
            for genre in self.movies.iloc[index]["genres_list"]:
                counter[genre] += 1

        if not counter:
            return {"labels": [], "values": []}

        top_genres = counter.most_common(top_k)
        highest = float(top_genres[0][1])
        labels = [genre for genre, _ in top_genres]
        values = [round((count / highest) * 100.0, 1) for _, count in top_genres]
        return {"labels": labels, "values": values}

    def trending(self, genre: str | None = None, limit: int = 12) -> list[dict[str, object]]:
        candidate_indices = self._filter_indices_by_genre(genre)
        ranked_indices = sorted(candidate_indices, key=lambda index: float(self.popularity_scores[index]), reverse=True)
        reason = "Trending based on Bayesian popularity and recency weighting."
        return [self._movie_card(index, float(self.popularity_scores[index]), "popularity", reason) for index in ranked_indices[:limit]]

    def personalize(
        self,
        genre: str | None = None,
        liked_movies: list[str] | None = None,
        disliked_movies: list[str] | None = None,
        top_n: int = 12,
    ) -> list[dict[str, object]]:
        liked_movies = liked_movies or []
        disliked_movies = disliked_movies or []

        candidate_indices = self._filter_indices_by_genre(genre)
        if not candidate_indices:
            candidate_indices = list(range(len(self.movies)))

        liked_indices = self._resolve_titles(liked_movies)
        disliked_indices = set(self._resolve_titles(disliked_movies))

        if liked_indices:
            semantic_profile = self._profile_vector(liked_indices, self.semantic_embeddings)
            collab_profile = self._profile_vector(liked_indices, self.collab_embeddings)
        else:
            semantic_profile = self._profile_vector(candidate_indices, self.semantic_embeddings)
            collab_profile = self._profile_vector(candidate_indices, self.collab_embeddings)

        semantic_scores = self._normalize_scores(self._cosine_scores(semantic_profile, self.semantic_embeddings))
        collab_scores = self._normalize_scores(self._cosine_scores(collab_profile, self.collab_embeddings))
        popularity_scores = self.popularity_scores.copy()

        candidate_mask = np.full(len(self.movies), -1.0, dtype=np.float32)
        candidate_mask[candidate_indices] = 0.0

        ensemble = 0.45 * semantic_scores + 0.35 * collab_scores + 0.20 * popularity_scores + candidate_mask

        for disliked_index in disliked_indices:
            if 0 <= disliked_index < len(ensemble):
                ensemble[disliked_index] = -1.0

        ranked_indices = np.argsort(ensemble)[::-1][:top_n]
        reason = self._why_this("genre" if genre and not liked_indices else "semantic")
        cards: list[dict[str, object]] = []

        for index in ranked_indices:
            if ensemble[index] < 0:
                continue

            breakdown = {
                "semantic": float(semantic_scores[index]),
                "collaborative": float(collab_scores[index]),
                "popularity": float(popularity_scores[index]),
            }
            signal_source = max(breakdown, key=breakdown.get)
            cards.append(self._movie_card(index, float(ensemble[index]), signal_source, reason))

        return cards

    def recommend(self, title: str | None = None, liked_movies: list[str] | None = None, top_n: int = 10) -> dict[str, object]:
        liked_movies = liked_movies or []
        seeds = [title] if title else []
        seeds.extend(liked_movies)

        seed_indices = self._resolve_titles(seeds)
        if not seed_indices:
            raise ValueError("No valid seed movies were found.")

        semantic_profile = self._profile_vector(seed_indices, self.semantic_embeddings)
        collab_profile = self._profile_vector(seed_indices, self.collab_embeddings)

        semantic_scores = self._normalize_scores(self._cosine_scores(semantic_profile, self.semantic_embeddings))
        collab_scores = self._normalize_scores(self._cosine_scores(collab_profile, self.collab_embeddings))
        popularity_scores = self.popularity_scores.copy()

        ensemble = 0.5 * collab_scores + 0.3 * semantic_scores + 0.2 * popularity_scores
        ensemble[seed_indices] = -1.0

        ranked_indices = np.argsort(ensemble)[::-1][:top_n]
        recommendations: list[RecommendationCandidate] = []

        for index in ranked_indices:
            if ensemble[index] < 0:
                continue

            contributions = {
                "collaborative": float(0.5 * collab_scores[index]),
                "semantic": float(0.3 * semantic_scores[index]),
                "popularity": float(0.2 * popularity_scores[index]),
            }
            signal_source = max(contributions, key=contributions.get)
            why_this = self._why_this(signal_source)
            recommendations.append(
                RecommendationCandidate(
                    movie_id=int(self.movies.iloc[index]["movieId"]),
                    title=str(self.movies.iloc[index]["title"]),
                    genres=list(self.movies.iloc[index]["genres_list"]),
                    score=float(ensemble[index]),
                    signal_source=signal_source,
                    signal_breakdown={
                        "collaborative": round(float(collab_scores[index]), 4),
                        "semantic": round(float(semantic_scores[index]), 4),
                        "popularity": round(float(popularity_scores[index]), 4),
                    },
                    why_this=why_this,
                )
            )

        query_type = "liked_movies" if len(liked_movies) else "title"
        return {
            "query_type": query_type,
            "seeds": [self.movies.iloc[index]["title"] for index in seed_indices],
            "recommendations": [asdict(candidate) for candidate in recommendations],
            "taste_profile": self._build_taste_profile(seed_indices),
        }

    @staticmethod
    def _why_this(signal_source: str) -> str:
        reasons = {
            "collaborative": "Similar rating patterns from users with related taste.",
            "semantic": "Strong title, genre, or tag overlap with your picks.",
            "popularity": "A strong recent audience signal lifted this title.",
            "genre": "You selected this genre, so the feed is weighted toward matching titles.",
        }
        return reasons.get(signal_source, "Balanced hybrid recommendation.")
