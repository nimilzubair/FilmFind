import { motion } from 'framer-motion'

function LoginFace({ email, setEmail, password, setPassword, loading, onSubmit, setMode }) {
  return (
    <form
      onSubmit={(event) => {
        setMode('login')
        onSubmit('login', event)
      }}
      className="flip-face"
    >
      <p className="panel-kicker">FilmFind Login</p>
      <h3 className="panel-title">Welcome back</h3>

      <label className="field-label">Email</label>
      <input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="auth-input"
        placeholder="you@example.com"
        required
      />

      <label className="field-label">Password</label>
      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="auth-input"
        placeholder="********"
        minLength={6}
        required
      />

      <button type="submit" disabled={loading} className="auth-submit auth-submit-login">
        {loading ? 'Please wait...' : 'Login'}
      </button>

      <button
        type="button"
        onClick={() => setMode('signup')}
        className="auth-switch"
      >
        Don&apos;t have an account? Sign up
      </button>
    </form>
  )
}

function SignupFace({ fullName, setFullName, email, setEmail, password, setPassword, loading, onSubmit, setMode }) {
  return (
    <form
      onSubmit={(event) => {
        setMode('signup')
        onSubmit('signup', event)
      }}
      className="flip-face flip-face-back"
    >
      <p className="panel-kicker">FilmFind Create Account</p>
      <h3 className="panel-title">Join FilmFind</h3>

      <label className="field-label">Username</label>
      <input
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
        className="auth-input"
        placeholder="CinemaLover"
      />

      <label className="field-label">Email</label>
      <input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="auth-input"
        placeholder="new@example.com"
        required
      />

      <label className="field-label">Password</label>
      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="auth-input"
        placeholder="********"
        minLength={6}
        required
      />

      <button type="submit" disabled={loading} className="auth-submit auth-submit-signup">
        {loading ? 'Please wait...' : 'Sign up'}
      </button>

      <button
        type="button"
        onClick={() => setMode('login')}
        className="auth-switch"
      >
        Already have an account? Login
      </button>
    </form>
  )
}

export default function AuthPanel({
  mode,
  setMode,
  fullName,
  setFullName,
  email,
  setEmail,
  password,
  setPassword,
  loading,
  onSubmit,
  message,
}) {
  return (
    <motion.div
      className="auth-wrap"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flip-shell">
        <div className="flip-card" style={{ transform: mode === 'signup' ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
          <LoginFace
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            loading={loading}
            onSubmit={onSubmit}
            setMode={setMode}
          />

          <SignupFace
            fullName={fullName}
            setFullName={setFullName}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            loading={loading}
            onSubmit={onSubmit}
            setMode={setMode}
          />
        </div>
      </div>

      {message && <p className="auth-message">{message}</p>}
    </motion.div>
  )
}
