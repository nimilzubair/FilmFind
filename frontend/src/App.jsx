import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import AuthPanel from './components/AuthPanel'
import SearchBar from './components/SearchBar'
import { getCatalogGenres, getGenres, getHighlyRatedCatalog, getLatestCatalog, getMovieDetail, getPersonalizedMovies, getTrendingMovies } from './lib/api'
import { supabase } from './lib/supabase'

const ALL_GENRES = 'All genres'
const MOODS = ['Cinematic', 'Comfort', 'Thriller', 'Mind-bending']
const CONTENT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'movie', label: 'Movies' },
  { key: 'tv', label: 'Series' },
  { key: 'documentary', label: 'Documentary' },
  { key: 'music', label: 'Song' },
]
const AUTH_TIMEOUT_MS = 30000
const configuredAuthRedirect = (import.meta.env.VITE_SUPABASE_AUTH_REDIRECT || '').trim()

function getContentFilterDetails(filterKey) {
  if (filterKey === 'movie' || filterKey === 'tv') {
    return { mediaType: filterKey, genreHint: null }
  }

  if (filterKey === 'documentary') {
    return { mediaType: 'all', genreHint: 'Documentary' }
  }

  if (filterKey === 'music') {
    return { mediaType: 'all', genreHint: 'Music' }
  }

  return { mediaType: 'all', genreHint: null }
}

function matchesGenreSelection(movie, selectedGenre) {
  if (!selectedGenre || selectedGenre === ALL_GENRES) {
    return true
  }

  return (movie.genres || []).some((genre) => String(genre).toLowerCase() === String(selectedGenre).toLowerCase())
}

function matchesContentSelection(movie, selectedContentFilter) {
  if (!selectedContentFilter || selectedContentFilter === 'all') {
    return true
  }

  if (selectedContentFilter === 'movie' || selectedContentFilter === 'tv') {
    return String(movie.media_type || '').toLowerCase() === selectedContentFilter
  }

  const expectedGenre = selectedContentFilter === 'documentary' ? 'documentary' : 'music'
  return (movie.genres || []).some((genre) => String(genre).toLowerCase().includes(expectedGenre))
}

function mergeUniqueGenres(...groups) {
  return Array.from(
    new Set(
      groups
        .flat()
        .map((genre) => String(genre || '').trim())
        .filter(Boolean),
    ),
  )
}

function isSupabaseLockRaceError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return message.includes('auth-token') && message.includes('stole it')
}

function isUnconfirmedEmailError(error) {
  const message = String(error?.message || error?.msg || error || '').toLowerCase()
  const code = String(error?.code || '').toLowerCase()
  return (
    code === 'email_not_confirmed' ||
    message.includes('email not confirmed') ||
    message.includes('email_not_confirmed') ||
    message.includes('email is not confirmed')
  )
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withTimeout(promise, timeoutMs, message) {
  let timeoutId
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timeoutId)
  }
}

function StarMeter({ value }) {
  const normalized = Math.max(0, Math.min(5, Number(value) || 0))

  return (
    <div className="star-meter" aria-label={`rating ${normalized} out of 5`}>
      {[1, 2, 3, 4, 5].map((index) => (
        <span key={index} className={index <= Math.round(normalized) ? 'star-on' : 'star-off'}>
          ★
        </span>
      ))}
    </div>
  )
}

function filterMovies(movies, query, selectedGenre = null, selectedContentFilter = 'all') {
  const normalized = query.trim().toLowerCase()
  return movies.filter((movie) => {
    const titleMatch = movie.title.toLowerCase().includes(normalized)
    const genreMatch = (movie.genres || []).join(' ').toLowerCase().includes(normalized)
    const actorsMatch = (movie.actors || []).join(' ').toLowerCase().includes(normalized)
    const overviewMatch = String(movie.overview || '').toLowerCase().includes(normalized)
    const queryMatch = !normalized || titleMatch || genreMatch || actorsMatch || overviewMatch
    return queryMatch && matchesGenreSelection(movie, selectedGenre) && matchesContentSelection(movie, selectedContentFilter)
  })
}

function toneFromMovie(movie) {
  const seed = Number(movie?.movie_id || 1)
  return {
    '--tone-a': `${(seed * 37) % 360}deg`,
    '--tone-b': `${(seed * 59 + 45) % 360}deg`,
  }
}

function PosterTile({ movie, rank = null, tag = null, onOpen = null }) {
  const tileClass = rank ? 'poster-tile ranked-tile' : 'poster-tile'
  const artClass = rank ? 'poster-art ranked-art' : 'poster-art'
  const openDetails = () => {
    if (onOpen) {
      onOpen(movie)
    }
  }

  return (
    <article
      className={tileClass}
      style={toneFromMovie(movie)}
      onClick={openDetails}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={(event) => {
        if (!onOpen) {
          return
        }

        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openDetails()
        }
      }}
    >
      <div className={artClass}>
        {movie?.poster_url ? <img src={movie.poster_url} alt={movie.title} className="poster-image" loading="lazy" /> : null}
        <div className="poster-glow" />
        <p className="poster-title">{movie.title}</p>
        {movie?.actors?.length ? <p className="poster-cast">{movie.actors.slice(0, 2).join(' • ')}</p> : null}
        {tag ? <span className="poster-badge">{tag}</span> : null}
      </div>
      {rank ? <span className="poster-rank">{rank}</span> : null}
    </article>
  )
}

function buildTasteRadarData(ratedMovies) {
  const counts = new Map()

  Object.values(ratedMovies).forEach((entry) => {
    if (Number(entry.rating || 0) < 4) {
      return
    }

    ;(entry.genres || []).forEach((genre) => {
      counts.set(genre, (counts.get(genre) || 0) + 1)
    })
  })

  const entries = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  if (!entries.length) {
    return { labels: [], values: [] }
  }

  const maxValue = entries[0][1]
  return {
    labels: entries.map(([genre]) => genre),
    values: entries.map(([, count]) => Math.round((count / maxValue) * 1000) / 10),
  }
}

function buildFavoriteGenres(ratedMovies) {
  const counts = new Map()

  Object.values(ratedMovies).forEach((entry) => {
    if (Number(entry.rating || 0) < 4) {
      return
    }

    ;(entry.genres || []).forEach((genre) => {
      counts.set(genre, (counts.get(genre) || 0) + 1)
    })
  })

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([genre]) => genre)
    .slice(0, 4)
}

function hasRatingSignals(ratedMovies) {
  return Object.values(ratedMovies).some((entry) => Number(entry?.rating || 0) > 0)
}

