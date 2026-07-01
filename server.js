const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const {
  initDatabase,
  insertLog,
  queryLogs,
  countLogs,
  getStats,
  closeDatabase,
} = require('./database');

// ─── Configuration ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ─── Express App ─────────────────────────────────────────────────────────────
const app = express();

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS headers for API endpoints
app.use('/api', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── API Routes ──────────────────────────────────────────────────────────────

/**
 * POST /api/logs
 * Inject an anomaly log from dosing equipment / PLC / edge gateway.
 *
 * Required fields: material_name, target_dosing_weight, actual_dosing_weight
 * Optional fields:  continuous_dosing_speed, inching_dosing_weight,
 *                   inching_dosing_angle, inching_dosing_speed
 *
 * Auto-generated:   error_value in mg (actual - target) × 1000, server_timestamp (ISO 8601)
 */
app.post('/api/logs', (req, res) => {
  try {
    const payload = req.body;

    // ── Validate required fields ──────────────────────────────────────────
    const missing = [];
    if (!payload.material_name || typeof payload.material_name !== 'string') {
      missing.push('material_name (string, required)');
    }
    if (payload.target_dosing_weight == null || isNaN(Number(payload.target_dosing_weight))) {
      missing.push('target_dosing_weight (float, required)');
    }
    if (payload.actual_dosing_weight == null || isNaN(Number(payload.actual_dosing_weight))) {
      missing.push('actual_dosing_weight (float, required)');
    }

    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Validation failed: missing or invalid required fields.',
        missing_fields: missing,
      });
    }

    // Coerce numeric fields
    payload.target_dosing_weight = Number(payload.target_dosing_weight);
    payload.actual_dosing_weight = Number(payload.actual_dosing_weight);
    if (payload.continuous_dosing_speed != null) payload.continuous_dosing_speed = Number(payload.continuous_dosing_speed);
    if (payload.inching_dosing_weight   != null) payload.inching_dosing_weight   = Number(payload.inching_dosing_weight);
    if (payload.inching_dosing_angle    != null) payload.inching_dosing_angle    = Number(payload.inching_dosing_angle);
    if (payload.inching_dosing_speed    != null) payload.inching_dosing_speed    = Number(payload.inching_dosing_speed);

    // ── Insert record ─────────────────────────────────────────────────────
    const record = insertLog(payload);

    // ── Broadcast to all WebSocket clients ─────────────────────────────────
    const message = JSON.stringify({ type: 'new_log', data: record });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });

    console.log(`[API] Log #${record.id} inserted — ${record.material_name} | Error: ${record.error_value} mg`);

    return res.status(201).json({
      message: 'Log created successfully.',
      record,
    });
  } catch (err) {
    console.error('[API] Error inserting log:', err.message);
    return res.status(500).json({
      error: 'Internal server error while inserting log.',
      detail: err.message,
    });
  }
});

/**
 * GET /api/logs
 * Retrieve anomaly logs with optional filtering and sorting.
 *
 * Query params:
 *   material_name  - Filter by material name (partial match, case-insensitive-ish via LIKE)
 *   sort_by        - Column to sort by (default: server_timestamp)
 *   sort_order     - 'ASC' or 'DESC' (default: DESC)
 *   limit          - Max records (default: 1000, max: 10000)
 *   offset         - Pagination offset (default: 0)
 */
app.get('/api/logs', (req, res) => {
  try {
    const {
      material_name,
      sort_by,
      sort_order,
      limit,
      offset,
    } = req.query;

    const records = queryLogs({
      materialName: material_name || null,
      sortBy: sort_by || 'server_timestamp',
      sortOrder: sort_order || 'DESC',
      limit: parseInt(limit) || 1000,
      offset: parseInt(offset) || 0,
    });

    const total = countLogs(material_name || null);

    return res.json({
      total,
      count: records.length,
      records,
    });
  } catch (err) {
    console.error('[API] Error querying logs:', err.message);
    return res.status(500).json({
      error: 'Internal server error while querying logs.',
      detail: err.message,
    });
  }
});

/**
 * GET /api/stats
 * Quick summary statistics.
 */
app.get('/api/stats', (req, res) => {
  try {
    const stats = getStats();
    return res.json(stats);
  } catch (err) {
    console.error('[API] Error fetching stats:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─── HTTP Server & WebSocket ─────────────────────────────────────────────────
const server = http.createServer(app);

const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[WS] Client connected: ${clientIp} (total: ${wss.clients.size})`);

  // Send a welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'WebSocket connection established.',
    timestamp: new Date().toISOString(),
  }));

  ws.on('close', (code, reason) => {
    console.log(`[WS] Client disconnected: ${clientIp} (code: ${code}, total: ${wss.clients.size})`);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error from ${clientIp}:`, err.message);
  });
});

// Broadcast helper — exported for potential use elsewhere
function broadcast(type, data) {
  const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
function shutdown() {
  console.log('\n[Server] Shutting down gracefully...');

  // Close all WebSocket connections
  wss.clients.forEach((client) => {
    client.close(1001, 'Server shutting down');
  });
  wss.close();

  // Close HTTP server
  server.close(() => {
    closeDatabase();
    console.log('[Server] Shutdown complete.');
    process.exit(0);
  });

  // Force exit after 5 seconds
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ─── Start Server ────────────────────────────────────────────────────────────
async function start() {
  // Initialize database (sql.js is async)
  await initDatabase();

  server.listen(PORT, HOST, () => {
    const os = require('os');
    const nets = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
      }
    }

    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║   Powder Dosing Anomaly Tracker — 粉末加样异常追踪系统    ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║   本机访问:    http://localhost:${PORT}                    `.padEnd(58) + '║');
    for (const ip of ips) {
      console.log(`║   局域网访问:  http://${ip}:${PORT}                     `.padEnd(58) + '║');
    }
    console.log(`║   API:         POST http://localhost:${PORT}/api/logs      `.padEnd(58) + '║');
    console.log(`║   WebSocket:   ws://localhost:${PORT}/ws                   `.padEnd(58) + '║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');
  });
}

start().catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});

module.exports = { app, server, wss, broadcast };
