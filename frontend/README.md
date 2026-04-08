# MovieLens Hybrid Recommender Frontend

Complete React + Vite + TailwindCSS UI for the MovieLens Hybrid Recommender system.

## Features

- **Animated Search Bar** with typeahead suggestions and scan-line effect
- **Recommendation Cards** with:
  - Holographic tilt effect on hover
  - Signal breakdown bars (collaborative, semantic, popularity)
  - "Why this?" explanations
  - Color-coded signal source badges
- **Taste Profile Radar Chart** showing genre preferences
- **Staggered entrance animations** for all content
- **Responsive design** for mobile, tablet, and desktop
- **Glassmorphism UI** with backdrop blur and gradient accents

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment:
   ```bash
   cp .env.example .env
   # Edit .env to point to your backend (default: http://localhost:8000)
   ```

3. Run dev server:
   ```bash
   npm run dev
   ```

   Open http://localhost:5173 in your browser.

## Build for Production

```bash
npm run build
npm run preview
```

Output goes to `dist/` for deployment to Vercel or any static host.

## Environment Variables

- `VITE_API_URL`: Backend API URL (default: http://localhost:8000)

## Dependencies

- **React 18**: UI framework
- **Vite**: Build tool
- **TailwindCSS**: Styling
- **Framer Motion**: Animations and hover effects
- **Recharts**: Radar chart visualization
- **Axios**: HTTP client
