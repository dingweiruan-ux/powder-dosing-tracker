@echo off
chcp 65001 >nul 2>&1
title Powder Dosing Tracker
cd /d %~dp0

echo.
echo   ╔════════════════════════════════════════════╗
echo   ║  粉末加样异常追踪系统 - 公网启动            ║
echo   ╚════════════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] Node.js not found. Install: https://nodejs.cn
    pause
    exit /b 1
)

:: Kill existing processes
taskkill /f /im node.exe /fi "WINDOWTITLE eq Pow*" >nul 2>&1
taskkill /f /im natapp.exe >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Start server
echo   [1/3] Starting local server...
start "PowderDosing-Server" /min cmd /c "node server.js"
timeout /t 3 /nobreak >nul

curl -s -o nul http://localhost:3000 >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] Server failed to start!
    pause
    exit /b 1
)
echo         Server OK on port 3000

:: Try natapp first (fastest - Chinese servers)
echo   [2/3] Trying natapp (domestic, fastest)...
start "PowderDosing-Tunnel" /min cmd /c ".\natapp.exe"
timeout /t 12 /nobreak >nul

findstr /C:"Tunnel established" natapp.log >nul 2>&1
if %errorlevel% equ 0 (
    echo         natapp connected!
    set TUNNEL=natapp
    goto :show_url
)

echo         natapp server down, trying Cloudflare...

:: Try Cloudflare (medium speed)
taskkill /f /im natapp.exe >nul 2>&1
if exist cloudflared.exe (
    start "PowderDosing-Tunnel" /min cmd /c ".\cloudflared.exe tunnel --url http://localhost:3000 --protocol http2 --no-autoupdate"
    timeout /t 14 /nobreak >nul

    findstr /C:"trycloudflare.com" cf_tunnel.log >nul 2>&1
    if %errorlevel% equ 0 (
        echo         Cloudflare connected!
        set TUNNEL=cloudflare
        goto :show_url
    )
)

echo         Falling back to serveo...

:: Fall back to serveo (slow but reliable)
taskkill /f /im cloudflared.exe >nul 2>&1
start "PowderDosing-Tunnel" /min bash -c "while true; do echo y | ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -R 80:localhost:3000 serveo.net 2>&1 | tee tunnel_url.txt; sleep 5; done"
timeout /t 12 /nobreak >nul
echo         serveo connected!
set TUNNEL=serveo

:show_url
echo   [3/3] Done!
echo.
echo   ╔════════════════════════════════════════════╗
echo   ║  ✅ 服务已启动                              ║
echo   ╠════════════════════════════════════════════╣

:: Show URL based on tunnel type
if "%TUNNEL%"=="natapp" (
    for /f "tokens=*" %%u in ('bash -c "grep -oP 'http://[a-f0-9]+\.natappfree\.cc' natapp.log 2>/dev/null | tail -1"') do (
        echo   ║  🌐 %%u                  ║
        start "" "%%u"
    )
)
if "%TUNNEL%"=="cloudflare" (
    for /f "tokens=*" %%u in ('bash -c "grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' cf_tunnel.log 2>/dev/null | tail -1"') do (
        echo   ║  🌐 %%u  ║
        start "" "%%u"
    )
)
if "%TUNNEL%"=="serveo" (
    for /f "tokens=*" %%u in ('bash -c "grep -oP 'https://[a-f0-9]+-[0-9-]+\.serveousercontent\.com' tunnel_url.txt 2>/dev/null | tail -1"') do (
        echo   ║  🌐 %%u  ║
        start "" "%%u"
    )
)

echo   ║                                            ║
echo   ║  🖥  本机: http://localhost:3000            ║
echo   ║                                            ║
echo   ║  停止: 关闭 "PowderDosing" 开头的窗口      ║
echo   ╚════════════════════════════════════════════╝
echo.
echo   Press any key to hide this window...
pause >nul
