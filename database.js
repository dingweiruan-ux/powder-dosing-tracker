const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'anomaly_logs.db');

let db = null;
let SQL = null;

async function initDatabase() {
  SQL = await initSqlJs();

  try {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('[DB] Loaded existing database from', DB_PATH);
  } catch {
    db = new SQL.Database();
    console.log('[DB] Created new database');
  }

  db.run('PRAGMA journal_mode = OFF');
  db.run('PRAGMA synchronous = OFF');

  db.run(`
    CREATE TABLE IF NOT EXISTS anomaly_logs (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      material_name           TEXT    NOT NULL,
      continuous_dosing_speed REAL,
      inching_dosing_weight   REAL,
      inching_dosing_angle    REAL,
      inching_dosing_speed    REAL,
      target_dosing_weight    REAL    NOT NULL,
      actual_dosing_weight    REAL    NOT NULL,
      error_value             REAL    NOT NULL,
      server_timestamp        TEXT    NOT NULL
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_server_timestamp ON anomaly_logs(server_timestamp DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_material_name ON anomaly_logs(material_name)`);

  // Migrate: drop device_timestamp column if it exists from older schema
  try { db.run('ALTER TABLE anomaly_logs DROP COLUMN device_timestamp'); } catch {}

  persistToDisk();
  console.log('[DB] Database initialized successfully.');
  return db;
}

function persistToDisk() {
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error('[DB] Failed to persist database:', err.message);
  }
}

/* ── Query helpers ─────────────────────────────────────────────────────── */

function queryAll(sql, params = {}) {
  const { query, values } = prepareQuery(sql, params);
  try {
    const stmt = db.prepare(query);
    if (values.length > 0) stmt.bind(values);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  } catch (err) {
    console.error('[DB] Query error:', err.message, 'SQL:', query);
    throw err;
  }
}

function queryOne(sql, params = {}) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function execute(sql, params = {}) {
  const { query, values } = prepareQuery(sql, params);
  try {
    db.run(query, values);
    const result = {
      changes: db.getRowsModified(),
      lastInsertRowid: queryOne('SELECT last_insert_rowid() as id')?.id || 0,
    };
    persistToDisk();
    return result;
  } catch (err) {
    console.error('[DB] Execute error:', err.message, 'SQL:', query);
    throw err;
  }
}

function prepareQuery(sql, params) {
  const values = [];
  let query = sql.replace(/:(\w+)/g, (_, name) => {
    values.push(params[name] !== undefined ? params[name] : null);
    return '?';
  });
  return { query, values };
}

/* ── Public API ────────────────────────────────────────────────────────── */

function insertLog(payload) {
  const serverTimestamp = new Date().toISOString();
  // error_value in mg: (actual_g - target_g) × 1000, rounded to 1 decimal
  const errorValue = Math.round((payload.actual_dosing_weight - payload.target_dosing_weight) * 1000 * 10) / 10;

  const sql = `
    INSERT INTO anomaly_logs (
      material_name, continuous_dosing_speed, inching_dosing_weight,
      inching_dosing_angle, inching_dosing_speed,
      target_dosing_weight, actual_dosing_weight, error_value,
      server_timestamp
    ) VALUES (
      :material_name, :continuous_dosing_speed, :inching_dosing_weight,
      :inching_dosing_angle, :inching_dosing_speed,
      :target_dosing_weight, :actual_dosing_weight, :error_value,
      :server_timestamp
    )
  `;

  const result = execute(sql, {
    material_name:           payload.material_name,
    continuous_dosing_speed: payload.continuous_dosing_speed ?? null,
    inching_dosing_weight:   payload.inching_dosing_weight   ?? null,
    inching_dosing_angle:    payload.inching_dosing_angle    ?? null,
    inching_dosing_speed:    payload.inching_dosing_speed    ?? null,
    target_dosing_weight:    payload.target_dosing_weight,
    actual_dosing_weight:    payload.actual_dosing_weight,
    error_value:             errorValue,
    server_timestamp:        serverTimestamp,
  });

  return getLogById(result.lastInsertRowid);
}

function getLogById(id) {
  return queryOne('SELECT * FROM anomaly_logs WHERE id = :id', { id });
}

function queryLogs(options = {}) {
  const {
    materialName = null,
    sortBy = 'server_timestamp',
    sortOrder = 'DESC',
    limit = 1000,
    offset = 0,
  } = options;

  const allowedSortColumns = new Set([
    'id', 'material_name', 'continuous_dosing_speed',
    'inching_dosing_weight', 'inching_dosing_angle', 'inching_dosing_speed',
    'target_dosing_weight', 'actual_dosing_weight', 'error_value',
    'server_timestamp',
  ]);

  const safeSortBy = allowedSortColumns.has(sortBy) ? sortBy : 'server_timestamp';
  const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  let sql = 'SELECT * FROM anomaly_logs';
  const params = {};

  if (materialName) {
    sql += ' WHERE material_name LIKE :materialName';
    params.materialName = `%${materialName}%`;
  }

  sql += ` ORDER BY ${safeSortBy} ${safeSortOrder}`;
  sql += ' LIMIT :limit OFFSET :offset';
  params.limit = Math.min(limit, 10000);
  params.offset = offset;

  return queryAll(sql, params);
}

function countLogs(materialName = null) {
  let sql = 'SELECT COUNT(*) as count FROM anomaly_logs';
  const params = {};
  if (materialName) {
    sql += ' WHERE material_name LIKE :materialName';
    params.materialName = `%${materialName}%`;
  }
  const row = queryOne(sql, params);
  return row ? row.count : 0;
}

function getStats() {
  const total = countLogs();
  const latest = queryOne('SELECT * FROM anomaly_logs ORDER BY server_timestamp DESC LIMIT 1');
  return { total, latest };
}

function closeDatabase() {
  if (db) {
    persistToDisk();
    db.close();
    db = null;
    console.log('[DB] Database connection closed.');
  }
}

module.exports = {
  initDatabase,
  insertLog,
  getLogById,
  queryLogs,
  countLogs,
  getStats,
  closeDatabase,
};
