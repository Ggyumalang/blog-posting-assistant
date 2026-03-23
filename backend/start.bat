@echo off
echo ==================================================
echo Starting Blog Posting Assistant Backend Server...
echo ==================================================

cd /d "%~dp0"

echo [1/3] Checking virtual environment...
if not exist "venv\Scripts\activate.bat" (
    echo [ERROR] Virtual environment not found in %~dp0venv.
    echo Please make sure the venv is created.
    pause
    exit /b 1
)

echo [2/3] Activating virtual environment...
call venv\Scripts\activate.bat

echo [3/3] Starting FastAPI server on port 8000...
python -m uvicorn app.main:app --reload --port 8000

pause
