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

export async function fetchRecommendations(user, limit = 10) {
  const normalizedUser = String(user || '').trim()
  if (!normalizedUser) {
    throw new Error('user is required')
  }

  const url = new URL(recommendPath(), ensureBackendUrl())
  url.searchParams.set('user', normalizedUser)
  url.searchParams.set('limit', String(limit))

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  })

  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to fetch recommendations')
  }

  return payload
}
