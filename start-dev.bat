@echo off
title FinRoot - Dev Server
cd /d "%~dp0"

echo ============================================
echo   FinRoot  -  starting local dev server
echo ============================================
echo.

REM --- Make sure Node is available ---
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found on your PATH.
  echo Install it from https://nodejs.org/ and try again.
  echo.
  pause
  exit /b 1
)

REM --- Install dependencies on first run (or after they were removed) ---
if not exist "node_modules" (
  echo node_modules not found - installing dependencies, please wait...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed. Scroll up to see why.
    pause
    exit /b 1
  )
  echo.
)

REM --- Open the app in the default browser shortly after the server boots ---
start "" /b cmd /c "timeout /t 4 >nul & start http://localhost:8080/"

echo Launching Vite on http://localhost:8080/
echo (Press Ctrl+C in this window to stop the server.)
echo.

call npm run dev

REM --- Keep the window open if the server exits/crashes so you can read the error ---
echo.
echo Dev server stopped.
pause
