const express = require('express');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection — uses DATABASE_URL if available (Railway provides this),
// otherwise falls back to individual DB_* variables.
let poolConfig;

if (process.env.DATABASE_URL) {
  // Railway provides DATABASE_URL automatically when a Postgres plugin is added
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 10,
  };
  console.log('DB: Using DATABASE_URL connection string');
} else {
  // Fallback to individual variables
  poolConfig = {
    host: process.env.DB_HOST || 'db',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'baymard_tracker',
    user: process.env.DB_USER || 'fs_tracker',
    password: process.env.DB_PASSWORD || 'fs_tracker_secret',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 10,
  };
  console.log('DB config:', {
    host: process.env.DB_HOST || 'db',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'baymard_tracker',
    user: process.env.DB_USER || 'fs_tracker',
    ssl: process.env.DB_SSL === 'true',
  });
}

const pool = new Pool(poolConfig);

// Handle pool errors so they don't crash the app
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err.message);
});

let _dbReady = false;

// Middleware
app.use(cors());

// Disable caching for API and dynamic files
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.endsWith('.json') || req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

app.use(express.json());

// Serve static files from the root directory (flat structure)
app.use(express.static(__dirname, {
  etag: false,
  lastModified: false,
}));

// === API Routes ===

// Get all status overrides
app.get('/api/statuses', async (req, res) => {
  if (!_dbReady) {
    return res.json([]);
  }
  try {
    const result = await pool.query('SELECT item_key, status, updated_by, updated_at FROM status_overrides ORDER BY updated_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching statuses:', err.message);
    res.json([]);
  }
});

// Get status for a specific item
app.get('/api/statuses/:itemKey', async (req, res) => {
  if (!_dbReady) {
    return res.status(404).json({ error: 'Database not ready' });
  }
  try {
    const result = await pool.query('SELECT item_key, status, updated_by, updated_at FROM status_overrides WHERE item_key = $1', [req.params.itemKey]);
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(404).json({ error: 'No override found' });
    }
  } catch (err) {
    console.error('Error fetching status:', err.message);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// Update or create a status override
app.put('/api/statuses/:itemKey', async (req, res) => {
  const { itemKey } = req.params;
  const { status, note } = req.body;
  const updatedBy = req.body.updatedBy || req.body.changedBy;

  if (!status || !updatedBy) {
    return res.status(400).json({ error: 'status and changedBy are required' });
  }

  if (!_dbReady) {
    return res.status(503).json({ error: 'Database not ready yet. Please try again in a moment.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Upsert the status override
    const upsertResult = await client.query(
      `INSERT INTO status_overrides (item_key, status, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (item_key)
       DO UPDATE SET status = $2, updated_by = $3, updated_at = NOW()
       RETURNING item_key, status, updated_by, updated_at`,
      [itemKey, status, updatedBy]
    );

    // Insert into history
    await client.query(
      `INSERT INTO status_history (item_key, old_status, new_status, changed_by, note, changed_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [itemKey, req.body.oldStatus || null, status, updatedBy, note || null]
    );

    // Fetch the full history for this item
    const historyResult = await client.query(
      'SELECT old_status AS "from", new_status AS "to", changed_by AS by, changed_at AS date FROM status_history WHERE item_key = $1 ORDER BY changed_at DESC',
      [itemKey]
    );

    await client.query('COMMIT');
    res.json({ ...upsertResult.rows[0], history: historyResult.rows });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (e) {}
    }
    console.error('Error updating status:', err.message);
    res.status(500).json({ error: 'Failed to update status: ' + err.message });
  } finally {
    if (client) client.release();
  }
});

// Get change history for an item
app.get('/api/history/:itemKey', async (req, res) => {
  if (!_dbReady) {
    return res.json([]);
  }
  try {
    const result = await pool.query(
      'SELECT item_key, old_status, new_status, changed_by, note, changed_at FROM status_history WHERE item_key = $1 ORDER BY changed_at DESC',
      [req.params.itemKey]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching history:', err.message);
    res.json([]);
  }
});

// Get all history (for reporting)
app.get('/api/history', async (req, res) => {
  if (!_dbReady) {
    return res.json([]);
  }
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const result = await pool.query(
      'SELECT item_key, old_status, new_status, changed_by, note, changed_at FROM status_history ORDER BY changed_at DESC LIMIT $1',
      [limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching history:', err.message);
    res.json([]);
  }
});

// Health check — includes DB status
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    dbReady: _dbReady,
    timestamp: new Date().toISOString() 
  });
});

// Diagnostic endpoint — shows DB config and tests connection (no password shown)
app.get('/api/diagnostic', async (req, res) => {
  const dbUrl = process.env.DATABASE_URL || '';
  // Show a masked version of DATABASE_URL so we can see its format
  let dbUrlMasked = '(NOT SET)';
  if (dbUrl) {
    try {
      const u = new URL(dbUrl);
      dbUrlMasked = 'protocol=' + u.protocol + ' host=' + u.hostname + ' port=' + u.port + ' database=' + (u.pathname || '') + ' (valid URL)';
    } catch (e) {
      // Not a valid URL — show first 30 chars masked
      dbUrlMasked = 'INVALID URL, first 30 chars: ' + dbUrl.substring(0, 30).replace(/:[^:@]*@/, ':****@');
    }
  }
  const config = {
    DATABASE_URL: dbUrlMasked,
    DATABASE_SSL: process.env.DATABASE_SSL || '(not set, default: ssl enabled)',
    DB_HOST: process.env.DB_HOST || '(not set, default: db)',
    DB_PORT: process.env.DB_PORT || '(not set, default: 5432)',
    DB_NAME: process.env.DB_NAME || '(not set, default: baymard_tracker)',
    DB_USER: process.env.DB_USER || '(not set, default: fs_tracker)',
    DB_PASSWORD: process.env.DB_PASSWORD ? '(set, ' + process.env.DB_PASSWORD.length + ' chars)' : '(NOT SET)',
    DB_SSL: process.env.DB_SSL || '(not set, default: false)',
    dbReady: _dbReady,
  };
  
  // Try a test connection
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as now');
    client.release();
    res.json({ ...config, connectionTest: 'SUCCESS', serverTime: result.rows[0].now });
  } catch (err) {
    res.json({ ...config, connectionTest: 'FAILED', error: err.message, code: err.code });
  }
});

// Initialize database on startup
async function initDB() {
  try {
    const client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS status_overrides (
        item_key VARCHAR(255) PRIMARY KEY,
        status VARCHAR(100) NOT NULL,
        updated_by VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS status_history (
        id SERIAL PRIMARY KEY,
        item_key VARCHAR(255) NOT NULL,
        old_status VARCHAR(100),
        new_status VARCHAR(100) NOT NULL,
        changed_by VARCHAR(255) NOT NULL,
        note TEXT,
        changed_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_history_item_key ON status_history(item_key);
      CREATE INDEX IF NOT EXISTS idx_history_changed_at ON status_history(changed_at);
    `);
    client.release();
    _dbReady = true;
    console.log('✓ Database initialized and ready');
  } catch (err) {
    console.error('Database init error:', err.message);
    _dbReady = false;
    // Retry after delay
    setTimeout(initDB, 5000);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`Four Seasons Baymard Tracker running on http://localhost:${PORT}`);
  initDB();
});
