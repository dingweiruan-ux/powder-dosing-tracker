# Powder Dosing Anomaly Tracker — 粉末加样异常追踪系统

Real-time anomaly tracking system for powder dosing mechanism with WebSocket push.

## Quick Start

```bash
cd powder-dosing-tracker
npm install
npm start
```

Open **http://localhost:3000** in your browser.

## Project Structure

```
powder-dosing-tracker/
├── package.json          # Dependencies & scripts
├── server.js             # Express + WebSocket server, API routes
├── database.js           # SQLite schema, insert/query functions
├── public/
│   └── index.html        # Complete SPA frontend
└── README.md
```

## API Reference

### POST /api/logs — Inject an anomaly log

```bash
curl -X POST http://localhost:3000/api/logs \
  -H "Content-Type: application/json" \
  -d '{
    "material_name": "Co-Li/AC Catalyst",
    "continuous_dosing_speed": 150.5,
    "inching_dosing_weight": 2.30,
    "inching_dosing_angle": 45.0,
    "inching_dosing_speed": 120.0,
    "target_dosing_weight": 100.00,
    "actual_dosing_weight": 103.50,
    "device_timestamp": "2026-06-26T08:00:00+08:00"
  }'
```

**Required fields:** `material_name` (string), `target_dosing_weight` (float), `actual_dosing_weight` (float)

**Auto-generated:** `error_value` (= actual − target), `server_timestamp` (ISO 8601 with timezone)

**Optional:** `continuous_dosing_speed`, `inching_dosing_weight`, `inching_dosing_angle`, `inching_dosing_speed`, `device_timestamp`

### GET /api/logs — Query logs

```bash
curl "http://localhost:3000/api/logs?material_name=Catalyst&sort_by=server_timestamp&sort_order=DESC&limit=100"
```

### GET /api/stats — Quick statistics

```bash
curl http://localhost:3000/api/stats
```

## Features

| Feature | Implementation |
|---------|---------------|
| **Dual Timestamps** | `server_timestamp` auto-generated at insert; `device_timestamp` stored if provided |
| **Real-time Push** | WebSocket broadcasts new records to all connected clients instantly |
| **Dynamic Threshold** | UI input for tolerance %; rows highlighted red when `|Actual−Target|/Target > Tolerance` |
| **Column Sorting** | Click any column header to sort ASC/DESC (default: server timestamp DESC) |
| **Material Filter** | Text filter with server-side query |
| **Indexed Timestamps** | SQLite indexes on both `server_timestamp` and `device_timestamp` |
| **Dedup** | WebSocket handler skips duplicate IDs on client side |
| **Auto-reconnect** | WebSocket reconnects automatically after disconnect |

## Data Fields

| # | Field | Type | Unit | Notes |
|---|-------|------|------|-------|
| 1 | 原料名称 Material Name | String | — | Required |
| 2 | 连续加样转速 Cont. Dosing Speed | Float | rpm | Optional |
| 3 | 点动加样重量 Inching Dosing Weight | Float | g | Optional |
| 4 | 点动加样角度 Inching Dosing Angle | Float | ° | Optional |
| 5 | 点动加样转速 Inching Dosing Speed | Float | rpm | Optional |
| 6 | 目标加样重量 Target Dosing Weight | Float | g | Required |
| 7 | 实际加样重量 Actual Dosing Weight | Float | g | Required |
| 8 | 误差值 Error Value | Float | g | Auto: Actual − Target |
| 9 | 设备时间 Device Timestamp | DateTime | — | ISO 8601, optional |
| 10 | 系统写入时间 Server Timestamp | DateTime | — | ISO 8601, auto-generated |
