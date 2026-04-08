import { motion } from 'framer-motion'

const starValues = [1, 2, 3, 4, 5]

function ThumbUpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 10V5.5c0-1.2-.8-2.3-1.9-2.7L11 2l-4 8v10h10.2c1.1 0 2.1-.8 2.3-1.9l1.2-6.4A2 2 0 0 0 18.8 10H14z" />
      <path d="M7 10H4.5A1.5 1.5 0 0 0 3 11.5v7A1.5 1.5 0 0 0 4.5 20H7" />
    </svg>
  )
}

function ThumbDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 14v4.5c0 1.2.8 2.3 1.9 2.7L13 22l4-8V4H6.8c-1.1 0-2.1.8-2.3 1.9L3.3 12.3A2 2 0 0 0 5.2 14H10z" />
      <path d="M17 14h2.5a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 19.5 4H17" />
    </svg>
  )
}

export default function MovieCard({ movie, onRate, ratedValue = null, delay = 0, allowRate = true }) {
  const ratingLabel = ratedValue ? `${ratedValue}/5` : 'Rate to personalize'

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="group rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-2xl backdrop-blur-xl"
    >
      {movie.poster_url ? (
        <div className="mb-4 overflow-hidden rounded-2xl border border-white/10">
          <img
            src={movie.poster_url}
            alt={movie.title}
            className="h-48 w-full object-cover"
            loading="lazy"
          />
        </div>
      ) : null}

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
              className="flex flex-1 items-center justify-center rounded-2xl bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-200 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25"
              title="Like"
              aria-label="Like"
            >
              <ThumbUpIcon />
            </button>
            <button
              type="button"
              onClick={() => onRate(movie, 1)}
              className="flex flex-1 items-center justify-center rounded-2xl bg-rose-500/15 px-3 py-2 text-sm font-medium text-rose-200 ring-1 ring-rose-500/30 transition hover:bg-rose-500/25"
              title="Dislike"
              aria-label="Dislike"
            >
              <ThumbDownIcon />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
