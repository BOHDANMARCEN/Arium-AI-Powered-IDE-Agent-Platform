@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   ARIUM - Швидкий запуск
echo ========================================
echo.

REM Швидка перевірка та запуск
where node >nul 2>&1 || (
    echo [ERROR] Node.js не встановлено!
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [INFO] Встановлюю залежності (це може зайняти хвилину)...
    call npm install
)

if not exist ".env" (
    echo [INFO] Створюю .env файл...
    (
        echo PORT=3000
        echo WS_TOKEN=changeme_secure_token_here
        echo WORKSPACE_PATH=workspace
        echo PROJECT_ID=default
        echo PERSISTENT_STORAGE=true
    ) > .env
)

echo.
echo [INFO] Запускаю проєкт...
echo Сервер буде доступний на http://localhost:3000
echo Натисніть Ctrl+C для зупинки
echo.

call npm run dev

