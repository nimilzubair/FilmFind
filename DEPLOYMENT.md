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

## Production Deployment

### Backend → Render.com

The project is pre-configured for Render via `render.yaml`.

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Create Service on Render**
   - Go to https://render.com
   - Click "New" → "Web Service"
   - Connect your GitHub repo
   - Select branch (main)
   - Render will auto-detect `render.yaml`
   - Click "Create Web Service"
   - Service will deploy automatically
   - Note your Render URL (e.g., `https://movielens-hybrid-api.onrender.com`)

3. **Backend endpoints** available at:
   - `/health` - Health check
   - `/search?q=toy` - Search suggestions
   - `/recommend` - POST with movie title

### Frontend → Vercel

1. **Build Frontend**
   ```bash
   cd frontend
   npm run build
   # Creates frontend/dist/
   ```

2. **Option A: Vercel CLI**
   ```bash
   npm i -g vercel
   cd frontend
   vercel --prod
   # Follow prompts
   ```

3. **Option B: Vercel Dashboard**
   - Go to https://vercel.com
   - Click "Add New" → "Project"
   - Import your GitHub repo
   - Set root directory: `frontend`
   - Add environment variable:
     - Key: `VITE_API_URL`
     - Value: `https://movielens-hybrid-api.onrender.com` (your Render URL)
   - Click "Deploy"

4. **Frontend** will be at your Vercel URL (auto-generated)

---

## Environment Configuration

### Backend (Python)
No env vars needed for local dev. For Render:
- Python version: 3.12 (already in `render.yaml`)
- Data files: Loaded from `data/` directory (included in repo)

### Frontend (React)
Create `frontend/.env` with:
```
VITE_API_URL=https://movielens-hybrid-api.onrender.com
```

Or copy from template:
```bash
cd frontend
cp .env.example .env
```

---

## Troubleshooting

### "ModuleNotFoundError: No module named sentence_transformers"
```bash
pip install -r requirements.txt
```

### "npm: command not found"
Install Node.js from https://nodejs.org

### "Backend API not found" in frontend
1. Check backend is running on correct port
2. Verify `VITE_API_URL` is set correctly
3. Check CORS is enabled (it is by default)

### Slow initial load
- SentenceTransformer model downloads on first run (~100MB)
- SVD computation happens at startup (few seconds)
- Subsequent requests are cached and very fast

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
│   ├── recommender.py       ← ML logic
│   ├── data_loader.py       ← CSV loading
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
├── data/
│   ├── movies.csv
│   ├── ratings.csv
│   └── tags.csv
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
2. Verify all data files exist in `data/`
3. Check backend logs (terminal running uvicorn)
4. Check frontend logs (Vite dev server terminal)
