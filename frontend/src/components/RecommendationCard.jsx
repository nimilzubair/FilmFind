import { useState } from 'react'
import { motion } from 'framer-motion'

export default function RecommendationCard({ movie, delay }) {
  const [rotation, setRotation] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = (e) => {
    const card = e.currentTarget
    const rect = card.getBoundingClientRect()
    const x = (e.clientY - rect.top - rect.height / 2) / 10
    const y = (e.clientX - rect.left - rect.width / 2) / 10
    setRotation({ x, y })
  }

  const handleMouseLeave = () => {
    setRotation({ x: 0, y: 0 })
    setIsHovered(false)
  }

  // Determine signal color
  const signalColors = {
    collaborative: 'from-blue-500 to-cyan-500',
    semantic: 'from-purple-500 to-pink-500',
    popularity: 'from-orange-500 to-red-500',
  }

  const signalColor = signalColors[movie.signal_source] || signalColors.collaborative

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={() => setIsHovered(true)}
      style={{
        rotateX: rotation.x,
        rotateY: rotation.y,
        transformStyle: 'preserve-3d',
      }}
      className="h-full"
    >
      <motion.div
        className="relative h-full bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl border border-white/20 rounded-xl overflow-hidden group cursor-pointer"
        whileHover={{ scale: 1.05, borderColor: 'rgba(168, 85, 247, 0.5)' }}
        transition={{ type: 'spring', stiffness: 300, damping: 10 }}
      >
        {/* Holographic background gradient */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className={`absolute inset-0 bg-gradient-to-br ${signalColor} opacity-10`} />
        </div>

        {/* Content */}
        <div className="relative p-5 h-full flex flex-col justify-between">
          {/* Title and Score */}
          <div>
            <h3 className="text-lg font-bold text-white leading-tight mb-2 line-clamp-2">
              {movie.title}
            </h3>

            <div className="flex items-center gap-2 mb-3">
              <div className="text-sm font-semibold text-cyan-400">
                Score: {(movie.score * 100).toFixed(0)}%
              </div>
            </div>

            {/* Genres */}
            <div className="flex flex-wrap gap-1 mb-4">
              {movie.genres.slice(0, 3).map((genre, idx) => (
                <span
                  key={idx}
                  className="text-xs px-2 py-1 bg-white/10 text-gray-300 rounded-full"
                >
                  {genre}
                </span>
              ))}
            </div>
          </div>

          {/* Signal Breakdown */}
          <motion.div
            className="space-y-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered ? 1 : 0.7 }}
            transition={{ duration: 0.2 }}
          >
            <div className="text-xs text-gray-400 font-semibold mb-2">Signal Breakdown:</div>
            {Object.entries(movie.signal_breakdown).map(([signal, value]) => (
              <div key={signal} className="flex items-center justify-between">
                <span className="text-xs text-gray-300 capitalize">{signal}</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1 bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-purple-500 to-cyan-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${value * 100}%` }}
                      transition={{ duration: 0.6, delay: 0.1 }}
                    />
                  </div>
                  <span className="text-xs font-mono text-cyan-300 w-8 text-right">
                    {(value).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </motion.div>

          {/* Why This Badge */}
          <motion.div
            className={`mt-4 p-3 bg-gradient-to-r ${signalColor} rounded-lg text-xs text-white`}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: isHovered ? 1 : 0.8, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span className="font-semibold block mb-1">Why this?</span>
            <span className="text-xs opacity-95">{movie.why_this}</span>
          </motion.div>

          {/* Source Tag */}
          <motion.div
            className="mt-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered ? 1 : 0.6 }}
          >
            <span
              className={`inline-block px-3 py-1 text-xs font-bold text-white rounded-full bg-gradient-to-r ${signalColor} capitalize`}
            >
              {movie.signal_source}
            </span>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  )
}
