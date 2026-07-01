# Powder Dosing Tracker - 一键启动脚本
# 同时启动 Node.js 服务器 + natapp 公网隧道

$ErrorActionPreference = "SilentlyContinue"
$base = "C:\Users\Admin\powder-dosing-tracker"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Powder Dosing Anomaly Tracker                   ║" -ForegroundColor Cyan
Write-Host "║  粉末加样异常追踪系统 - 公网版                     ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan

# Kill any existing instances
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*powder*" } | Stop-Process -Force
Get-Process natapp -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 1

# Start Node.js server
Write-Host ""
Write-Host "[1/2] Starting server on port 3000..." -ForegroundColor Yellow
$serverJob = Start-Job -Name "PowderDosingServer" -ScriptBlock {
    Set-Location "C:\Users\Admin\powder-dosing-tracker"
    node server.js 2>&1 | Out-File "C:\Users\Admin\powder-dosing-tracker\server.log"
}
Start-Sleep 3

# Verify server
$check = curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000" --max-time 3 2>&1
if ($check -ne "200") {
    Write-Host "  ERROR: Server failed to start!" -ForegroundColor Red
    exit 1
}
Write-Host "  Server OK" -ForegroundColor Green

# Start natapp tunnel
Write-Host "[2/2] Starting natapp tunnel..." -ForegroundColor Yellow
$tunnelJob = Start-Job -Name "PowderDosingTunnel" -ScriptBlock {
    Set-Location "C:\Users\Admin\powder-dosing-tracker"
    while ($true) {
        .\natapp.exe
        Start-Sleep 3
    }
}
Start-Sleep 8

# Get tunnel URL from log
$logContent = Get-Content "$base\natapp.log" -Raw -ErrorAction SilentlyContinue
$publicUrl = ""
if ($logContent -match 'Tunnel established at (http://[^\s]+)') {
    $publicUrl = $matches[1]
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  ✅ 服务启动成功                                 ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════════════╣" -ForegroundColor Green
if ($publicUrl) {
    Write-Host "║  🌐 公网地址:                                    ║" -ForegroundColor Green
    Write-Host ("║  $publicUrl".PadRight(51) + "║") -ForegroundColor White
} else {
    Write-Host "║  🌐 http://aa75a64f.natappfree.cc                ║" -ForegroundColor White
}
Write-Host "║  🖥  本机: http://localhost:3000                  ║" -ForegroundColor Green
Write-Host "║                                                  ║" -ForegroundColor Green
Write-Host "║  按 Ctrl+C 停止全部服务                          ║" -ForegroundColor Red
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# Open browser
if ($publicUrl) { Start-Process $publicUrl }

# Keep alive
try {
    while ($true) { Start-Sleep 10 }
} finally {
    Write-Host "Stopping..." -ForegroundColor Yellow
    Stop-Job -Name "PowderDosingServer" -ErrorAction SilentlyContinue
    Stop-Job -Name "PowderDosingTunnel" -ErrorAction SilentlyContinue
    Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-Process natapp -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "Stopped." -ForegroundColor Gray
}
