import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import AuthPanel from './components/AuthPanel'
import SearchBar from './components/SearchBar'
import { getCatalogGenres, getGenres, getLatestCatalog, getMovieDetail, getPersonalizedMovies, getTrendingMovies } from './lib/api'
import { supabase } from './lib/supabase'

const ALL_GENRES = 'All genres'
const MOODS = ['Cinematic', 'Comfort', 'Thriller', 'Mind-bending']
const AUTH_TIMEOUT_MS = 30000

function isSupabaseLockRaceError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return message.includes('auth-token') && message.includes('stole it')
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

function filterMovies(movies, query) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return movies
  }

  return movies.filter((movie) => {
    const titleMatch = movie.title.toLowerCase().includes(normalized)
    const genreMatch = (movie.genres || []).join(' ').toLowerCase().includes(normalized)
    const actorsMatch = (movie.actors || []).join(' ').toLowerCase().includes(normalized)
    const overviewMatch = String(movie.overview || '').toLowerCase().includes(normalized)
    return titleMatch || genreMatch || actorsMatch || overviewMatch
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

function ThumbUpIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 10V5.5c0-1.2-.8-2.3-1.9-2.7L11 2l-4 8v10h10.2c1.1 0 2.1-.8 2.3-1.9l1.2-6.4A2 2 0 0 0 18.8 10H14z" />
      <path d="M7 10H4.5A1.5 1.5 0 0 0 3 11.5v7A1.5 1.5 0 0 0 4.5 20H7" />
    </svg>
  )
}

function ThumbDownIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 14v4.5c0 1.2.8 2.3 1.9 2.7L13 22l4-8V4H6.8c-1.1 0-2.1.8-2.3 1.9L3.3 12.3A2 2 0 0 0 5.2 14H10z" />
      <path d="M17 14h2.5a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 19.5 4H17" />
    </svg>
  )
}
function buildTasteRadarData(ratedMovies) {
  const counts = new Map()

  Object.values(ratedMovies).forEach((entry) => {
    if (!(entry.is_liked || entry.feedback_type === 'like')) {
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
    if (!(entry.is_liked || entry.feedback_type === 'like')) {
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

export default function App() {
  const [activeTab, setActiveTab] = useState('home')
  const [selectedDetail, setSelectedDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [session, setSession] = useState(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [genres, setGenres] = useState([ALL_GENRES])
  const [selectedGenre, setSelectedGenre] = useState(ALL_GENRES)
  const [selectedMood, setSelectedMood] = useState(MOODS[0])
  const [preferredGenres, setPreferredGenres] = useState([])
  const [trendingMovies, setTrendingMovies] = useState([])
  const [liveCatalog, setLiveCatalog] = useState([])
  const [personalizedMovies, setPersonalizedMovies] = useState([])
  const [loadingMovies, setLoadingMovies] = useState(true)
  const [movieError, setMovieError] = useState('')
  const [ratingMessage, setRatingMessage] = useState('')
  const [ratedMovies, setRatedMovies] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResetSignal, setSearchResetSignal] = useState(0)
  const [selectedMediaType, setSelectedMediaType] = useState('all')

  const selectedGenreValue = selectedGenre === ALL_GENRES ? null : selectedGenre
  const activeGenreForFeed = selectedGenreValue || preferredGenres[0] || null

  const filteredTrendingMovies = useMemo(
    () => filterMovies(trendingMovies, searchQuery),
    [trendingMovies, searchQuery],
  )

  const filteredLiveCatalog = useMemo(
    () => filterMovies(liveCatalog, searchQuery),
    [liveCatalog, searchQuery],
  )

  const filteredPersonalizedMovies = useMemo(
    () => filterMovies(personalizedMovies, searchQuery),
    [personalizedMovies, searchQuery],
  )

  const sortedGenres = useMemo(
    () => genres.filter((genre) => genre !== ALL_GENRES).sort((a, b) => a.localeCompare(b)),
    [genres],
  )

  const favoriteGenres = useMemo(() => buildFavoriteGenres(ratedMovies), [ratedMovies])

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
      const items = await getLatestCatalog({
        media_type: selectedMediaType,
        genre: activeGenreForFeed,
        query: searchQuery || null,
        limit: 24,
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
      const data = await getTrendingMovies(activeGenreForFeed, 12)
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

  const loadPersonalized = async (ratingsSnapshot = ratedMovies) => {
    if (!session) {
      setPersonalizedMovies([])
      return []
    }

    const liked_movies = Object.values(ratingsSnapshot)
      .filter((item) => item.is_liked || item.feedback_type === 'like')
      .map((item) => item.title)

    const disliked_movies = Object.values(ratingsSnapshot)
      .filter((item) => item.is_disliked || item.feedback_type === 'dislike')
      .map((item) => item.title)

    try {
      const data = await getPersonalizedMovies({
        genre: activeGenreForFeed,
        liked_movies,
        disliked_movies,
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

  const loadRatings = async (currentSession) => {
    if (!supabase || !currentSession) {
      return {}
    }

    const { data, error } = await supabase
      .from('user_movie_ratings')
      .select('movie_id, movie_title, genres, rating, feedback_type, is_liked, is_disliked, selected_genre, source, interaction_context, notes, watched_at, updated_at')
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
        feedback_type: entry.feedback_type,
        is_liked: Boolean(entry.is_liked),
        is_disliked: Boolean(entry.is_disliked),
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
    setPreferredGenres(nextFavoriteGenres)
    if (nextFavoriteGenres.length && selectedGenre === ALL_GENRES) {
      setSelectedGenre(nextFavoriteGenres[0])
    }
    return nextRatings
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
        await Promise.all([loadLiveCatalog(), loadTrending()])
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
      if (currentUrl.searchParams.has('code')) {
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href)
        if (error) {
          setAuthMessage(error.message || 'Email verification succeeded but sign-in session could not be created.')
        } else {
          currentUrl.searchParams.delete('code')
          currentUrl.searchParams.delete('type')
          const query = currentUrl.searchParams.toString()
          window.history.replaceState({}, document.title, `${currentUrl.pathname}${query ? `?${query}` : ''}`)
          setAuthMessage('Email verified successfully. You are now logged in.')
        }
      }

      const { session: resolvedSession, error: sessionError } = await safeGetSession()
      if (sessionError && !isSupabaseLockRaceError(sessionError)) {
        setAuthMessage(sessionError.message || 'Failed to restore session.')
      }

      setSession(resolvedSession)

      if (resolvedSession) {
        const nextRatings = await loadRatings(resolvedSession)
        await loadTrending()
        await loadLiveCatalog()
        await loadPersonalized(nextRatings)
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
        const nextRatings = await loadRatings(nextSession)
        await loadTrending()
        await loadLiveCatalog()
        await loadPersonalized(nextRatings)
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
        setSelectedMood(MOODS[0])
        setAuthMessage('Logged out.')
        setRatingMessage('')
        setMovieError('')
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
  }, [session, selectedGenre, selectedMediaType, searchQuery, preferredGenres])

  useEffect(() => {
    // Personalization page is account-only. If the user session is gone, return to home.
    if (!session && activeTab === 'personalize') {
      setActiveTab('home')
    }
  }, [session, activeTab])

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
              emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
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
          setAuthMessage('Check your inbox and confirm your email before logging in.')
        }
      } else {
        // Avoid strict timeout on login to prevent false failures on slower networks.
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })

        if (error) {
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

  const persistMovieFeedback = async (movie, feedback) => {
    if (!session || !supabase) {
      setAuthMessage('Please log in to save ratings and personalize FilmFind.')
      return
    }

    const { rating, feedback_type, is_liked, is_disliked, successMessage } = feedback

    const payload = {
      user_id: session.user.id,
      movie_id: movie.movie_id,
      movie_title: movie.title,
      genres: movie.genres,
      rating,
      feedback_type,
      is_liked,
      is_disliked,
      selected_genre: selectedGenreValue,
      source: 'manual',
      interaction_context: {
        selected_genre: selectedGenreValue,
        source: 'manual',
        feedback_type,
      },
    }

    const { error } = await supabase.from('user_movie_ratings').upsert(payload, {
      onConflict: 'user_id,movie_id',
    })

    if (error) {
      setRatingMessage(error.message)
      return
    }

    const nextRatings = {
      ...ratedMovies,
      [movie.movie_id]: {
        movie_id: movie.movie_id,
        title: movie.title,
        genres: movie.genres,
        rating,
        feedback_type,
        is_liked,
        is_disliked,
        selected_genre: selectedGenreValue,
        source: payload.source,
        interaction_context: payload.interaction_context,
        watched_at: new Date().toISOString(),
      },
    }

    setRatedMovies(nextRatings)
    setRatingMessage(successMessage)
    setPreferredGenres(buildFavoriteGenres(nextRatings))
    await loadPersonalized(nextRatings)
  }

  const handleRate = async (movie, rating) => {
    await persistMovieFeedback(movie, {
      rating,
      feedback_type: 'rating',
      is_liked: false,
      is_disliked: false,
      successMessage: `${movie.title} rated ${rating}/5.`,
    })
  }

  const handleLike = async (movie) => {
    const current = ratedMovies[movie.movie_id]
    const isAlreadyLiked = current?.feedback_type === 'like' || current?.is_liked

    if (isAlreadyLiked) {
      await persistMovieFeedback(movie, {
        rating: 3,
        feedback_type: 'rating',
        is_liked: false,
        is_disliked: false,
        successMessage: `${movie.title} reaction cleared.`,
      })
      return
    }

    await persistMovieFeedback(movie, {
      rating: 5,
      feedback_type: 'like',
      is_liked: true,
      is_disliked: false,
      successMessage: `${movie.title} marked as liked.`,
    })
  }

  const handleDislike = async (movie) => {
    const current = ratedMovies[movie.movie_id]
    const isAlreadyDisliked = current?.feedback_type === 'dislike' || current?.is_disliked

    if (isAlreadyDisliked) {
      await persistMovieFeedback(movie, {
        rating: 3,
        feedback_type: 'rating',
        is_liked: false,
        is_disliked: false,
        successMessage: `${movie.title} reaction cleared.`,
      })
      return
    }

    await persistMovieFeedback(movie, {
      rating: 1,
      feedback_type: 'dislike',
      is_liked: false,
      is_disliked: true,
      successMessage: `${movie.title} marked as disliked.`,
    })
  }

  const togglePreferredGenre = (genre) => {
    setPreferredGenres((current) => {
      const exists = current.includes(genre)
      const next = exists
        ? current.filter((item) => item !== genre)
        : [genre, ...current.filter((item) => item !== genre)].slice(0, 4)

      // Clicking an active genre unselects it. Selecting a new one pins it for feed tuning.
      if (exists && selectedGenre === genre) {
        setSelectedGenre(next[0] || ALL_GENRES)
      } else if (!exists) {
        setSelectedGenre(genre)
      }

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
    setSelectedGenre(ALL_GENRES)
    setSelectedMood(MOODS[0])
    setSelectedMediaType('all')
    setSearchQuery('')
    setSearchResetSignal((value) => value + 1)
    setSelectedDetail(null)
    setPersonalizedMovies([])
    setActiveTab('home')
    setRatingMessage('Personalization reset successfully.')

    await loadGenres()
    await Promise.allSettled([loadTrending(), loadLiveCatalog(), loadPersonalized({})])
  }

  const topRankedMovies = filteredLiveCatalog.slice(0, 10)

  const guestRails = useMemo(() => {
    const bucket = new Map()

    filteredLiveCatalog.forEach((movie) => {
      const label = movie.genres?.[0] || 'Featured'
      if (!bucket.has(label)) {
        bucket.set(label, [])
      }

      if (bucket.get(label).length < 10) {
        bucket.get(label).push(movie)
      }
    })

    return Array.from(bucket.entries())
      .slice(0, 3)
      .map(([label, items]) => ({
        label,
        items,
      }))
  }, [filteredLiveCatalog])

  const personalizedRailMovies = filteredPersonalizedMovies.slice(0, 12)
  const trendingPreviewMovies = filteredLiveCatalog.slice(0, 10)
  const normalizedSearchQuery = searchQuery.trim()
  const hasActiveSearch = normalizedSearchQuery.length > 0
  const displayName = session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')?.[0] || 'viewer'
  const visibleMovieError = movieError && !movieError.toLowerCase().includes('network error') ? movieError : ''
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
              loading={loadingMovies}
              resetSignal={searchResetSignal}
            />
          </div>

          <div className="stream-actions">
            {session ? (
              <>
                <span className="pill">{displayName}</span>
                <button type="button" className="pill ghost" onClick={handleLogout} disabled={authLoading}>
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

                    {detailError ? <p className="error-copy mt-2">{detailError}</p> : null}

                    {session ? (
                      <div className="detail-actions mt-4">
                        {(() => {
                          const currentFeedback = ratedMovies[selectedDetail.movie_id]
                          return (
                            <>
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => handleRate(selectedDetail, value)}
                            className={
                              currentFeedback?.feedback_type === 'rating' && currentFeedback?.rating === value
                                ? 'media-chip active'
                                : 'media-chip'
                            }
                          >
                            {value}
                          </button>
                        ))}
                        <button
                          type="button"
                          className={currentFeedback?.feedback_type === 'like' || currentFeedback?.is_liked ? 'media-chip active' : 'media-chip'}
                          onClick={() => handleLike(selectedDetail)}
                        >
                          Like
                        </button>
                        <button
                          type="button"
                          className={
                            currentFeedback?.feedback_type === 'dislike' || currentFeedback?.is_disliked
                              ? 'media-chip active'
                              : 'media-chip'
                          }
                          onClick={() => handleDislike(selectedDetail)}
                        >
                          Dislike
                        </button>
                            </>
                          )
                        })()}
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
                    .slice(0, 14)
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
        ) : (
          <>
        <section className="genre-row" id="browse">
          <button
            type="button"
            onClick={() => setSelectedMediaType('all')}
            className={selectedMediaType === 'all' ? 'media-chip active' : 'media-chip'}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setSelectedMediaType('movie')}
            className={selectedMediaType === 'movie' ? 'media-chip active' : 'media-chip'}
          >
            Movies
          </button>
          <button
            type="button"
            onClick={() => setSelectedMediaType('tv')}
            className={selectedMediaType === 'tv' ? 'media-chip active' : 'media-chip'}
          >
            Series
          </button>

          {sortedGenres.map((genre) => (
            <button
              key={genre}
              type="button"
              onClick={() => setSelectedGenre(genre)}
              className={selectedGenre === genre ? 'genre-chip active' : 'genre-chip'}
            >
              {genre}
            </button>
          ))}
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
                  <span>See more</span>
                </div>
                <div className="poster-scroller compact">
                  {rail.items.map((movie) => (
                    <PosterTile key={`${rail.label}-${movie.movie_id}`} movie={movie} tag="HD" onOpen={openTitleDetail} />
                  ))}
                </div>
              </section>
            ))}

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
                      <p className="mt-2 text-sm text-slate-200">Likes and dislikes shape the personalized rows.</p>
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

                  <h2 className="panel-heading mt-6">Because you rated similar titles</h2>
                  {loadingMovies ? (
                    <p className="empty-copy">Loading personalized recommendations...</p>
                  ) : (
                    <div className="poster-scroller compact">
                      {personalizedRailMovies.map((movie) => (
                        <PosterTile key={`personalized-${movie.movie_id}`} movie={movie} tag="For you" onOpen={openTitleDetail} />
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </section>
          </>
        )}
          </>
        )}

        {showAuthModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
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
      </main>
    </div>
  )
}