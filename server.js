const express = require('express');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection — auto-detects Railway's PostgreSQL variables
// Railway injects several variables when a Postgres service is linked.
let poolConfig;

// Try all possible connection string variables Railway might provide
const connectionString = 
  process.env.DATABASE_URL || 
  process.env.DATABASE_PRIVATE_URL || 
  process.env.PGHOST_URL || 
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRIVATE_URL ||
  null;

if (connectionString) {
  poolConfig = {
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 10,
  };
  console.log('DB: Using connection string');
} else if (process.env.PGHOST) {
  // Railway injects PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD individually
  poolConfig = {
    host: process.env.PGHOST,
    port: process.env.PGPORT || 5432,
    database: process.env.PGDATABASE || 'railway',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 10,
  };
  console.log('DB: Using PGHOST individual variables:', { host: process.env.PGHOST, port: process.env.PGPORT, database: process.env.PGDATABASE, user: process.env.PGUSER });
} else {
  // Fallback to DB_* variables
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
  console.log('DB: Using DB_* fallback variables');
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

// Diagnostic endpoint — shows ALL env vars and tests connection
app.get('/api/diagnostic', async (req, res) => {
  // Dump all environment variables that look database-related (mask passwords)
  const allEnv = {};
  Object.keys(process.env).sort().forEach(key => {
    const val = process.env[key];
    if (key.match(/PG|DATABASE|DB_|POSTGRES|SQL/i)) {
      // Mask passwords but show everything else
      if (key.match(/PASSWORD|PASS|SECRET/i)) {
        allEnv[key] = val ? '(set, ' + val.length + ' chars)' : '(empty)';
      } else if (key.match(/URL/i) && val) {
        // Show URL structure without password
        try {
          const u = new URL(val);
          allEnv[key] = u.protocol + '****@' + u.hostname + ':' + u.port + u.pathname;
        } catch (e) {
          allEnv[key] = val.substring(0, 40) + (val.length > 40 ? '...' : '');
        }
      } else {
        allEnv[key] = val || '(empty)';
      }
    }
  });
  
  const config = {
    allDbVars: allEnv,
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
