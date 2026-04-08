@echo off
REM MovieLens Hybrid Recommender - Startup Script for Windows

echo.
echo ============================================
echo MovieLens Hybrid Recommender
echo ============================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python 3.10+
    pause
    exit /b 1
)

REM Check if Node/npm is installed
npm --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js/npm not found. Please install Node.js
    pause
    exit /b 1
)

echo [1/4] Backend: Installing/checking Python dependencies...
pip install -q -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install Python dependencies
    pause
    exit /b 1
)

echo [2/4] Frontend: Installing/checking Node dependencies...
cd frontend
npm install --silent
if errorlevel 1 (
    echo ERROR: Failed to install Node dependencies
    cd ..
    pause
    exit /b 1
)

REM Create .env if it doesn't exist
if not exist .env (
    echo Creating frontend .env...
    copy .env.example .env >nul
)

cd ..

echo.
echo [3/4] Starting Backend on http://localhost:8000...
start cmd /k "uvicorn backend.app.main:app --reload"

echo [4/4] Starting Frontend on http://localhost:5173...
timeout /t 3 /nobreak
cd frontend
start cmd /k "npm run dev"
cd ..

echo.
echo ============================================
echo ✓ Both servers are starting!
echo.
echo Backend API:  http://localhost:8000
echo Frontend UI:  http://localhost:5173
echo.
echo Press Ctrl+C in each window to stop.
echo ============================================
echo.
pause
