@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   ARIUM - Виправлення порту
echo ========================================
echo.

REM Перевірка порту 3000
netstat -ano | findstr :3000 >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARNING] Порт 3000 зайнятий!
    echo.
    echo Оберіть дію:
    echo   1. Зупинити процес на порту 3000
    echo   2. Змінити PORT на 4000 в .env
    echo   3. Вказати інший порт
    echo   4. Вихід
    echo.
    set /p choice="Ваш вибір (1-4): "
    
    if "%choice%"=="1" goto KILL
    if "%choice%"=="2" goto CHANGE_PORT
    if "%choice%"=="3" goto CUSTOM_PORT
    if "%choice%"=="4" goto EXIT
    goto EXIT
) else (
    echo [✓] Порт 3000 вільний
    goto EXIT
)

:KILL
echo.
echo Знайдено процеси на порту 3000:
netstat -ano | findstr :3000
echo.
set /p pid="Введіть PID процесу для зупинки (або Enter для автоматичного): "
if "%pid%"=="" (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
        echo Зупиняю процес %%a...
        taskkill /PID %%a /F >nul 2>&1
        if %errorlevel% equ 0 (
            echo [✓] Процес зупинено
        ) else (
            echo [ERROR] Не вдалося зупинити процес. Можливо, потрібні права адміністратора.
        )
    )
) else (
    taskkill /PID %pid% /F >nul 2>&1
    if %errorlevel% equ 0 (
        echo [✓] Процес %pid% зупинено
    ) else (
        echo [ERROR] Не вдалося зупинити процес %pid%
    )
)
goto EXIT

:CHANGE_PORT
echo.
echo [INFO] Змінюю PORT на 4000 в .env...
if exist .env (
    powershell -Command "(Get-Content .env) -replace '^PORT=.*', 'PORT=4000' | Set-Content .env"
    findstr /C:"PORT=" .env >nul 2>&1
    if %errorlevel% neq 0 (
        echo PORT=4000 >> .env
    )
    echo [✓] PORT змінено на 4000
) else (
    echo PORT=4000 > .env
    echo [✓] Створено .env з PORT=4000
)
goto EXIT

:CUSTOM_PORT
echo.
set /p newport="Введіть новий порт (наприклад, 4000, 5000): "
if "%newport%"=="" (
    echo [ERROR] Порт не вказано
    goto EXIT
)
echo [INFO] Змінюю PORT на %newport% в .env...
if exist .env (
    powershell -Command "(Get-Content .env) -replace '^PORT=.*', 'PORT=%newport%' | Set-Content .env"
    findstr /C:"PORT=" .env >nul 2>&1
    if %errorlevel% neq 0 (
        echo PORT=%newport% >> .env
    )
    echo [✓] PORT змінено на %newport%
) else (
    echo PORT=%newport% > .env
    echo [✓] Створено .env з PORT=%newport%
)
goto EXIT

:EXIT
echo.
echo Готово! Тепер можна запустити: start.bat
echo.
pause

