import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { searchMovies } from '../lib/api'

export default function SearchBar({ onSearch, loading, resetSignal = 0 }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef(null)
  const lastEmittedQueryRef = useRef('')

  // Debounced search for suggestions - real-time search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length > 0) {
        try {
          const results = await searchMovies(query, 8)
          setSuggestions(results)
          setShowSuggestions(true)
          setSelectedIndex(-1) // Reset selection when new results arrive
        } catch {
          setSuggestions([])
        }
      } else {
        setSuggestions([])
        setShowSuggestions(false)
        setSelectedIndex(-1)
      }
    }, 200) // Reduced debounce time for more responsive real-time experience

    return () => clearTimeout(timer)
  }, [query])

  // Keep main feed query in sync while typing (debounced), no Enter required.
  useEffect(() => {
    const timer = setTimeout(() => {
      const normalized = query.trim()
      if (normalized === lastEmittedQueryRef.current) {
        return
      }
      lastEmittedQueryRef.current = normalized
      onSearch(normalized)
    }, 240)

    return () => clearTimeout(timer)
  }, [query, onSearch])

  useEffect(() => {
    setQuery('')
    setSuggestions([])
    setShowSuggestions(false)
    setSelectedIndex(-1)
    lastEmittedQueryRef.current = ''
  }, [resetSignal])

  const handleSelect = (title) => {
    setQuery(title)
    setSuggestions([])
    setShowSuggestions(false)
    setSelectedIndex(-1)
    lastEmittedQueryRef.current = title.trim()
    onSearch(title)
  }

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter' && query.trim()) {
        e.preventDefault()
        handleSelect(query)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev))
        break

      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1))
        break

      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelect(suggestions[selectedIndex].title)
        } else if (query.trim()) {
          handleSelect(query)
        }
        break

      case 'Escape':
        e.preventDefault()
        setShowSuggestions(false)
        setSelectedIndex(-1)
        break

      default:
        break
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (query.trim()) {
      handleSelect(query)
    }
  }

  return (
    <div className="relative w-full max-w-none">
      <form onSubmit={handleSubmit}>
        <motion.div
          className="relative"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          {/* Animated border effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-lg blur opacity-75 group-hover:opacity-100 transition duration-300 -z-1 animate-pulse" />

          <div className="relative bg-slate-900/80 backdrop-blur-xl rounded-lg border border-white/10 overflow-hidden">
            {/* Animated scan line */}
            <motion.div
              className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
              animate={{ x: ['0%', '100%'] }}
              transition={{ duration: 2, repeat: Infinity }}
            />

            <div className="flex items-center px-5 py-2">
              <svg
                className="w-4 h-4 text-gray-500 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>

              <input
                ref={inputRef}
                type="text"
                placeholder="Search movies..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none text-sm"
                autoComplete="off"
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
          className="absolute top-full left-0 right-0 mt-2 bg-slate-900/90 backdrop-blur-xl border border-white/20 rounded-lg overflow-hidden shadow-2xl z-[9999]"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {suggestions.map((movie, idx) => (
            <motion.button
              key={movie.movie_id}
              type="button"
              onClick={() => handleSelect(movie.title)}
              className={`w-full text-left px-4 py-2 border-b border-white/10 last:border-b-0 transition-colors ${
                idx === selectedIndex
                  ? 'bg-purple-600/70 text-white'
                  : 'hover:bg-purple-600/50 text-white'
              }`}
              whileHover={{ paddingLeft: 24 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: idx * 0.05 }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{movie.title}</p>
                  <p className="text-sm text-gray-300">{movie.genres.join(', ')}</p>
                </div>
              </div>
            </motion.button>
          ))}
        </motion.div>
      )}
    </div>
  )
}
