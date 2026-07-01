@echo off
chcp 65001 >nul 2>&1
title Powder Dosing Tracker

cd /d %~dp0

echo.
echo   ╔════════════════════════════════════════════╗
echo   ║  粉末加样异常追踪系统 - 公网版              ║
echo   ╚════════════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] 未找到 Node.js, 请先安装: https://nodejs.cn
    pause
    exit /b 1
)

echo   [1/2] 启动本地服务器...
start "PowderDosing-Server" /min cmd /c "node server.js"
timeout /t 3 /nobreak >nul

:: Verify server
curl -s -o nul http://localhost:3000 >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] 服务器启动失败
    pause
    exit /b 1
)
echo         服务器 OK

echo   [2/2] 启动 natapp 公网隧道...
start "PowderDosing-Tunnel" /min cmd /c ".\natapp.exe"

timeout /t 8 /nobreak >nul

echo.
echo   ╔════════════════════════════════════════════╗
echo   ║  ✅ 启动完成!                              ║
echo   ║                                            ║
echo   ║  🌐 公网地址:                               ║
echo   ║  http://aa75a64f.natappfree.cc              ║
echo   ║                                            ║
echo   ║  🖥  本机地址: http://localhost:3000        ║
echo   ║                                            ║
echo   ║  ⚠  关闭此窗口不会停止服务                  ║
echo   ║  停止: 关闭 "PowderDosing" 开头的窗口       ║
echo   ╚════════════════════════════════════════════╝
echo.

:: Open browser
start "" http://aa75a64f.natappfree.cc

echo   服务运行中... 按任意键隐藏此窗口
pause >nul
