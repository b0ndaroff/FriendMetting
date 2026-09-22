@echo off
title Friends Meetup Scheduler
echo ========================================================
echo   Запуск сервісу зустрічей з друзями (Friends Meetup)
echo ========================================================
echo.
echo Перевірка Python...
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ПОМИЛКА] Python не знайдено в PATH. Встановіть Python 3.
    pause
    exit /b 1
)

echo Відкриття браузера...
start http://localhost:8000

echo Запуск веб-сервера...
python server.py
pause
