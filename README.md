# FilmFind

A full-stack movie discovery app with Supabase Auth, email verification, trending movies, genre filters, and rating-based personalization.

The homepage can use a live TMDB feed (latest movies + TV series, genres, cast, overview, posters) when TMDB credentials are set.

## Architecture Overview

```
🎬 Data Layer
└─ TMDB live API (movies, series, genres, cast, artwork)

🧠 Personalization Layer
└─ User like/dislike signals + TMDB search/trending blending

🚀 API
└─ FastAPI with /health, /search, /genres, /trending, /personalize, /recommend, /catalog/latest, /catalog/genres endpoints

🎨 Frontend
└─ React + Vite + TailwindCSS + Framer Motion
```

## Features

### Backend (FastAPI)
- **TMDB-only catalog** for movies and TV series
- **Typeahead search** backed by TMDB endpoints
- **Trending feed** and **genre personalization** for FilmFind browsing
- **No bundled local CSV movie dataset**

### Supabase
- Run [schema.sql](schema.sql) in the Supabase SQL editor
- Enable email confirmation in Supabase Auth settings
- Use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend

### Frontend (React + Vite)
- **Authenticated signup/login** with Supabase email verification
- **Home trending page** with genre filters
- **Personalize my FilmFind** mode powered by selected genres and ratings
- **Movie cards** with quick like/dislike and 1-5 rating buttons
- **Taste profile radar chart** showing genre affinities from liked movies
- **Responsive glassmorphism UI** with backdrop blur
- **Framer Motion** for smooth, performance-optimized animations

## Quick Start

### Backend

1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Start FastAPI server (from project root):
   ```bash
   uvicorn backend.app.main:app --reload
   ```

   Optional real-time catalog feed:
   ```bash
   # Windows (cmd)
   set TMDB_API_KEY=your_tmdb_api_key
   set TMDB_READ_ACCESS_TOKEN=your_tmdb_read_access_token

   # macOS/Linux
   export TMDB_API_KEY=your_tmdb_api_key
   export TMDB_READ_ACCESS_TOKEN=your_tmdb_read_access_token
   ```
   You can set either one. If both are set, TMDB read access token is preferred.
   
   API at `http://localhost:8000`
   - `GET /health` - Health check
   - `GET /search?q=toy` - Search suggestions
   - `GET /catalog/latest?media_type=all&limit=24` - Live latest movies/series feed
   - `GET /catalog/genres` - Live genre list
   - `POST /recommend` - Get recommendations

### Frontend

1. Install Node dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Create `.env` (copy from `.env.example`):
   ```bash
   cp .env.example .env
   # Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
   ```

3. Start dev server:
   ```bash
   npm run dev
   ```
   
   UI at `http://localhost:5173`

## Deployment

### Backend → Render
- Already configured in `render.yaml`
- Auto-deploys from git
- Environment: Python 3.12
- Startup: `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`

### Frontend → Vercel
1. Build locally:
   ```bash
   cd frontend
   npm run build
   ```
   Output in `frontend/dist/`

2. Deploy `frontend/dist` to Vercel
   - Set `VITE_API_URL` to your Render backend URL

## Project Structure

```
Recommendation_System/
├─ backend/app/
│  ├─ main.py              # FastAPI server
│  ├─ external_catalog.py  # TMDB integration client
│  ├─ schemas.py           # Pydantic models
│  ├─ settings.py          # Config
│  └─ __init__.py
├─ frontend/
│  ├─ src/
│  │  ├─ components/       # React components
│  │  │  ├─ SearchBar.jsx
│  │  │  ├─ RecommendationCard.jsx
│  │  │  └─ TasteRadar.jsx
│  │  ├─ lib/
│  │  │  └─ api.js         # axios API calls
│  │  ├─ App.jsx           # Main app
│  │  ├─ main.jsx          # React entry
│  │  └─ index.css         # Tailwind
│  ├─ vite.config.js
│  ├─ tailwind.config.js
│  ├─ package.json
│  └─ index.html
├─ requirements.txt
├─ render.yaml
└─ README.md
```
