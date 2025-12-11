@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:MENU
cls
echo.
echo ========================================
echo   ARIUM - AI-Powered IDE ^& Agent Platform
echo ========================================
echo.
echo Оберіть дію:
echo.
echo   1. Запустити в режимі розробки (dev)
echo   2. Зібрати проєкт (build)
echo   3. Запустити зібраний проєкт (start)
echo   4. Встановити залежності (npm install)
echo   5. Запустити тести (test)
echo   6. Перевірити типи (type-check)
echo   7. Вихід
echo.
set /p choice="Ваш вибір (1-7): "

if "%choice%"=="1" goto DEV
if "%choice%"=="2" goto BUILD
if "%choice%"=="3" goto START
if "%choice%"=="4" goto INSTALL
if "%choice%"=="5" goto TEST
if "%choice%"=="6" goto TYPECHECK
if "%choice%"=="7" goto EXIT

echo [ERROR] Невірний вибір!
timeout /t 2 >nul
goto MENU

:DEV
cls
echo.
echo [INFO] Запуск у режимі розробки...
echo.
call npm run dev
goto END

:BUILD
cls
echo.
echo [INFO] Збірка проєкту...
echo.
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Помилка збірки!
    pause
)
goto MENU

:START
cls
echo.
echo [INFO] Запуск зібраного проєкту...
echo.
if not exist "dist\index.js" (
    echo [WARNING] Проєкт не зібрано! Спочатку виконайте збірку (опція 2).
    pause
    goto MENU
)
call npm start
goto END

:INSTALL
cls
echo.
echo [INFO] Встановлення залежностей...
echo.
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Помилка встановлення!
) else (
    echo [✓] Залежності встановлено успішно!
)
pause
goto MENU

:TEST
cls
echo.
echo [INFO] Запуск тестів...
echo.
call npm test
pause
goto MENU

:TYPECHECK
cls
echo.
echo [INFO] Перевірка типів TypeScript...
echo.
call npm run type-check
pause
goto MENU

:EXIT
echo.
echo До побачення!
exit /b 0

:END
echo.
echo Проєкт зупинено.
pause
goto MENU

