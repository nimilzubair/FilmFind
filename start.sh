#!/bin/bash
# MovieLens Hybrid Recommender - Startup Script for macOS/Linux

echo ""
echo "============================================"
echo "MovieLens Hybrid Recommender"
echo "============================================"
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 not found. Please install Python 3.10+"
    exit 1
fi

# Check if Node/npm is installed
if ! command -v npm &> /dev/null; then
    echo "ERROR: Node.js/npm not found. Please install Node.js"
    exit 1
fi

echo "[1/4] Backend: Installing/checking Python dependencies..."
pip install -q -r requirements.txt
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install Python dependencies"
    exit 1
fi

echo "[2/4] Frontend: Installing/checking Node dependencies..."
cd frontend
npm install --silent
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install Node dependencies"
    exit 1
fi

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating frontend .env..."
    cp .env.example .env
fi

cd ..

echo ""
echo "[3/4] Starting Backend on http://localhost:8000..."
uvicorn backend.app.main:app --reload &
BACKEND_PID=$!

echo "[4/4] Starting Frontend on http://localhost:5173..."
sleep 3
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "============================================"
echo "✓ Both servers are starting!"
echo ""
echo "Backend API:  http://localhost:8000"
echo "Frontend UI:  http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all services."
echo "============================================"
echo ""

# Wait for both processes
wait
