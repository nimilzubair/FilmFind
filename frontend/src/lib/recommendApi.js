const BACKEND_BASE_URL = (import.meta.env.VITE_API_URL || '').trim()

function isLocalhostUrl(value) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value)
}

const EFFECTIVE_BACKEND_BASE_URL =
  !import.meta.env.DEV && isLocalhostUrl(BACKEND_BASE_URL) ? '' : BACKEND_BASE_URL

function ensureBackendUrl() {
  if (EFFECTIVE_BACKEND_BASE_URL) {
    return EFFECTIVE_BACKEND_BASE_URL
  }

  if (import.meta.env.DEV) {
    return 'http://localhost:3000'
  }

  return window.location.origin
}

function recommendPath() {
  if (EFFECTIVE_BACKEND_BASE_URL || import.meta.env.DEV) {
    return '/recommend'
  }

  return '/api/recommend'
}

export async function fetchRecommendations(seedTitle, limit = 10) {
  const normalizedSeed = String(seedTitle || '').trim()
  if (!normalizedSeed) {
    throw new Error('seedTitle is required')
  }

  const url = new URL(recommendPath(), ensureBackendUrl())

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: normalizedSeed,
      liked_movies: [],
      top_n: Number(limit) || 10,
    }),
  })

  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload?.detail || payload?.error || 'Unable to fetch recommendations')
  }

  return payload
}
