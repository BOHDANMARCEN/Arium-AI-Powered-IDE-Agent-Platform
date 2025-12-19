@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ========================================
echo   ARIUM - AI-Powered IDE ^& Agent Platform
echo ========================================
echo.

REM Перевірка Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js не знайдено!
    echo Будь ласка, встановіть Node.js з https://nodejs.org/
    pause
    exit /b 1
)

echo [✓] Node.js знайдено
node --version

REM Перевірка npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm не знайдено!
    pause
    exit /b 1
)

echo [✓] npm знайдено
npm --version
echo.

REM Перевірка node_modules
if not exist "node_modules" (
    echo [INFO] node_modules не знайдено. Встановлюю залежності...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Помилка встановлення залежностей!
        pause
        exit /b 1
    )
    echo.
    echo [✓] Залежності встановлено
) else (
    echo [✓] node_modules знайдено
)

echo.

REM Перевірка .env файлу
if not exist ".env" (
    echo [INFO] .env файл не знайдено
    echo Створюю базовий .env файл...
    (
        echo # Arium Configuration
        echo # Server
        echo PORT=4000
        echo.
        echo # WebSocket Authentication
        echo WS_TOKEN=changeme_secure_token_here
        echo.
        echo # OpenAI (optional)
        echo # OPENAI_API_KEY=your_key_here
        echo # OPENAI_MODEL=gpt-4o-mini
        echo.
        echo # Ollama (optional)
        echo # USE_OLLAMA=true
        echo # OLLAMA_URL=http://localhost:11434
        echo # OLLAMA_MODEL=llama3.2:3b
        echo.
        echo # Storage
        echo WORKSPACE_PATH=workspace
        echo PROJECT_ID=default
        echo PERSISTENT_STORAGE=true
        echo.
        echo # VFS Limits
        echo VFS_MAX_FILE_BYTES=10000000
        echo.
        echo # EventBus
        echo EVENT_HISTORY_LIMIT=10000
        echo.
        echo # CORS
        echo ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
        echo.
        echo # Rate Limiting
        echo TOOL_RATE_LIMIT_PER_SEC=10
        echo API_RATE_LIMIT_WINDOW_MS=60000
        echo API_RATE_LIMIT_MAX_REQUESTS=100
    ) > .env
    echo [✓] .env файл створено
    echo [WARNING] Будь ласка, налаштуйте .env файл перед запуском!
    echo.
) else (
    echo [✓] .env файл знайдено
)

echo.
echo ========================================
echo   Запуск проєкту в режимі розробки...
echo ========================================
echo.

REM Перевірка порту перед запуском
if exist ".env" (
    for /f "tokens=2 delims==" %%a in ('findstr /C:"PORT=" .env') do set PORT=%%a
    if defined PORT (
        echo [INFO] Перевіряю порт %PORT%...
        netstat -ano | findstr ":%PORT%" >nul 2>&1
        if %errorlevel% equ 0 (
            echo [WARNING] Порт %PORT% вже зайнятий!
            echo.
            echo Оберіть дію:
            echo   1. Зупинити процес на порту %PORT%
            echo   2. Продовжити (може виникнути помилка)
            echo   3. Вийти і запустити fix-port.bat
            echo.
            set /p portchoice="Ваш вибір (1-3): "
            if "!portchoice!"=="1" (
                for /f "tokens=5" %%b in ('netstat -ano ^| findstr ":%PORT%" ^| findstr LISTENING') do (
                    echo Зупиняю процес %%b...
                    taskkill /PID %%b /F >nul 2>&1
                    if !errorlevel! equ 0 (
                        echo [✓] Процес зупинено
                    ) else (
                        echo [ERROR] Не вдалося зупинити процес
                    )
                )
            ) else if "!portchoice!"=="3" (
                echo.
                echo Запустіть: fix-port.bat
                pause
                exit /b 0
            )
        ) else (
            echo [✓] Порт %PORT% вільний
        )
    )
)

echo.
echo Натисніть Ctrl+C для зупинки
echo.

REM Запуск у режимі розробки
echo Запускаю npm run dev...
echo.

call npm run dev

REM Якщо npm run dev завершився з помилкою
if %errorlevel% neq 0 (
    echo.
    echo ========================================
    echo   [ERROR] Помилка запуску проєкту!
    echo ========================================
    echo.
    echo Можливі причини:
    echo   1. Порт зайнятий (перевірте PORT в .env)
    echo   2. Помилка в коді
    echo   3. Відсутні залежності
    echo.
    echo Спробуйте:
    echo   - Перевірити .env файл
    echo   - Запустити: fix-port.bat
    echo   - Перевірити логи вище
    echo.
    pause
    exit /b 1
)

REM Якщо сервер зупинився нормально (Ctrl+C)
echo.
echo ========================================
echo   Сервер зупинено
echo ========================================
echo.
pause

