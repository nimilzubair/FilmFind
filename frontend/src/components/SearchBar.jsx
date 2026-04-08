import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { searchMovies } from '../lib/api'

export default function SearchBar({ onSearch, loading }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Debounced search for suggestions
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length > 0) {
        try {
          const results = await searchMovies(query, 5)
          setSuggestions(results)
          setShowSuggestions(true)
        } catch {
          setSuggestions([])
        }
      } else {
        setSuggestions([])
        setShowSuggestions(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  const handleSelect = (title) => {
    setQuery(title)
    setSuggestions([])
    setShowSuggestions(false)
    onSearch(title)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (query.trim()) {
      handleSelect(query)
    }
  }

  return (
    <div className="relative max-w-2xl mx-auto">
      <form onSubmit={handleSubmit}>
        <motion.div
          className="relative"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          {/* Animated border effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-xl blur opacity-75 group-hover:opacity-100 transition duration-300 -z-1 animate-pulse" />

          <div className="relative bg-slate-900/80 backdrop-blur-xl rounded-xl border border-white/10 overflow-hidden">
            {/* Animated scan line */}
            <motion.div
              className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
              animate={{ x: ['0%', '100%'] }}
              transition={{ duration: 2, repeat: Infinity }}
            />

            <div className="flex items-center px-6 py-4">
              <svg
                className="w-5 h-5 text-gray-500 mr-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>

              <input
                type="text"
                placeholder="Search movies..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none text-lg"
                disabled={loading}
              />

              {loading && (
                <motion.div
                  className="w-5 h-5 border-2 border-purple-500 border-t-cyan-400 rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, easing: 'linear' }}
                />
              )}
            </div>
          </div>
        </motion.div>
      </form>

      {/* Typeahead suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <motion.div
          className="absolute top-full left-0 right-0 mt-2 bg-slate-900/90 backdrop-blur-xl border border-white/20 rounded-xl overflow-hidden shadow-2xl z-50"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {suggestions.map((movie, idx) => (
            <motion.button
              key={movie.movie_id}
              type="button"
              onClick={() => handleSelect(movie.title)}
              className="w-full text-left px-6 py-3 hover:bg-purple-600/50 border-b border-white/10 last:border-b-0 transition-colors"
              whileHover={{ paddingLeft: 24 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: idx * 0.05 }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white font-medium">{movie.title}</p>
                  <p className="text-sm text-gray-400">{movie.genres.join(', ')}</p>
                </div>
              </div>
            </motion.button>
          ))}
        </motion.div>
      )}
    </div>
  )
}
