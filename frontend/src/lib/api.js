import axios from 'axios'

const configuredApiBase = (import.meta.env.VITE_API_URL || '').trim()
const API_BASE = configuredApiBase || (import.meta.env.DEV ? 'http://localhost:8000' : '/api')

function ensureApiBaseConfigured() {
  if (API_BASE) {
    return
  }

  throw new Error('API base URL is not configured.')
}

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

export async function searchMovies(query, limit = 8) {
  ensureApiBaseConfigured()
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    return []
  }

  const response = await api.get('/search', {
    params: { q: normalizedQuery, limit },
  })
  return response.data
}

export async function getGenres() {
  ensureApiBaseConfigured()
  const response = await api.get('/genres')
  return response.data.genres
}

export async function getCatalogGenres() {
  ensureApiBaseConfigured()
  const response = await api.get('/catalog/genres')
  return response.data.genres
}

export async function getLatestCatalog({ media_type = 'all', genre = null, query = null, limit = 24 } = {}) {
  ensureApiBaseConfigured()
  const response = await api.get('/catalog/latest', {
    params: {
      media_type,
      genre: genre || undefined,
      query: query || undefined,
      limit,
    },
  })
  return response.data
}

export async function getHighlyRatedCatalog({ media_type = 'all', genre = null, limit = 24 } = {}) {
  ensureApiBaseConfigured()
  const response = await api.get('/catalog/highly-rated', {
    params: {
      media_type,
      genre: genre || undefined,
      limit,
    },
  })
  return response.data
}

export async function getTrendingMovies(genre = null, limit = 12) {
  ensureApiBaseConfigured()
  const response = await api.get('/trending', {
    params: { genre: genre || undefined, limit },
  })
  return response.data
}

export async function getMovieDetail(movieId, mediaType = null) {
  ensureApiBaseConfigured()
  const response = await api.get(`/movies/${movieId}`, {
    params: { media_type: mediaType || undefined },
  })
  return response.data
}

export async function getPersonalizedMovies({
  genre = null,
  rated_items = [],
  preferred_genres = [],
  mood = null,
  top_n = 12,
}) {
  ensureApiBaseConfigured()
  const response = await api.post('/personalize', {
    genre,
    rated_items,
    preferred_genres,
    mood,
    top_n,
  })
  return response.data
}

export async function recommendMovies(title, top_n = 12) {
  ensureApiBaseConfigured()
  const response = await api.post('/recommend', {
    title,
    liked_movies: [],
    top_n,
  })
  return response.data
}

export async function recommendFromMultiple(liked_movies, top_n = 12) {
  ensureApiBaseConfigured()
  const response = await api.post('/recommend', {
    title: null,
    liked_movies,
    top_n,
  })
  return response.data
}

export async function healthCheck() {
  ensureApiBaseConfigured()
  const response = await api.get('/health')
  return response.data
}