export default function App() {
  const [activeTab, setActiveTab] = useState('home')
  const [selectedCollection, setSelectedCollection] = useState(null)
  const [collectionMovies, setCollectionMovies] = useState([])
  const [collectionLoading, setCollectionLoading] = useState(false)
  const [collectionError, setCollectionError] = useState('')
  const [selectedDetail, setSelectedDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [session, setSession] = useState(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [profileLoaded, setProfileLoaded] = useState(false)

  const [genres, setGenres] = useState([ALL_GENRES])
  const [selectedGenre, setSelectedGenre] = useState(ALL_GENRES)
  const [selectedMood, setSelectedMood] = useState(MOODS[0])
  const [preferredGenres, setPreferredGenres] = useState([])
  const [genrePreviewRows, setGenrePreviewRows] = useState({})
  const [trendingMovies, setTrendingMovies] = useState([])
  const [highlyRatedMovies, setHighlyRatedMovies] = useState([])
  const [liveCatalog, setLiveCatalog] = useState([])
  const [personalizedMovies, setPersonalizedMovies] = useState([])
  const [loadingMovies, setLoadingMovies] = useState(true)
  const [movieError, setMovieError] = useState('')
  const [ratingMessage, setRatingMessage] = useState('')
  const [ratedMovies, setRatedMovies] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResetSignal, setSearchResetSignal] = useState(0)
  const [searchCloseSignal, setSearchCloseSignal] = useState(0)
  const [selectedMediaType, setSelectedMediaType] = useState('all')
  const [selectedContentFilter, setSelectedContentFilter] = useState('all')

  const authRedirectUrl = useMemo(() => {
    if (configuredAuthRedirect) {
      return configuredAuthRedirect
    }

    return `${window.location.origin}/`
  }, [])

  const setHashRoute = (hash) => {
    const normalized = hash.startsWith('#') ? hash : `#${hash}`
    const nextUrl = `${window.location.pathname}${window.location.search}${normalized}`
    window.history.replaceState({}, '', nextUrl)
  }

  const toCollectionSlug = (value) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

  const loadCollectionByGenre = async (label, mode = 'genre') => {
    const genre = String(label || '').trim()
    if (!genre) {
      return
    }

    setCollectionLoading(true)
    setCollectionError('')
    setActiveTab('collection')
    setSelectedCollection({ label: genre, slug: toCollectionSlug(genre), mode })

    try {
      const items =
        mode === 'highly-rated'
          ? await getHighlyRatedCatalog({ media_type: 'all', genre: null, limit: 120 })
          : await getLatestCatalog({
              media_type: 'all',
              genre,
              limit: 96,
            })
      setCollectionMovies(items)
      setHashRoute(`#collection/${toCollectionSlug(genre)}?genre=${encodeURIComponent(genre)}&type=${mode}`)
    } catch (error) {
      setCollectionMovies([])
      setCollectionError(error?.message || 'Failed to load collection.')
    } finally {
      setCollectionLoading(false)
    }
  }

  const selectedGenreValue = selectedGenre === ALL_GENRES ? null : selectedGenre
  const contentFilterDetails = getContentFilterDetails(selectedContentFilter)
  const apiMediaType = contentFilterDetails.mediaType
  const apiGenreHint = selectedGenreValue || contentFilterDetails.genreHint
  const activeGenreForFeed = selectedGenreValue || contentFilterDetails.genreHint || preferredGenres[0] || null

  const filteredTrendingMovies = useMemo(
    () => filterMovies(trendingMovies, searchQuery, selectedGenreValue, selectedContentFilter),
    [trendingMovies, searchQuery, selectedGenreValue, selectedContentFilter],
  )

  const filteredLiveCatalog = useMemo(
    () => filterMovies(liveCatalog, searchQuery, selectedGenreValue, selectedContentFilter),
    [liveCatalog, searchQuery, selectedGenreValue, selectedContentFilter],
  )

  const filteredPersonalizedMovies = useMemo(
    () => filterMovies(personalizedMovies, searchQuery, selectedGenreValue, selectedContentFilter),
    [personalizedMovies, searchQuery, selectedGenreValue, selectedContentFilter],
  )

  const sortedGenres = useMemo(
    () => genres.filter((genre) => genre !== ALL_GENRES && genre !== 'Documentary' && genre !== 'Music').sort((a, b) => a.localeCompare(b)),
    [genres],
  )

  const favoriteGenres = useMemo(() => buildFavoriteGenres(ratedMovies), [ratedMovies])
  const hasPersonalizedSystem = useMemo(
    () => hasRatingSignals(ratedMovies) || preferredGenres.length > 0,
    [ratedMovies, preferredGenres],
  )

  const loadGenres = async () => {
    try {
      let genreList = await getCatalogGenres()
      if (!genreList.length) {
        genreList = await getGenres()
      }
      setGenres([ALL_GENRES, ...genreList])
    } catch (error) {
      setGenres([ALL_GENRES])
      if (error?.message && !String(error.message).toLowerCase().includes('network error')) {
        setMovieError(error.message)
      }
    }
  }

  const loadLiveCatalog = async () => {
    try {
      const normalizedQuery = searchQuery.trim()
      const isSearching = normalizedQuery.length > 0
      const items = await getLatestCatalog({
        // During search, query across all media and do not constrain by preference genre.
        media_type: isSearching ? apiMediaType : apiMediaType,
        genre: isSearching ? apiGenreHint : apiGenreHint,
        query: isSearching ? normalizedQuery : null,
        limit: isSearching ? 64 : 84,
      })
      setLiveCatalog(items)
      return items
    } catch (error) {
      setLiveCatalog([])
      if (error?.message && !String(error.message).toLowerCase().includes('network error')) {
        setMovieError(error.message)
      }
      return []
    }
  }

  const loadTrending = async () => {
    try {
      const data = await getTrendingMovies(apiGenreHint, 24)
      setTrendingMovies(data)
      return data
    } catch (error) {
      setTrendingMovies([])
      if (error?.message && !String(error.message).toLowerCase().includes('network error')) {
        setMovieError(error.message)
      }
      return []
    }
  }

  const loadHighlyRated = async () => {
    try {
      const normalizedQuery = searchQuery.trim()
      if (normalizedQuery) {
        setHighlyRatedMovies([])
        return []
      }

      const items = await getHighlyRatedCatalog({
        media_type: apiMediaType,
        genre: apiGenreHint,
        limit: 36,
      })
      setHighlyRatedMovies(items)
      return items
    } catch (error) {
      setHighlyRatedMovies([])
      if (error?.message && !String(error.message).toLowerCase().includes('network error')) {
        setMovieError(error.message)
      }
      return []
    }
  }

  const loadPersonalized = async (ratingsSnapshot = ratedMovies) => {
    if (!session) {
      setPersonalizedMovies([])
      return []
    }

    // Keep personalized row empty until user provides at least one signal.
    if (!hasRatingSignals(ratingsSnapshot) && preferredGenres.length === 0) {
      setPersonalizedMovies([])
      return []
    }

    const rated_items = Object.values(ratingsSnapshot)
      .filter((item) => Number(item.rating || 0) > 0)
      .map((item) => ({
        movie_id: Number(item.movie_id),
        rating: Number(item.rating || 0),
        title: item.title,
      }))

    try {
      const data = await getPersonalizedMovies({
        genre: selectedGenreValue || apiGenreHint,
        rated_items,
        preferred_genres: preferredGenres,
        mood: selectedMood,
        top_n: 18,
      })

      setPersonalizedMovies(data)
      return data
    } catch (error) {
      setPersonalizedMovies([])
      if (error?.message && !String(error.message).toLowerCase().includes('network error')) {
        setMovieError(error.message)
      }
      return []
    }
  }

  const loadGenrePreview = async (genre, mediaType = selectedMediaType) => {
    const normalizedGenre = String(genre || '').trim()
    if (!normalizedGenre) {
      return []
    }

    setGenrePreviewRows((current) => ({
      ...current,
      [normalizedGenre]: {
        items: current[normalizedGenre]?.items || [],
        loading: true,
        error: '',
      },
    }))

    try {
      const items = await getLatestCatalog({
        media_type: mediaType || 'all',
        genre: normalizedGenre,
        limit: 12,
      })

      setGenrePreviewRows((current) => ({
        ...current,
        [normalizedGenre]: {
          items,
          loading: false,
          error: '',
        },
      }))

      return items
    } catch (error) {
      setGenrePreviewRows((current) => ({
        ...current,
        [normalizedGenre]: {
          items: [],
          loading: false,
          error: error?.message || 'Failed to load genre preview.',
        },
      }))
      return []
    }
  }

  const loadRatings = async (currentSession) => {
    if (!supabase || !currentSession) {
      return {}
    }

    const { data, error } = await supabase
      .from('user_movie_ratings')
      .select('movie_id, movie_title, genres, rating, selected_genre, source, interaction_context, notes, watched_at, updated_at')
      .eq('user_id', currentSession.user.id)
      .order('updated_at', { ascending: false })

    if (error) {
      setMovieError(error.message)
      return {}
    }

    const nextRatings = {}
    data.forEach((entry) => {
      nextRatings[entry.movie_id] = {
        movie_id: entry.movie_id,
        title: entry.movie_title,
        genres: entry.genres || [],
        rating: Number(entry.rating),
        selected_genre: entry.selected_genre,
        source: entry.source,
        interaction_context: entry.interaction_context || {},
        notes: entry.notes,
        watched_at: entry.watched_at,
        updated_at: entry.updated_at,
      }
    })

    setRatedMovies(nextRatings)
    const nextFavoriteGenres = buildFavoriteGenres(nextRatings)
    setPreferredGenres((current) => mergeUniqueGenres(current, nextFavoriteGenres))
    return nextRatings
  }

  const loadProfile = async (currentSession) => {
    if (!supabase || !currentSession) {
      return { profile: null, error: null }
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('selected_genre, preferred_genres, selected_content_filter, selected_media_type, onboarding_completed, email_verified, full_name')
      .eq('id', currentSession.user.id)
      .maybeSingle()

    if (error) {
      return { profile: null, error }
    }

    return {
      profile: data,
      error: null,
    }
  }

  const saveProfilePreferences = async (currentSession, nextValues = {}) => {
    if (!supabase || !currentSession) {
      return
    }

    const payload = {
      id: currentSession.user.id,
      updated_at: new Date().toISOString(),
    }

    if (Object.prototype.hasOwnProperty.call(nextValues, 'selected_genre')) {
      payload.selected_genre = nextValues.selected_genre
    }

    if (Object.prototype.hasOwnProperty.call(nextValues, 'preferred_genres')) {
      payload.preferred_genres = nextValues.preferred_genres
    }

    if (Object.prototype.hasOwnProperty.call(nextValues, 'selected_content_filter')) {
      payload.selected_content_filter = nextValues.selected_content_filter
    }

    if (Object.prototype.hasOwnProperty.call(nextValues, 'selected_media_type')) {
      payload.selected_media_type = nextValues.selected_media_type
    }

    if (Object.prototype.hasOwnProperty.call(nextValues, 'onboarding_completed')) {
      payload.onboarding_completed = nextValues.onboarding_completed
    }

    const { error } = await supabase.from('profiles').upsert(payload)

    if (error) {
      setMovieError(error.message)
    }
  }

  const safeGetSession = async () => {
    if (!supabase) {
      return { session: null, error: null }
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data, error } = await supabase.auth.getSession()
      if (!error) {
        return { session: data.session, error: null }
      }

      if (!isSupabaseLockRaceError(error) || attempt === 2) {
        return { session: null, error }
      }

      await wait(120 * (attempt + 1))
    }

    return { session: null, error: null }
  }

  useEffect(() => {
    const initialize = async () => {
      await loadGenres()

      setLoadingMovies(true)
      setMovieError('')

      try {
        await Promise.all([loadLiveCatalog(), loadTrending(), loadHighlyRated()])
      } catch (error) {
        setMovieError(error?.message || 'Failed to load FilmFind')
      } finally {
        setLoadingMovies(false)
      }
    }

    initialize()
  }, [])

  useEffect(() => {
    const syncSession = async () => {
      if (!supabase) {
        setAuthMessage('Add your Supabase URL and anon key to enable signup and login.')
        return
      }

      const currentUrl = new URL(window.location.href)
      const cleanupAuthUrl = () => {
        currentUrl.searchParams.delete('code')
        currentUrl.searchParams.delete('type')
        currentUrl.searchParams.delete('error')
        currentUrl.searchParams.delete('error_code')
        currentUrl.searchParams.delete('error_description')
        const query = currentUrl.searchParams.toString()
        window.history.replaceState({}, document.title, `${currentUrl.pathname}${query ? `?${query}` : ''}`)
      }

      const hashParams = new URLSearchParams((currentUrl.hash || '').replace(/^#/, ''))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const hashErrorDescription = hashParams.get('error_description')

      // Handle email verification callbacks that return tokens in URL hash.
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (error) {
          setAuthMessage(error.message || 'Email verification succeeded but sign-in session could not be created.')
        } else {
          currentUrl.hash = ''
          cleanupAuthUrl()
          setAuthMessage('Email verified successfully. You are now logged in.')
        }
      } else if (hashErrorDescription) {
        const message = decodeURIComponent(hashErrorDescription.replace(/\+/g, ' '))
        setAuthMode('signup')
        setAuthMessage(message || 'Email verification failed. Please try signup again.')
        currentUrl.hash = ''
        cleanupAuthUrl()
      }

      const queryErrorDescription = currentUrl.searchParams.get('error_description')
      if (queryErrorDescription) {
        const message = decodeURIComponent(queryErrorDescription.replace(/\+/g, ' '))
        setAuthMode('signup')
        setAuthMessage(message || 'Email verification failed. Please try signup again.')
        cleanupAuthUrl()
      }

      if (currentUrl.searchParams.has('code')) {
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href)
        if (error) {
          setAuthMessage(error.message || 'Email verification succeeded but sign-in session could not be created.')
        } else {
          cleanupAuthUrl()
          setAuthMessage('Email verified successfully. You are now logged in.')
        }
      }

      const { session: resolvedSession, error: sessionError } = await safeGetSession()
      if (sessionError && !isSupabaseLockRaceError(sessionError)) {
        setAuthMessage(sessionError.message || 'Failed to restore session.')
      }

      setSession(resolvedSession)

      if (resolvedSession) {
        const { profile, error: profileError } = await loadProfile(resolvedSession)
        if (profileError) {
          setAuthMessage(profileError.message || 'Failed to restore profile settings.')
        }

        if (profile) {
          setSelectedGenre(profile.selected_genre || ALL_GENRES)
          setSelectedContentFilter(profile.selected_content_filter || 'all')
          setSelectedMediaType(profile.selected_media_type || getContentFilterDetails(profile.selected_content_filter || 'all').mediaType)
          setPreferredGenres(Array.isArray(profile.preferred_genres) ? profile.preferred_genres : [])
        }

        const nextRatings = await loadRatings(resolvedSession)
        await loadTrending()
        await loadLiveCatalog()
        await loadPersonalized(nextRatings)

        const needsOnboarding = profile?.onboarding_completed === false
        setActiveTab(needsOnboarding ? 'personalize' : 'home')
        if (needsOnboarding) {
          await saveProfilePreferences(resolvedSession, { onboarding_completed: true })
        }

        setProfileLoaded(true)
      }

      if (!resolvedSession) {
        setProfileLoaded(true)
      }
    }

    syncSession()

    if (!supabase) {
      return undefined
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      setSession(nextSession)

      if (event === 'SIGNED_IN' && nextSession) {
        setAuthMessage('Logged in successfully.')
        setShowAuthModal(false)
        const { profile, error: profileError } = await loadProfile(nextSession)
        if (profileError) {
          setAuthMessage(profileError.message || 'Failed to restore profile settings.')
        }

        if (profile) {
          setSelectedGenre(profile.selected_genre || ALL_GENRES)
          setSelectedContentFilter(profile.selected_content_filter || 'all')
          setSelectedMediaType(profile.selected_media_type || getContentFilterDetails(profile.selected_content_filter || 'all').mediaType)
          setPreferredGenres(Array.isArray(profile.preferred_genres) ? profile.preferred_genres : [])
        }

        const nextRatings = await loadRatings(nextSession)
        await loadTrending()
        await loadLiveCatalog()
        await loadPersonalized(nextRatings)
        const needsOnboarding = profile?.onboarding_completed === false
        setActiveTab(needsOnboarding ? 'personalize' : 'home')
        if (needsOnboarding) {
          await saveProfilePreferences(nextSession, { onboarding_completed: true })
        }
        setProfileLoaded(true)
        return
      }

      if (event === 'SIGNED_OUT') {
        setShowAuthModal(false)
        setAuthLoading(false)
        setActiveTab('home')
        setSelectedDetail(null)
        setRatedMovies({})
        setPreferredGenres([])
        setPersonalizedMovies([])
        setSearchQuery('')
        setSelectedGenre(ALL_GENRES)
        setSelectedMediaType('all')
        setSelectedContentFilter('all')
        setSelectedMood(MOODS[0])
        setAuthMessage('Logged out.')
        setRatingMessage('')
        setMovieError('')
        setProfileLoaded(false)
        await loadLiveCatalog()
        await loadTrending()
        return
      }

      if (nextSession) {
        const nextRatings = await loadRatings(nextSession)
        await loadTrending()
        await loadLiveCatalog()
        await loadPersonalized(nextRatings)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const refreshRows = async () => {
      setLoadingMovies(true)
      setMovieError('')
      const hasSearchQuery = searchQuery.trim().length > 0

      try {
        await loadLiveCatalog()

        if (!hasSearchQuery) {
          await loadTrending()
          await loadHighlyRated()
        } else {
          setHighlyRatedMovies([])
        }

        if (session && !hasSearchQuery) {
          await loadPersonalized()
        } else if (hasSearchQuery) {
          setPersonalizedMovies([])
        }
      } catch (error) {
        setMovieError(error?.message || 'Failed to refresh feed')
      } finally {
        setLoadingMovies(false)
      }
    }

    refreshRows()
  }, [session, selectedGenre, selectedMediaType, selectedContentFilter, searchQuery, preferredGenres, selectedMood])

  useEffect(() => {
    if (!session || !profileLoaded || !supabase) {
      return undefined
    }

    const persistSelections = async () => {
      await saveProfilePreferences(session, {
        selected_genre: selectedGenreValue,
        preferred_genres: preferredGenres,
        selected_content_filter: selectedContentFilter,
        selected_media_type: selectedMediaType,
      })
    }

    persistSelections()
    return undefined
  }, [session, profileLoaded, selectedGenreValue, selectedContentFilter, selectedMediaType])

  useEffect(() => {
    if (!session || activeTab !== 'personalize' || !profileLoaded) {
      return undefined
    }

    const genresToRender = preferredGenres.map((genre) => String(genre || '').trim()).filter(Boolean)
    const nextKeys = new Set(genresToRender)

    setGenrePreviewRows((current) => {
      const next = {}
      Object.entries(current).forEach(([genre, value]) => {
        if (nextKeys.has(genre)) {
          next[genre] = value
        }
      })
      return next
    })

    genresToRender.forEach((genre) => {
      void loadGenrePreview(genre, selectedMediaType)
    })

    return undefined
  }, [session, activeTab, profileLoaded, selectedMediaType, preferredGenres])

  const applyContentFilter = (filterKey) => {
    setSelectedContentFilter(filterKey)

    setSelectedMediaType(getContentFilterDetails(filterKey).mediaType)
  }

  useEffect(() => {
    // Personalization page is account-only. If the user session is gone, return to home.
    if (!session && activeTab === 'personalize') {
      setActiveTab('home')
    }
  }, [session, activeTab])

  useEffect(() => {
    // Keep URL in sync with view state.
    if (activeTab === 'detail') {
      if (!selectedDetail?.movie_id) {
        return
      }

      const media = selectedDetail.media_type ? `?media=${selectedDetail.media_type}` : ''
      setHashRoute(`#detail/${selectedDetail.movie_id}${media}`)
      return
    }

    if (activeTab === 'personalize') {
      setHashRoute('#personalize')
      return
    }

    if (activeTab === 'collection' && selectedCollection?.slug && selectedCollection?.label) {
      setHashRoute(
        `#collection/${selectedCollection.slug}?genre=${encodeURIComponent(selectedCollection.label)}&type=${selectedCollection.mode || 'genre'}`,
      )
      return
    }

    setHashRoute('#home')
  }, [activeTab, selectedDetail?.movie_id, selectedDetail?.media_type, selectedCollection?.slug, selectedCollection?.label])

  useEffect(() => {
    const applyHashRoute = async () => {
      const rawHash = window.location.hash || '#home'

      if (rawHash.startsWith('#detail/')) {
        const [detailPath, queryString] = rawHash.slice(1).split('?')
        const idPart = detailPath.split('/')[1]
        const movieId = Number(idPart)

        if (!Number.isFinite(movieId) || movieId <= 0) {
          setActiveTab('home')
          return
        }

        const params = new URLSearchParams(queryString || '')
        const mediaType = params.get('media')

        setActiveTab('detail')
        setDetailError('')
        setDetailLoading(true)

        try {
          const detail = await getMovieDetail(movieId, mediaType || null)
          setSelectedDetail(detail)
        } catch (error) {
          setDetailError(error?.message || 'Failed to load title details.')
        } finally {
          setDetailLoading(false)
        }

        return
      }

      if (rawHash.startsWith('#collection/')) {
        const [, queryString] = rawHash.slice(1).split('?')
        const params = new URLSearchParams(queryString || '')
        const genre = params.get('genre')
        const type = params.get('type') || 'genre'

        if (!genre) {
          setActiveTab('home')
          return
        }

        await loadCollectionByGenre(genre, type)
        return
      }

      if (rawHash === '#personalize') {
        setActiveTab(session ? 'personalize' : 'home')
        return
      }

      setActiveTab('home')
    }

    applyHashRoute()
    window.addEventListener('hashchange', applyHashRoute)
    return () => window.removeEventListener('hashchange', applyHashRoute)
  }, [session])

  // Search is now handled by SearchBar component

  const handleAuth = async (mode, event) => {
    event.preventDefault()

    if (!supabase) {
      setAuthMessage('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      return
    }

    setAuthLoading(true)
    setAuthMessage('')

    try {
      if (mode === 'signup') {
        const { data, error } = await withTimeout(
          supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName,
              },
              emailRedirectTo: authRedirectUrl,
            },
          }),
          AUTH_TIMEOUT_MS,
          'Sign up timed out. Check your network and Supabase settings.',
        )

        if (error) {
          throw error
        }

        if (data.session) {
          setSession(data.session)
          setShowAuthModal(false)
          setAuthMessage('Account created. You are signed in.')
        } else {
          setAuthMode('login')
          setAuthMessage('Check your inbox and confirm your email before logging in.')
        }
      } else {
        // Avoid strict timeout on login to prevent false failures on slower networks.
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })

        if (error) {
          if (isUnconfirmedEmailError(error)) {
            setAuthMode('signup')
            setAuthMessage('That email is not confirmed yet. Please check your inbox or continue with sign up.')
            return
          }

          throw error
        }

        setSession(data.session)
        setShowAuthModal(false)
        setAuthMessage('Logged in successfully.')
      }
    } catch (error) {
      if (isSupabaseLockRaceError(error)) {
        const { session: resolvedSession } = await safeGetSession()
        if (resolvedSession) {
          setSession(resolvedSession)
          setAuthMessage('Logged in successfully.')
          setShowAuthModal(false)
        } else {
          setAuthMessage('Session is syncing. Please try login once more.')
        }
      } else if (String(error?.message || '').toLowerCase().includes('timed out')) {
        // If timeout happened client-side, verify whether session was actually created.
        const { session: resolvedSession } = await safeGetSession()
        if (resolvedSession) {
          setSession(resolvedSession)
          setAuthMessage('Logged in successfully.')
          setShowAuthModal(false)
        } else {
          setAuthMessage('Login is taking longer than expected. Please try again in a few seconds.')
        }
      } else {
        setAuthMessage(error.message || 'Authentication failed')
      }
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    if (!supabase) {
      return
    }

    setAuthLoading(true)
    setAuthMessage('Logging out...')

    setSession(null)
    setActiveTab('home')
    setSelectedDetail(null)
    setRatedMovies({})
    setPreferredGenres([])
    setTrendingMovies([])
    setPersonalizedMovies([])
    setSearchQuery('')
    setSelectedGenre(ALL_GENRES)
    setSelectedMediaType('all')
    setSelectedContentFilter('all')
    setSelectedMood(MOODS[0])
    setAuthMessage('Logged out.')
    setRatingMessage('')
    setMovieError('')

    try {
      await supabase.auth.signOut({ scope: 'global' })
    } catch (error) {
      if (!isSupabaseLockRaceError(error)) {
        setMovieError(error.message || 'Failed to sign out.')
      }
    } finally {
      // Do not leave auth actions locked if sign out or refresh calls fail.
      setAuthLoading(false)
    }

    await Promise.allSettled([loadTrending(), loadLiveCatalog()])
  }

  const requestLogout = () => {
    setShowLogoutConfirm(true)
  }

  const confirmLogout = async () => {
    setShowLogoutConfirm(false)
    await handleLogout()
  }

  const persistMovieRating = async (movie, rating) => {
    if (!session || !supabase) {
      setAuthMessage('Please log in to save ratings and personalize FilmFind.')
      return
    }

    const previousRatings = ratedMovies
    const optimisticRatings = {
      ...previousRatings,
      [movie.movie_id]: {
        movie_id: movie.movie_id,
        title: movie.title,
        genres: movie.genres,
        rating,
        selected_genre: selectedGenreValue,
        source: 'manual',
        interaction_context: {
          selected_genre: selectedGenreValue,
          source: 'manual',
          feedback_type: 'rating',
        },
        watched_at: new Date().toISOString(),
      },
    }

    // Optimistic update so reaction color changes immediately on click.
    setRatedMovies(optimisticRatings)
    setPreferredGenres(buildFavoriteGenres(optimisticRatings))

    const payload = {
      user_id: session.user.id,
      movie_id: movie.movie_id,
      movie_title: movie.title,
      genres: movie.genres,
      rating,
      feedback_type: 'rating',
      is_liked: false,
      is_disliked: false,
      selected_genre: selectedGenreValue,
      source: 'manual',
      interaction_context: {
        selected_genre: selectedGenreValue,
        source: 'manual',
        feedback_type: 'rating',
      },
    }

    const { error: deleteError } = await supabase
      .from('user_movie_ratings')
      .delete()
      .eq('user_id', session.user.id)
      .eq('movie_id', movie.movie_id)

    if (deleteError) {
      setRatedMovies(previousRatings)
      setPreferredGenres(buildFavoriteGenres(previousRatings))
      setRatingMessage(deleteError.message)
      return
    }

    const { error } = await supabase.from('user_movie_ratings').insert(payload)

    if (error) {
      // Roll back optimistic UI state if persistence fails.
      setRatedMovies(previousRatings)
      setPreferredGenres(buildFavoriteGenres(previousRatings))
      setRatingMessage(error.message)
      return
    }

    setRatedMovies((current) => ({
      ...current,
      [movie.movie_id]: {
        ...optimisticRatings[movie.movie_id],
        source: payload.source,
        interaction_context: payload.interaction_context,
      },
    }))
    setRatingMessage(`${movie.title} rated ${rating}/5.`)
    await loadPersonalized(optimisticRatings)
  }

  const togglePreferredGenre = (genre) => {
    setPreferredGenres((current) => {
      const exists = current.includes(genre)
      const next = exists
        ? current.filter((item) => item !== genre)
        : mergeUniqueGenres(current, [genre])

      return next
    })
  }

  const openLogin = () => {
    setAuthLoading(false)
    setAuthMode('login')
    setSearchQuery('')
    setSearchResetSignal((value) => value + 1)
    setShowAuthModal(true)
  }

  const openSignup = () => {
    setAuthLoading(false)
    setAuthMode('signup')
    setSearchQuery('')
    setSearchResetSignal((value) => value + 1)
    setShowAuthModal(true)
  }

  const openTitleDetail = async (movie) => {
    if (!movie?.movie_id) {
      return
    }

    const mediaHint = movie.media_type ? `?media=${movie.media_type}` : ''
    setHashRoute(`#detail/${movie.movie_id}${mediaHint}`)
    setSearchCloseSignal((value) => value + 1)
    setActiveTab('detail')
    setDetailError('')
    setDetailLoading(true)

    try {
      const detail = await getMovieDetail(movie.movie_id, movie.media_type || null)
      setSelectedDetail(detail)
    } catch (error) {
      setSelectedDetail({
        ...movie,
        overview: movie.overview || 'No storyline available.',
        actors: movie.actors || [],
        cast_members: [],
        directors: [],
        duration_minutes: null,
        release_date: movie.release_date || null,
      })
      if (error?.message) {
        setDetailError(error.message)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  const openCollection = async (label, mode = 'genre') => {
    await loadCollectionByGenre(label, mode)
  }

  const resetPersonalization = async () => {
    if (!session || !supabase) {
      setAuthMessage('Sign in to reset personalization.')
      return
    }

    const { error } = await supabase.from('user_movie_ratings').delete().eq('user_id', session.user.id)
    if (error) {
      setRatingMessage(error.message)
      return
    }

    setRatedMovies({})
    setPreferredGenres([])
    setSelectedMood(MOODS[0])
    setSearchQuery('')
    setSearchResetSignal((value) => value + 1)
    setSelectedDetail(null)
    setPersonalizedMovies([])
    setActiveTab('home')
    setRatingMessage('Personalization reset successfully.')

    await saveProfilePreferences(session, { preferred_genres: [] })

    await loadGenres()
    await Promise.allSettled([loadTrending(), loadLiveCatalog(), loadPersonalized({})])
  }

  const topRankedMovies = filteredLiveCatalog.slice(0, 10)

  const guestRails = useMemo(() => {
    const bucket = new Map()

    filteredLiveCatalog.forEach((movie) => {
      const movieGenres = Array.isArray(movie.genres) && movie.genres.length > 0 ? movie.genres : ['Featured']

      // Add a title into up to 2 genre rows so each row has enough cards to feel complete.
      movieGenres.slice(0, 2).forEach((label) => {
        if (!bucket.has(label)) {
          bucket.set(label, [])
        }

        const current = bucket.get(label)
        if (current.some((item) => item.movie_id === movie.movie_id)) {
          return
        }

        if (current.length < 12) {
          current.push(movie)
        }
      })
    })

    const primaryRails = Array.from(bucket.entries())
      .filter(([, items]) => items.length >= 6)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3)
      .map(([label, items]) => ({
        label,
        items,
      }))

    if (primaryRails.length >= 3) {
      return primaryRails
    }

    const fallbackItems = filteredLiveCatalog.slice(0, 12)
    while (primaryRails.length < 3 && fallbackItems.length > 0) {
      primaryRails.push({
        label: primaryRails.length === 0 ? 'Featured' : `Popular picks ${primaryRails.length}`,
        items: fallbackItems,
      })
    }

    return primaryRails
  }, [filteredLiveCatalog])

  const personalizedRailMovies = filteredPersonalizedMovies
  const trendingPreviewMovies = filteredTrendingMovies
  const highlyRatedRailMovies = filterMovies(highlyRatedMovies, searchQuery, selectedGenreValue, selectedContentFilter)
  const searchResultMovies = filteredLiveCatalog
  const normalizedSearchQuery = searchQuery.trim()
  const hasActiveSearch = normalizedSearchQuery.length > 0
  const displayName = (session?.user?.user_metadata?.full_name || '').trim() || session?.user?.email?.split('@')?.[0] || 'viewer'
  const visibleMovieError = movieError
  const visibleAuthMessage =
    session && /timed out|supabase settings|check your network/i.test(String(authMessage || '')) ? '' : authMessage

  return (
    <div className="stream-bg min-h-screen text-white">
      <div className="stream-grain" />
      <main className="stream-shell">
        <header className="stream-topbar">
          <div className="brand-wrap">
            <button
              type="button"
              className="brand-logo-button"
              onClick={() => setActiveTab('home')}
              aria-label="Go to home page"
            >
              <img src="/logo.png" alt="FilmFind" className="brand-logo" />
            </button>
            <div className="brand-copy">
              <p className="brand-tagline">Find Your Next Film</p>
            </div>
            <nav className={session ? 'stream-nav' : 'stream-nav is-hidden'} aria-label="Primary navigation" aria-hidden={!session}>
              <button type="button" className={activeTab === 'home' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('home')}>
                Home
              </button>
              <button
                type="button"
                className={activeTab === 'personalize' ? 'nav-tab active' : 'nav-tab'}
                onClick={() => setActiveTab('personalize')}
              >
                Personalize
              </button>
            </nav>
          </div>

          <div className="topbar-search">
            <SearchBar
              onSearch={(query) => {
                setSearchQuery(query.trim())
              }}
              onCommitSearch={(query) => {
                if (activeTab === 'detail' && query.trim()) {
                  setActiveTab('home')
                }
              }}
              loading={loadingMovies}
              resetSignal={searchResetSignal}
              closeSignal={searchCloseSignal}
            />
          </div>

          <div className="stream-actions">
            {session ? (
              <>
                <span className="pill">{displayName}</span>
                <button type="button" className="pill ghost" onClick={requestLogout} disabled={authLoading}>
                  Logout
                </button>
              </>
            ) : (
              <>
                <button type="button" className="pill ghost" onClick={openLogin}>
                  Sign in
                </button>
                <button type="button" className="pill" onClick={openSignup}>
                  Join now
                </button>
              </>
            )}
          </div>
        </header>

        {visibleAuthMessage && (
          <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
            {visibleAuthMessage}
          </div>
        )}

        {activeTab === 'detail' ? (
          <section className="detail-page mt-5">
            {detailLoading ? (
              <p className="empty-copy">Loading title details...</p>
            ) : selectedDetail ? (
              <>
                {selectedDetail.backdrop_url ? (
                  <div className="detail-backdrop-wrap">
                    <img src={selectedDetail.backdrop_url} alt={selectedDetail.title} className="detail-backdrop" />
                  </div>
                ) : null}

                <div className="detail-content">
                  <div className="detail-poster-col">
                    {selectedDetail.poster_url ? (
                      <img src={selectedDetail.poster_url} alt={selectedDetail.title} className="detail-poster" />
                    ) : null}
                  </div>

                  <div className="detail-meta-col">
                    <h1 className="detail-title">{selectedDetail.title}</h1>
                    <p className="detail-sub">
                      {(selectedDetail.media_type || 'title').toUpperCase()} • {selectedDetail.release_date || 'Release date unavailable'}
                      {selectedDetail.duration_minutes ? ` • ${selectedDetail.duration_minutes}m` : ''}
                      {Number(selectedDetail.score || 0) > 0 ? ` • TMDB ${Number(selectedDetail.score).toFixed(1)}/10` : ''}
                    </p>

                    <div className="genre-row mt-3">
                      {(selectedDetail.genres || []).map((genre) => (
                        <span key={genre} className="genre-chip">{genre}</span>
                      ))}
                    </div>

                    <p className="empty-copy mt-4">{selectedDetail.overview || selectedDetail.semantic_text || 'No storyline available.'}</p>

                    {(selectedDetail.actors || []).length > 0 ? (
                      <p className="empty-copy mt-3">
                        <strong>Cast:</strong> {selectedDetail.actors.slice(0, 8).join(', ')}
                      </p>
                    ) : null}

                    {(selectedDetail.directors || []).length > 0 ? (
                      <p className="empty-copy mt-2">
                        <strong>Directors:</strong> {selectedDetail.directors.map((person) => person.name).join(', ')}
                      </p>
                    ) : null}

                    {(selectedDetail.cast_members || []).length > 0 ? (
                      <div className="cast-grid mt-4">
                        {selectedDetail.cast_members.slice(0, 8).map((member) => (
                          <div key={`${member.name}-${member.role || 'cast'}`} className="cast-card">
                            {member.profile_url ? <img src={member.profile_url} alt={member.name} className="cast-photo" /> : null}
                            <p className="cast-name">{member.name}</p>
                            {member.role ? <p className="cast-role">{member.role}</p> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {detailError ? <p className="error-copy mt-2">{detailError}</p> : null}

                    {session ? (
                      <div className="detail-actions mt-4">
                        <p className="empty-copy w-full">Already watched it? Rate it for better personalization.</p>
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={ratedMovies[selectedDetail.movie_id]?.rating === value ? 'media-chip active' : 'media-chip'}
                            onClick={() => persistMovieRating(selectedDetail, value)}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button type="button" className="pill mt-4" onClick={openLogin}>Sign in to rate</button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="empty-copy">Select a movie or series to view details.</p>
            )}
          </section>
        ) : activeTab === 'personalize' ? (
          <section className="dashboard-shell mt-5" id="profile">
            {session ? (
              <>
                <h2 className="panel-heading">Personalize your home</h2>
                <p className="empty-copy">Choose your mood and preferred genres, or reset your recommendation profile.</p>

                <div className="genre-row mt-4">
                  {MOODS.map((mood) => (
                    <button
                      key={mood}
                      type="button"
                      onClick={() => setSelectedMood(mood)}
                      className={selectedMood === mood ? 'genre-chip active' : 'genre-chip'}
                    >
                      {mood}
                    </button>
                  ))}
                </div>

                <div className="genre-row mt-4">
                  {genres
                    .filter((genre) => genre !== ALL_GENRES)
                    .map((genre) => (
                      <button
                        key={genre}
                        type="button"
                        onClick={() => togglePreferredGenre(genre)}
                        className={preferredGenres.includes(genre) ? 'genre-chip active' : 'genre-chip'}
                      >
                        {genre}
                      </button>
                    ))}
                </div>

                <div className="detail-actions mt-4">
                  <button type="button" className="pill" onClick={() => setActiveTab('home')}>Apply to Home</button>
                  <button type="button" className="pill ghost" onClick={resetPersonalization}>Reset Personalization</button>
                </div>

                <div className="mt-5 space-y-5">
                  {preferredGenres.length > 0 ? (
                    preferredGenres.map((genre) => {
                      const previewState = genrePreviewRows[genre] || { items: [], loading: true, error: '' }

                      return (
                        <div key={genre} className="genre-preview-block">
                          <div className="row-head">
                            <h2>{genre}</h2>
                            <span>{previewState.loading ? 'Loading...' : `${previewState.items.length} titles`}</span>
                          </div>

                          {previewState.error ? <p className="error-copy">{previewState.error}</p> : null}

                          {previewState.loading ? (
                            <p className="empty-copy">Loading {genre} titles...</p>
                          ) : previewState.items.length > 0 ? (
                            <div className="poster-scroller compact">
                              {previewState.items.map((movie) => (
                                <PosterTile
                                  key={`genre-preview-${genre}-${movie.movie_id}`}
                                  movie={movie}
                                  tag={movie.media_type === 'tv' ? 'Series' : 'Movie'}
                                  onOpen={openTitleDetail}
                                />
                              ))}
                            </div>
                          ) : (
                            <p className="empty-copy">No titles found for {genre} yet.</p>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <p className="empty-copy">Select one or more genres above to preview live titles here.</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2 className="panel-heading">Sign in required</h2>
                <p className="empty-copy">Personalization is available only for logged-in users.</p>
                <div className="detail-actions mt-4">
                  <button type="button" className="pill" onClick={openLogin}>Sign in to personalize</button>
                </div>
              </>
            )}
          </section>
        ) : activeTab === 'collection' ? (
          <section className="dashboard-shell mt-5">
            <div className="row-head">
              <h2>{selectedCollection?.label || 'Collection'}</h2>
              <button type="button" className="row-link" onClick={() => setActiveTab('home')}>Back to Home</button>
            </div>

            {collectionLoading ? (
              <p className="empty-copy">Loading {selectedCollection?.label || 'collection'}...</p>
            ) : collectionError ? (
              <p className="error-copy">{collectionError}</p>
            ) : collectionMovies.length > 0 ? (
              <div className="collection-grid">
                {collectionMovies.map((movie) => (
                  <PosterTile
                    key={`collection-${selectedCollection?.slug || 'all'}-${movie.movie_id}`}
                    movie={movie}
                    tag={movie.media_type === 'tv' ? 'Series' : 'Movie'}
                    onOpen={openTitleDetail}
                  />
                ))}
              </div>
            ) : (
              <p className="empty-copy">No titles found for this collection.</p>
            )}
          </section>
        ) : (
          <>
        <section id="browse" className="filter-stack">
          <p className="filter-label">Filter by type</p>
          <div className="genre-row mt-2">
            {CONTENT_FILTERS.map((filterOption) => (
              <button
                key={filterOption.key}
                type="button"
                onClick={() => applyContentFilter(filterOption.key)}
                className={selectedContentFilter === filterOption.key ? 'media-chip active' : 'media-chip'}
              >
                {filterOption.label}
              </button>
            ))}
          </div>

          <p className="filter-label mt-3">Filter by genre</p>
          <div className="genre-row mt-2">
            {sortedGenres.map((genre) => (
              <button
                key={genre}
                type="button"
                onClick={() => {
                  setSelectedGenre(genre)
                }}
                className={selectedGenre === genre ? 'genre-chip active' : 'genre-chip'}
              >
                {genre}
              </button>
            ))}
          </div>
        </section>

        {visibleMovieError && <p className="error-copy">{visibleMovieError}</p>}
        {ratingMessage && <p className="success-copy">{ratingMessage}</p>}

        {!session ? (
          <>
            <section className="row-block">
              <div className="row-head">
                <h2>{hasActiveSearch ? `Search results for "${normalizedSearchQuery}"` : 'Trending now'}</h2>
                <span>{hasActiveSearch ? `${topRankedMovies.length} matches` : 'Top 10 this week'}</span>
              </div>
              {loadingMovies ? (
                <p className="empty-copy">{hasActiveSearch ? 'Searching titles...' : 'Loading trending titles...'}</p>
              ) : (
                <div className="poster-scroller ranked">
                  {topRankedMovies.map((movie, index) => (
                    <PosterTile
                      key={movie.movie_id}
                      movie={movie}
                      rank={index + 1}
                      tag={movie.genres?.[0] || 'Movie'}
                      onOpen={openTitleDetail}
                    />
                  ))}
                </div>
              )}
            </section>

            {!hasActiveSearch && guestRails.map((rail) => (
              <section className="row-block" key={rail.label}>
                <div className="row-head">
                  <h2>{rail.label}</h2>
                  <button type="button" className="row-link" onClick={() => openCollection(rail.label)}>See more</button>
                </div>
                <div className="poster-scroller compact">
                  {rail.items.map((movie) => (
                    <PosterTile key={`${rail.label}-${movie.movie_id}`} movie={movie} tag="HD" onOpen={openTitleDetail} />
                  ))}
                </div>
              </section>
            ))}

            {!hasActiveSearch && (
              <section className="row-block">
                <div className="row-head">
                  <h2>Highly Rated</h2>
                  <button type="button" className="row-link" onClick={() => openCollection('Highly Rated', 'highly-rated')}>See more</button>
                </div>
                {highlyRatedRailMovies.length > 0 ? (
                  <div className="poster-scroller compact">
                    {highlyRatedRailMovies.map((movie) => (
                      <PosterTile key={`highly-${movie.movie_id}`} movie={movie} tag={`${Number(movie.score || 0).toFixed(1)} TMDB`} onOpen={openTitleDetail} />
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">Loading highly rated titles...</p>
                )}
              </section>
            )}

            <section className="dashboard-shell mt-5">
              <div className="dashboard-grid">
                <div className="rating-column">
                  <h2 className="panel-heading">How personalization works</h2>
                  <p className="empty-copy">
                    Your login unlocks a preference studio. Choose a mood, mark favorite genres, then rate movies so FilmFind can tune the rows.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Sign in</p>
                      <p className="mt-2 text-sm text-slate-200">Create a profile or sign in to store ratings and build a home feed.</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Rate titles</p>
                      <p className="mt-2 text-sm text-slate-200">Your 1-5 ratings train the personalized rows over time.</p>
                    </div>
                  </div>
                </div>

                <div className="feed-column">
                  <h2 className="panel-heading">Preview your future profile</h2>
                  {loadingMovies ? (
                    <p className="empty-copy">Loading preview...</p>
                  ) : (
                    <div className="poster-scroller compact">
                      {trendingPreviewMovies.map((movie) => (
                        <PosterTile
                          key={movie.movie_id}
                          movie={movie}
                          tag={movie.media_type === 'tv' ? 'Series' : 'Movie'}
                          onOpen={openTitleDetail}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="dashboard-shell mt-5" id="profile">
              <div className="dashboard-grid dashboard-grid-single">

                <section className="feed-column">
                  <h2 className="panel-heading">{hasActiveSearch ? `Search results for "${normalizedSearchQuery}"` : 'Trending now'}</h2>
                  {loadingMovies ? (
                    <p className="empty-copy">{hasActiveSearch ? 'Searching titles...' : 'Loading recommendations...'}</p>
                  ) : (
                    hasActiveSearch ? (
                      searchResultMovies.length > 0 ? (
                        <div className="poster-scroller compact">
                          {searchResultMovies.map((movie) => (
                            <PosterTile
                              key={movie.movie_id}
                              movie={movie}
                              tag={movie.media_type === 'tv' ? 'Series' : 'Movie'}
                              onOpen={openTitleDetail}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="empty-copy">No results found. Try a shorter title or different keywords.</p>
                      )
                    ) : (
                      <div className="poster-scroller compact">
                        {trendingPreviewMovies.map((movie) => (
                          <PosterTile
                            key={movie.movie_id}
                            movie={movie}
                            tag={movie.media_type === 'tv' ? 'Series' : 'Movie'}
                            onOpen={openTitleDetail}
                          />
                        ))}
                      </div>
                    )
                  )}

                  {!hasActiveSearch && (
                    <>
                      <h2 className="panel-heading mt-6">Highly Rated</h2>
                      {loadingMovies ? (
                        <p className="empty-copy">Loading highly rated titles...</p>
                      ) : highlyRatedRailMovies.length > 0 ? (
                        <div className="poster-scroller compact">
                          {highlyRatedRailMovies.map((movie) => (
                            <PosterTile
                              key={`logged-highly-${movie.movie_id}`}
                              movie={movie}
                              tag={`${Number(movie.score || 0).toFixed(1)} TMDB`}
                              onOpen={openTitleDetail}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="empty-copy">No highly rated titles found for this filter.</p>
                      )}

                      <h2 className="panel-heading mt-6">Based on your preferences</h2>
                      {loadingMovies ? (
                        <p className="empty-copy">Loading personalized recommendations...</p>
                      ) : !hasPersonalizedSystem ? (
                        <div className="detail-actions mt-2">
                          <p className="empty-copy">Personalized content is empty until you set your preferences.</p>
                          <button type="button" className="pill" onClick={() => setActiveTab('personalize')}>Personalize now</button>
                        </div>
                      ) : personalizedRailMovies.length > 0 ? (
                        <div className="poster-scroller compact">
                          {personalizedRailMovies.map((movie) => (
                            <PosterTile key={`personalized-${movie.movie_id}`} movie={movie} tag="For you" onOpen={openTitleDetail} />
                          ))}
                        </div>
                      ) : (
                        <p className="empty-copy">Rate a few titles to build your personalized feed.</p>
                      )}
                    </>
                  )}
                </section>
              </div>
            </section>
          </>
        )}
          </>
        )}

        {showAuthModal && (
          <div className="fixed inset-0 z-[220] flex items-start justify-center overflow-y-auto bg-black/75 px-4 py-8 md:items-center">
            <div className="relative w-full max-w-md">
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="absolute -right-2 -top-2 z-10 h-9 w-9 rounded-full bg-black/80 text-xl text-white"
              >
                ×
              </button>
              <AuthPanel
                mode={authMode}
                setMode={setAuthMode}
                fullName={fullName}
                setFullName={setFullName}
                email={email}
                setEmail={setEmail}
                password={password}
                setPassword={setPassword}
                loading={authLoading}
                onSubmit={handleAuth}
                message={authMessage}
              />
            </div>
          </div>
        )}

        {showLogoutConfirm && (
          <div className="fixed inset-0 z-[220] flex items-start justify-center overflow-y-auto bg-black/75 px-4 py-8 md:items-center">
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-950/95 p-5">
              <h3 className="text-lg font-semibold text-white">Confirm Logout</h3>
              <p className="mt-2 text-sm text-slate-300">Are you sure you want to logout?</p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className="pill ghost" onClick={() => setShowLogoutConfirm(false)}>
                  Cancel
                </button>
                <button type="button" className="pill" onClick={confirmLogout}>
                  Yes, Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}