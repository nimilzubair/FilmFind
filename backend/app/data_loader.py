from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import pandas as pd

from .settings import MOVIES_PATH, RATINGS_PATH, TAGS_PATH


@dataclass(slots=True)
class CatalogData:
    movies: pd.DataFrame
    ratings: pd.DataFrame
    tags: pd.DataFrame


def _clean_text(value: Any) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()


@lru_cache(maxsize=1)
def load_catalog_data() -> CatalogData:
    movies = pd.read_csv(MOVIES_PATH).copy()
    ratings = pd.read_csv(RATINGS_PATH).copy()
    tags = pd.read_csv(TAGS_PATH).copy()

    movies["title"] = movies["title"].map(_clean_text)
    movies["genres"] = movies["genres"].fillna("").astype(str)
    movies["genres_text"] = movies["genres"].str.replace("|", " ", regex=False)
    movies["title_key"] = movies["title"].str.lower().str.strip()

    if not tags.empty:
        tags["tag"] = tags["tag"].map(_clean_text).str.lower()
        tag_text = (
            tags.loc[tags["tag"] != ""]
            .groupby("movieId")["tag"]
            .apply(lambda values: " ".join(sorted(set(values))))
            .reset_index(name="tag_text")
        )
    else:
        tag_text = pd.DataFrame(columns=["movieId", "tag_text"])

    movies = movies.merge(tag_text, on="movieId", how="left")
    movies["tag_text"] = movies["tag_text"].fillna("")
    movies["semantic_text"] = (
        movies["title"] + " " + movies["genres_text"] + " " + movies["tag_text"]
    ).str.replace(r"\s+", " ", regex=True).str.strip()
    movies["genres_list"] = movies["genres"].apply(
        lambda value: [genre for genre in str(value).split("|") if genre and genre != "(no genres listed)"]
    )

    ratings["timestamp"] = pd.to_numeric(ratings["timestamp"], errors="coerce").fillna(0).astype("int64")
    ratings["rating"] = pd.to_numeric(ratings["rating"], errors="coerce").fillna(0).astype("float32")

    return CatalogData(movies=movies, ratings=ratings, tags=tags)
