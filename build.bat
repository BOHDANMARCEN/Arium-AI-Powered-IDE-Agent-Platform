@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ========================================
echo   ARIUM - Збірка проєкту
echo ========================================
echo.

REM Перевірка Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js не знайдено!
    pause
    exit /b 1
)

REM Перевірка node_modules
if not exist "node_modules" (
    echo [INFO] Встановлюю залежності...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Помилка встановлення залежностей!
        pause
        exit /b 1
    )
)

echo.
echo [INFO] Компіляція TypeScript...
call npm run build

if %errorlevel% neq 0 (
    echo [ERROR] Помилка збірки!
    pause
    exit /b 1
)

echo.
echo [✓] Збірка завершена успішно!
echo Файли знаходяться в папці: dist\
echo.
pause

