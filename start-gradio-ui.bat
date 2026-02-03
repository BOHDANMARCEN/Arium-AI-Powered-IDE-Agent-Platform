@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

set "ROOT_DIR=%~dp0"
set "UI_DIR=%ROOT_DIR%ui\gradio"
set "VENV_DIR=%UI_DIR%\.venv"
set "PYTHON_EXE="

if not exist "%UI_DIR%" (
  echo [ERROR] Gradio UI directory not found: %UI_DIR%
  pause
  exit /b 1
)

where python >nul 2>&1
if %errorlevel% equ 0 set "PYTHON_EXE=python"

if not defined PYTHON_EXE (
  where py >nul 2>&1
  if %errorlevel% equ 0 set "PYTHON_EXE=py -3"
)

if not defined PYTHON_EXE (
  echo [ERROR] Python was not found. Install Python 3.10+ first.
  pause
  exit /b 1
)

if not exist "%VENV_DIR%\Scripts\python.exe" (
  echo [INFO] Creating virtual environment...
  %PYTHON_EXE% -m venv "%VENV_DIR%"
  if %errorlevel% neq 0 (
    echo [ERROR] Failed to create virtual environment.
    pause
    exit /b 1
  )
)

call "%VENV_DIR%\Scripts\activate"

echo [INFO] Installing dependencies...
python -m pip install --upgrade pip >nul 2>&1
pip install -r "%UI_DIR%\requirements.txt"
if %errorlevel% neq 0 (
  echo [ERROR] Failed to install Python dependencies.
  pause
  exit /b 1
)

if not defined ARIUM_API_URL (
  if exist "%ROOT_DIR%.env" (
    for /f "tokens=2 delims==" %%a in ('findstr /b /c:"PORT=" "%ROOT_DIR%.env"') do set "SERVER_PORT=%%a"
  )
if defined SERVER_PORT set "ARIUM_API_URL=http://localhost:%SERVER_PORT%"
if not defined SERVER_PORT set "ARIUM_API_URL=http://localhost:4000"
if "%ARIUM_API_URL%"=="" set "ARIUM_API_URL=http://localhost:4000"
)

echo [INFO] Starting Gradio UI...
echo UI: http://localhost:7860 (if busy, port may auto-increment; check console)
echo API: %ARIUM_API_URL%
echo.

python "%UI_DIR%\app.py"

endlocal
