import { motion } from 'framer-motion'

const starValues = [1, 2, 3, 4, 5]

export default function MovieCard({ movie, onRate, ratedValue = null, delay = 0, allowRate = true }) {
  const ratingLabel = ratedValue ? `${ratedValue}/5` : 'Rate to personalize'

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="group rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">{movie.signal_source}</p>
          <h3 className="mt-2 text-lg font-semibold text-white leading-snug">{movie.title}</h3>
        </div>
        <div className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">
          {movie.score ? `${Math.round(movie.score * 100)}%` : ratingLabel}
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-300">{movie.why_this}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {movie.genres.slice(0, 3).map((genre) => (
          <span key={genre} className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">
            {genre}
          </span>
        ))}
      </div>

      {allowRate && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-2">
            {starValues.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onRate(movie, value)}
                className={`h-9 w-9 rounded-full border text-sm font-semibold transition ${
                  ratedValue === value
                    ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                    : 'border-white/10 bg-white/5 text-white hover:border-cyan-400 hover:bg-cyan-400/10'
                }`}
                title={`${value} star${value === 1 ? '' : 's'}`}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onRate(movie, 5)}
              className="flex-1 rounded-2xl bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-200 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25"
            >
              Like
            </button>
            <button
              type="button"
              onClick={() => onRate(movie, 1)}
              className="flex-1 rounded-2xl bg-rose-500/15 px-3 py-2 text-sm font-medium text-rose-200 ring-1 ring-rose-500/30 transition hover:bg-rose-500/25"
            >
              Dislike
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
