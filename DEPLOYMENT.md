# Deployment Guide

## Quick Local Setup

### Windows Users
```bash
# From project root:
start.bat
```

This will automatically:
1. Install Python dependencies
2. Install Node dependencies
3. Start FastAPI backend on http://localhost:8000
4. Start React frontend on http://localhost:5173

### macOS/Linux Users
```bash
chmod +x start.sh
./start.sh
```

Or manually:

### Manual Backend Start
```bash
# Terminal 1 - Backend
uvicorn backend.app.main:app --reload
# API at http://localhost:8000
```

### Manual Frontend Start
```bash
# Terminal 2 - Frontend
cd frontend
npm run dev
# UI at http://localhost:5173
```

---

## Production Deployment (Unified Vercel)

This repo is configured for a single Vercel deployment:
- Frontend static build from `frontend/`
- Backend serverless API from `backend/api/index.py`
- Routing: `/api/*` -> FastAPI app

### Deploy Steps

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Prepare unified Vercel deployment"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Create Vercel Project**
   - Go to https://vercel.com
   - Click "Add New" -> "Project"
   - Import your GitHub repo
   - Keep project root as repository root
   - Vercel will use `vercel.json`

3. **Set Environment Variables in Vercel**
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `TMDB_READ_ACCESS_TOKEN` (preferred) or `TMDB_API_KEY`
   - Optional: `ALLOWED_ORIGINS`
   - Optional: `ALLOWED_ORIGIN_REGEX` (default supports `*.vercel.app`)

4. **Deploy**
   - Click "Deploy"
   - Frontend and backend are deployed together under one domain

### API Endpoints on Vercel

- `/api/health`
- `/api/search?q=toy`
- `/api/catalog/latest?media_type=all&limit=24`
- `/api/recommend` (POST)

---

## Environment Configuration

### Backend (Python)
Set TMDB credentials for local and Vercel environments:
- Python version: 3.12
- `TMDB_READ_ACCESS_TOKEN` (preferred)
- `TMDB_API_KEY` (optional fallback)

### Frontend (React)
Create `frontend/.env` with:
```
# Optional for external API usage. Not required for unified Vercel deployment.
# VITE_API_URL=https://your-backend.example.com
VITE_SUPABASE_URL=YOUR_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Or copy from template:
```bash
cd frontend
cp .env.example .env
```

### Deployment Checklist

Before deploying, make sure:
- Vercel has TMDB and Supabase environment variables configured.
- Supabase redirect URLs include your Vercel domain.
- If `VITE_API_URL` is set, it points to a valid backend.

---

## Troubleshooting

### "npm: command not found"
Install Node.js from https://nodejs.org

### "Backend API not found" in frontend
1. Check backend is running on correct port
2. Verify `VITE_API_URL` is set correctly
3. Check CORS is enabled (it is by default)

### Slow initial load
- TMDB responses are cached briefly in memory for faster repeated requests

### "Port 8000 already in use"
```bash
# Kill process on port 8000
# Windows:
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# macOS/Linux:
lsof -ti:8000 | xargs kill -9
```

---

## Testing the System

### 1. Health Check
```bash
curl http://localhost:8000/health
# Should return: {"status":"ok"}
```

### 2. Search
```bash
curl "http://localhost:8000/search?q=toy"
# Returns list of matching movies
```

### 3. Get Recommendations
```bash
curl -X POST http://localhost:8000/recommend \
  -H "Content-Type: application/json" \
  -d '{"title": "Toy Story", "top_n": 10}'
# Returns recommendations with signal breakdown
```

---

## Performance Notes

- **Backend response time**: <50ms (cached embeddings + SVD)
- **Frontend initial load**: ~3-5s (Vite dev server), <1s production build
- **Search typeahead**: Debounced to 300ms
- **Recommendation cards**: Animated with GPU acceleration

---

## Project Structure Reference

```
Recommendation_System/
├── backend/app/
│   ├── main.py              ← FastAPI app
│   ├── external_catalog.py  ← TMDB client logic
│   ├── schemas.py           ← Request/response models
│   ├── settings.py          ← Config (paths, CORS)
│   └── __init__.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── SearchBar.jsx        ← Input with typeahead
│   │   │   ├── RecommendationCard.jsx ← Movie cards
│   │   │   └── TasteRadar.jsx       ← Radar chart
│   │   ├── lib/api.js               ← axios client
│   │   ├── App.jsx                  ← Main app
│   │   ├── main.jsx                 ← React entry
│   │   └── index.css                ← Tailwind global
│   ├── index.html           ← HTML entry
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── requirements.txt
├── render.yaml              ← Render config
├── start.bat                ← Windows startup
├── start.sh                 ← macOS/Linux startup
└── README.md
```

---

## Support

For issues or questions:
1. Check the README.md in `frontend/` for React-specific details
2. Check backend logs (terminal running uvicorn)
3. Check frontend logs (Vite dev server terminal)
