@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   ARIUM - Налаштування Ollama
echo ========================================
echo.

REM Перевірка Ollama
where ollama >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Ollama не знайдено в PATH!
    echo Будь ласка, встановіть Ollama з https://ollama.ai/
    pause
    exit /b 1
)

echo [✓] Ollama знайдено
echo.

REM Перевірка чи Ollama запущений
ollama list >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Ollama сервер не відповідає!
    echo Запустіть Ollama: ollama serve
    echo.
)

echo Доступні моделі:
ollama list
echo.

REM Оновлення .env файлу
if not exist ".env" (
    echo [INFO] Створюю .env файл...
    (
        echo PORT=3000
        echo WS_TOKEN=changeme_secure_token_here
        echo WORKSPACE_PATH=workspace
        echo PROJECT_ID=default
        echo PERSISTENT_STORAGE=true
        echo VFS_MAX_FILE_BYTES=10000000
        echo EVENT_HISTORY_LIMIT=10000
        echo ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
        echo TOOL_RATE_LIMIT_PER_SEC=10
        echo API_RATE_LIMIT_WINDOW_MS=60000
        echo API_RATE_LIMIT_MAX_REQUESTS=100
    ) > .env
)

echo.
echo Оберіть модель для використання:
echo.
echo   1. qwen3-coder:480b-cloud (рекомендовано для коду)
echo   2. llama3.2:3b (швидка, легка)
echo   3. deepseek-v3.1:671b-cloud (потужна)
echo   4. huihui_ai/qwen3-abliterated:14b
echo   5. Вказати власну модель
echo   6. Пропустити (використати за замовчуванням: llama3.2:3b)
echo.
set /p choice="Ваш вибір (1-6): "

if "%choice%"=="1" set MODEL=qwen3-coder:480b-cloud
if "%choice%"=="2" set MODEL=llama3.2:3b
if "%choice%"=="3" set MODEL=deepseek-v3.1:671b-cloud
if "%choice%"=="4" set MODEL=huihui_ai/qwen3-abliterated:14b
if "%choice%"=="5" (
    set /p MODEL="Введіть назву моделі: "
)
if "%choice%"=="6" set MODEL=llama3.2:3b

if not defined MODEL set MODEL=llama3.2:3b

echo.
echo [INFO] Оновлюю .env файл...

REM Додаємо Ollama налаштування до .env
findstr /C:"USE_OLLAMA" .env >nul 2>&1
if %errorlevel% neq 0 (
    echo USE_OLLAMA=true >> .env
    echo OLLAMA_URL=http://localhost:11434 >> .env
    echo OLLAMA_MODEL=%MODEL% >> .env
    echo [✓] Ollama налаштування додано до .env
) else (
    echo [INFO] Ollama вже налаштовано в .env
    echo Оновлюю модель...
    powershell -Command "(Get-Content .env) -replace 'OLLAMA_MODEL=.*', 'OLLAMA_MODEL=%MODEL%' | Set-Content .env"
    echo [✓] Модель оновлено: %MODEL%
)

echo.
echo ========================================
echo   Налаштування завершено!
echo ========================================
echo.
echo Вибрана модель: %MODEL%
echo.
echo Тепер ви можете запустити проєкт:
echo   start.bat
echo.
echo Або вручну:
echo   npm run dev
echo.
pause

