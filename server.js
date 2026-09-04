const express = require('express');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'baymard_tracker',
  user: process.env.DB_USER || 'fs_tracker',
  password: process.env.DB_PASSWORD || 'fs_tracker_secret',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Middleware
app.use(cors());

// Disable caching for API and dynamic files so status changes always reflect
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
  try {
    const result = await pool.query('SELECT item_key, status, updated_by, updated_at FROM status_overrides ORDER BY updated_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching statuses:', err);
    res.status(500).json({ error: 'Failed to fetch statuses' });
  }
});

// Get status for a specific item
app.get('/api/statuses/:itemKey', async (req, res) => {
  try {
    const result = await pool.query('SELECT item_key, status, updated_by, updated_at FROM status_overrides WHERE item_key = $1', [req.params.itemKey]);
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(404).json({ error: 'No override found' });
    }
  } catch (err) {
    console.error('Error fetching status:', err);
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

  const client = await pool.connect();
  try {
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

    // Fetch the full history for this item to return to the client
    const historyResult = await client.query(
      'SELECT old_status AS "from", new_status AS "to", changed_by AS by, changed_at AS date FROM status_history WHERE item_key = $1 ORDER BY changed_at DESC',
      [itemKey]
    );

    await client.query('COMMIT');
    res.json({ ...upsertResult.rows[0], history: historyResult.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating status:', err);
    res.status(500).json({ error: 'Failed to update status' });
  } finally {
    client.release();
  }
});

// Get change history for an item
app.get('/api/history/:itemKey', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT item_key, old_status, new_status, changed_by, note, changed_at FROM status_history WHERE item_key = $1 ORDER BY changed_at DESC',
      [req.params.itemKey]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching history:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Get all history (for reporting)
app.get('/api/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const result = await pool.query(
      'SELECT item_key, old_status, new_status, changed_by, note, changed_at FROM status_history ORDER BY changed_at DESC LIMIT $1',
      [limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching history:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize database on startup
async function initDB() {
  try {
    await pool.query(`
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
    console.log('✓ Database initialized');
  } catch (err) {
    console.error('Database init error:', err.message);
    // Retry after delay
    setTimeout(initDB, 5000);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`Four Seasons Baymard Tracker running on http://localhost:${PORT}`);
  initDB();
});
