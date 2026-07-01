@echo off
chcp 65001 > nul
title Powder Dosing Tracker - 公网版本

echo.
echo ╔══════════════════════════════════════════════════╗
echo ║   粉末加样异常追踪系统 - 公网版本                  ║
echo ╠══════════════════════════════════════════════════╣
echo ║  启动 Node.js 服务器 + Serveo 公网隧道...         ║
echo ╚══════════════════════════════════════════════════╝
echo.

:: Start Node.js server
start "PowderDosing-Server" /min cmd /c "node server.js"
echo [OK] Server starting on port 3000...

:: Wait for server to start
timeout /t 3 /nobreak > nul

:: Start serveo tunnel
echo [..] Connecting to serveo.net for public URL...
start "PowderDosing-Tunnel" /min cmd /c "bash -c 'while true; do echo y | ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -R 80:localhost:3000 serveo.net 2>&1 | tee %USERPROFILE%\powder-dosing-tracker\tunnel_url.txt; sleep 5; done'"

:: Wait for tunnel
timeout /t 8 /nobreak > nul

:: Extract and display URL
echo.
echo ╔══════════════════════════════════════════════════╗
echo ║  公网访问地址:                                   ║
for /f "tokens=*" %%u in ('bash -c "grep -oP \"https://[a-f0-9]+-[0-9-]+\.serveousercontent\.com\" %USERPROFILE%/powder-dosing-tracker/tunnel_url.txt 2>/dev/null | tail -1"') do (
    echo ║  %%u                    ║
    start "" "%%u"
)
echo ╠══════════════════════════════════════════════════╣
echo ║  本机访问: http://localhost:3000                  ║
echo ║                                                  ║
echo ║  关闭此窗口不会停止服务                            ║
echo ║  停止: 关闭 Node.js 和 SSH 窗口即可               ║
echo ╚══════════════════════════════════════════════════╝
echo.
echo 按任意键退出此窗口（服务继续后台运行）...
pause > nul
