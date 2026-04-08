import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import AuthPanel from './components/AuthPanel'
import MovieCard from './components/MovieCard'
import { getCatalogGenres, getGenres, getLatestCatalog, getPersonalizedMovies, getTrendingMovies } from './lib/api'
import { supabase } from './lib/supabase'

const ALL_GENRES = 'All'

function isSupabaseLockRaceError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return message.includes('auth-token') && message.includes('stole it')
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

function PosterTile({ movie, rank = null, tag = null }) {
  const tileClass = rank ? 'poster-tile ranked-tile' : 'poster-tile'
  const artClass = rank ? 'poster-art ranked-art' : 'poster-art'

  return (
    <article className={tileClass} style={toneFromMovie(movie)}>
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

export default function App() {
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
  const [trendingMovies, setTrendingMovies] = useState([])
  const [liveCatalog, setLiveCatalog] = useState([])
  const [personalizedMovies, setPersonalizedMovies] = useState([])
  const [loadingMovies, setLoadingMovies] = useState(true)
  const [movieError, setMovieError] = useState('')
  const [ratingMessage, setRatingMessage] = useState('')
  const [ratedMovies, setRatedMovies] = useState({})
  const [searchDraft, setSearchDraft] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMediaType, setSelectedMediaType] = useState('all')

  const selectedGenreValue = selectedGenre === ALL_GENRES ? null : selectedGenre

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

  const ratedEntries = useMemo(
    () =>
      Object.values(ratedMovies)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 8),
    [ratedMovies],
  )

  const loadGenres = async () => {
    try {
      let genreList = await getCatalogGenres()
      if (!genreList.length) {
        genreList = await getGenres()
      }
      setGenres([ALL_GENRES, ...genreList])
    } catch (error) {
      setMovieError(error?.message || 'Failed to load genres')
    }
  }

  const loadLiveCatalog = async () => {
    setLoadingMovies(true)
    setMovieError('')

    try {
      const items = await getLatestCatalog({
        media_type: selectedMediaType,
        genre: selectedGenreValue,
        query: searchQuery || null,
        limit: 24,
      })
      setLiveCatalog(items)
    } catch (error) {
      setMovieError(error?.message || 'Failed to load live catalog')
      setLiveCatalog([])
    } finally {
      setLoadingMovies(false)
    }
  }

  const loadTrending = async () => {
    setLoadingMovies(true)
    setMovieError('')
    try {
      const data = await getTrendingMovies(selectedGenreValue, 12)
      setTrendingMovies(data)
    } catch (error) {
      setMovieError(error?.message || 'Failed to load trending movies')
    } finally {
      setLoadingMovies(false)
    }
  }

  const loadPersonalized = async (ratingsSnapshot = ratedMovies) => {
    if (!session) {
      setPersonalizedMovies([])
      return
    }

    setLoadingMovies(true)
    setMovieError('')

    try {
      const liked_movies = Object.values(ratingsSnapshot)
        .filter((item) => item.is_liked || item.feedback_type === 'like' || item.rating >= 4)
        .map((item) => item.title)

      const disliked_movies = Object.values(ratingsSnapshot)
        .filter((item) => item.is_disliked || item.feedback_type === 'dislike' || item.rating <= 2)
        .map((item) => item.title)

      const data = await getPersonalizedMovies({
        genre: selectedGenreValue,
        liked_movies,
        disliked_movies,
        top_n: 18,
      })

      setPersonalizedMovies(data)
    } catch (error) {
      setMovieError(error?.message || 'Failed to build your personalized feed')
    } finally {
      setLoadingMovies(false)
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
      await loadLiveCatalog()
      await loadTrending()
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
        await loadPersonalized(nextRatings)
        return
      }

      if (event === 'SIGNED_OUT') {
        setShowAuthModal(false)
        setRatedMovies({})
        setPersonalizedMovies([])
        setSearchDraft('')
        setSearchQuery('')
        setSelectedGenre(ALL_GENRES)
        setSelectedMediaType('all')
        setAuthMessage('Logged out.')
        await loadLiveCatalog()
        await loadTrending()
        return
      }

      if (nextSession) {
        const nextRatings = await loadRatings(nextSession)
        await loadTrending()
        await loadPersonalized(nextRatings)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) {
      loadLiveCatalog()
      loadTrending()
      loadPersonalized()
    } else {
      loadLiveCatalog()
      loadTrending()
    }
  }, [session, selectedGenre, selectedMediaType, searchQuery])

  const handleSearchSubmit = (event) => {
    event.preventDefault()
    setSearchQuery(searchDraft)
  }

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
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
            emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
          },
        })

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
    setRatedMovies({})
    setTrendingMovies([])
    setPersonalizedMovies([])
    setSearchDraft('')
    setSearchQuery('')
    setSelectedGenre(ALL_GENRES)
    setSelectedMediaType('all')
    setAuthMessage('Logged out.')
    setRatingMessage('')
    setMovieError('')

    try {
      await supabase.auth.signOut({ scope: 'global' })
    } catch (error) {
      if (!isSupabaseLockRaceError(error)) {
        setMovieError(error.message || 'Failed to sign out.')
      }
    }

    await loadTrending()
    setAuthLoading(false)
  }

  const handleRate = async (movie, rating) => {
    if (!session || !supabase) {
      setAuthMessage('Please log in to save ratings and personalize FilmFind.')
      return
    }

    const payload = {
      user_id: session.user.id,
      movie_id: movie.movie_id,
      movie_title: movie.title,
      genres: movie.genres,
      rating,
      feedback_type: rating >= 4 ? 'like' : rating <= 2 ? 'dislike' : 'rating',
      is_liked: rating >= 4,
      is_disliked: rating <= 2,
      selected_genre: selectedGenreValue,
      source: 'manual',
      interaction_context: {
        selected_genre: selectedGenreValue,
        source: 'manual',
        feedback_type: rating >= 4 ? 'like' : rating <= 2 ? 'dislike' : 'rating',
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
        feedback_type: payload.feedback_type,
        is_liked: payload.is_liked,
        is_disliked: payload.is_disliked,
        selected_genre: selectedGenreValue,
        source: payload.source,
        interaction_context: payload.interaction_context,
        watched_at: new Date().toISOString(),
      },
    }

    setRatedMovies(nextRatings)
    setRatingMessage(`${movie.title} updated with ${rating}/5.`)
    await loadPersonalized(nextRatings)
  }

  const openLogin = () => {
    setAuthMode('login')
    setShowAuthModal(true)
  }

  const openSignup = () => {
    setAuthMode('signup')
    setShowAuthModal(true)
  }

  const featuredMovie = filteredLiveCatalog[0] || filteredTrendingMovies[0] || null
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

  const personalizedGridMovies = filteredPersonalizedMovies.slice(0, 12)
  const personalizedRailMovies = filteredPersonalizedMovies.slice(0, 12)
  const trendingPreviewMovies = filteredLiveCatalog.slice(0, 10)

  return (
    <div className="stream-bg min-h-screen text-white">
      <div className="stream-grain" />
      <main className="stream-shell">
        <header className="stream-topbar">
          <div className="brand-wrap">
            <img src="/logo.png" alt="FilmFind logo" className="brand-logo" />
            <nav className="stream-nav">
              <a href="#">Home</a>
              <a href="#">Movies</a>
              <a href="#">TV Shows</a>
            </nav>
          </div>

          <form className="stream-search" onSubmit={handleSearchSubmit}>
            <span aria-hidden="true">⌕</span>
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search movies, genres, mood..."
            />
            <button type="submit">Search</button>
          </form>

          <div className="stream-actions">
            {session ? (
              <>
                <span className="pill">Signed in</span>
                <button type="button" className="pill ghost" onClick={handleLogout}>
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

        <section className="hero-panel" style={featuredMovie ? toneFromMovie(featuredMovie) : undefined}>
          <div className="hero-copy">
            <p className="hero-kicker">Now streaming on FilmFind</p>
            <h1>{featuredMovie?.title || 'Find your next favorite tonight'}</h1>
            <p>
              {session
                ? 'Your homepage now blends trending rows with personalized picks tuned by your likes and dislikes.'
                : 'Browse ranked trending rows like a streaming home page, then sign in whenever you want personal recommendations.'}
            </p>
            <div className="hero-actions">
              <button type="button" onClick={session ? () => {} : openSignup}>
                {session ? 'Keep browsing' : 'Start watching'}
              </button>
              {!session ? (
                <button type="button" className="ghost" onClick={openLogin}>
                  I already have an account
                </button>
              ) : null}
            </div>
          </div>
          <motion.div
            className="hero-poster"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <PosterTile movie={featuredMovie || { movie_id: 0, title: 'Featured tonight' }} tag="Trending" />
          </motion.div>
        </section>

        <section className="genre-row">
          <button
            type="button"
            onClick={() => setSelectedMediaType('all')}
            className={selectedMediaType === 'all' ? 'genre-chip active' : 'genre-chip'}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setSelectedMediaType('movie')}
            className={selectedMediaType === 'movie' ? 'genre-chip active' : 'genre-chip'}
          >
            Movies
          </button>
          <button
            type="button"
            onClick={() => setSelectedMediaType('tv')}
            className={selectedMediaType === 'tv' ? 'genre-chip active' : 'genre-chip'}
          >
            Series
          </button>

          {genres.map((genre) => (
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

        {movieError && <p className="error-copy">{movieError}</p>}
        {ratingMessage && <p className="success-copy">{ratingMessage}</p>}

        {!session ? (
          <>
            <section className="row-block">
              <div className="row-head">
                <h2>Trending now</h2>
                <span>Top 10 this week</span>
              </div>
              {loadingMovies ? (
                <p className="empty-copy">Loading trending titles...</p>
              ) : (
                <div className="poster-scroller ranked">
                  {topRankedMovies.map((movie, index) => (
                    <PosterTile key={movie.movie_id} movie={movie} rank={index + 1} tag={movie.genres?.[0] || 'Movie'} />
                  ))}
                </div>
              )}
            </section>

            {guestRails.map((rail) => (
              <section className="row-block" key={rail.label}>
                <div className="row-head">
                  <h2>{rail.label}</h2>
                  <span>See more</span>
                </div>
                <div className="poster-scroller compact">
                  {rail.items.map((movie) => (
                    <PosterTile key={`${rail.label}-${movie.movie_id}`} movie={movie} tag="HD" />
                  ))}
                </div>
              </section>
            ))}

            <section className="reasons-grid">
              <article>
                <h3>Enjoy on every screen</h3>
                <p>TV, laptop, tablet, and phone with the same watchlist.</p>
              </article>
              <article>
                <h3>Download and go</h3>
                <p>Keep favorites offline for flights, commutes, and weekends away.</p>
              </article>
              <article>
                <h3>Smart recommendations</h3>
                <p>Your likes and dislikes train a feed that gets sharper over time.</p>
              </article>
              <article>
                <h3>Family friendly profiles</h3>
                <p>Create kid-safe spaces with curated rows and age-aware suggestions.</p>
              </article>
            </section>
          </>
        ) : (
          <>
            <section className="dashboard-shell mt-5">
              <div className="dashboard-grid">
                <aside className="rating-column">
                  <h2 className="panel-heading">Your ratings & likes</h2>

                  {ratedEntries.length === 0 && (
                    <p className="empty-copy">Rate movies from the feed to train FilmFind.</p>
                  )}

                  <div className="rating-list">
                    {ratedEntries.map((entry) => (
                      <div key={entry.movie_id} className="rating-row">
                        <div className="thumb-fake" />
                        <div className="rating-meta">
                          <p className="movie-name">{entry.title}</p>
                          <p className="movie-sub">{entry.genres?.[0] || 'Genre'}</p>
                          <p className="movie-sub">
                            {entry.feedback_type === 'like'
                              ? 'Liked'
                              : entry.feedback_type === 'dislike'
                                ? 'Disliked'
                                : 'Rated'}
                          </p>
                          <StarMeter value={entry.rating} />
                        </div>
                        <div className="row-actions">
                          <button type="button" className="mini-like" onClick={() => handleRate(entry, 5)}>
                            Like
                          </button>
                          <button type="button" className="mini-dislike" onClick={() => handleRate(entry, 1)}>
                            Dislike
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </aside>

                <section className="feed-column">
                  <h2 className="panel-heading">Trending now</h2>
                  {loadingMovies ? (
                    <p className="empty-copy">Loading recommendations...</p>
                  ) : (
                    <div className="poster-scroller compact">
                      {trendingPreviewMovies.map((movie) => (
                        <PosterTile
                          key={movie.movie_id}
                          movie={movie}
                          tag={movie.media_type === 'tv' ? 'Series' : 'Movie'}
                        />
                      ))}
                    </div>
                  )}

                  <h2 className="panel-heading mt-6">Because you watched</h2>
                  {loadingMovies ? (
                    <p className="empty-copy">Loading personalized recommendations...</p>
                  ) : (
                    <div className="poster-scroller compact">
                      {personalizedRailMovies.map((movie) => (
                        <PosterTile key={`personalized-${movie.movie_id}`} movie={movie} tag="For you" />
                      ))}
                    </div>
                  )}

                  <h2 className="panel-heading mt-6">Rate to improve your feed</h2>
                  {loadingMovies ? (
                    <p className="empty-copy">Loading personalized recommendations...</p>
                  ) : (
                    <div className="feed-grid">
                      {personalizedGridMovies.map((movie, index) => (
                        <MovieCard
                          key={movie.movie_id}
                          movie={movie}
                          onRate={handleRate}
                          ratedValue={ratedMovies[movie.movie_id]?.rating ?? null}
                          delay={index * 0.03}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <div className="tune-panel mt-5">
                <h3>Fine-tune your recommendations</h3>
                <div className="tune-controls">
                  <label>
                    Mood
                    <select>
                      <option>Action-packed</option>
                      <option>Emotional</option>
                      <option>Thought-provoking</option>
                    </select>
                  </label>

                  <label>
                    Genre preference
                    <select value={selectedGenre} onChange={(event) => setSelectedGenre(event.target.value)}>
                      {genres.map((genre) => (
                        <option key={genre} value={genre}>
                          {genre}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Include actors/directors
                    <input placeholder="Enter names to prioritize..." />
                  </label>
                </div>
              </div>
            </section>
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
