/* === Four Seasons Baymard Tracker — Shared Status Logic & API === */
/* This file is loaded by both index.html and roadmap-tracker.html */

// Status definitions — 8-stage workflow
const STATUSES = {
  'Identified':     { key: 'identified',     label: 'Identified',     cls: 'badge-identified',     color: '#999',    order: 0 },
  'Ticket Created': { key: 'ticket-created', label: 'Ticket Created', cls: 'badge-ticket-created',color: '#1565C0', order: 1 },
  'In Planning':    { key: 'in-planning',    label: 'In Planning',    cls: 'badge-in-planning',   color: '#3D441E', order: 2 },
  'In Design':      { key: 'in-design',      label: 'In Design',      cls: 'badge-in-design',    color: '#7B1FA2', order: 3 },
  'In Development': { key: 'in-development', label: 'In Development', cls: 'badge-in-development',color: '#B6533E', order: 4 },
  'In QA':          { key: 'in-qa',          label: 'In QA',          cls: 'badge-in-qa',        color: '#00695C', order: 5 },
  'In UAT':         { key: 'in-uat',         label: 'In UAT',         cls: 'badge-in-uat',       color: '#3949AB', order: 6 },
  'In Production':  { key: 'in-production',  label: 'In Production',  cls: 'badge-in-production', color: '#3D441E', order: 7 }
};

const STATUS_ORDER = ['Identified', 'Ticket Created', 'In Planning', 'In Design', 'In Development', 'In QA', 'In UAT', 'In Production'];

const STATUS_KEYS = ['identified','ticket-created','in-planning','in-design','in-development','in-qa','in-uat','in-production'];

const STATUS_COLORS = {
  'identified':'#B0B0B0','ticket-created':'#90CAF9','in-planning':'#64B5F6',
  'in-design':'#42A5F5','in-development':'#2196F3','in-qa':'#1E88E5',
  'in-uat':'#1565C0','in-production':'#4CAF50'
};

const STATUS_LABELS = {
  'identified':'Identified','ticket-created':'Ticket Created','in-planning':'In Planning',
  'in-design':'In Design','in-development':'In Development','in-qa':'In QA',
  'in-uat':'In UAT','in-production':'In Production'
};

function getStatusInfo(status) {
  if (STATUSES[status]) return STATUSES[status];
  return STATUSES['Identified'];
}

// Map old bucket values to new status workflow
function mapBucketToStatus(bucket) {
  const b = (bucket || '').toLowerCase();
  if (b.includes('not addressing')) return 'Identified';
  if (b.includes('in progress')) return 'In Development';
  if (b.includes('addressed')) return 'In Production';
  if (b.includes('redesign')) return 'In Planning';
  if (b.includes('2027')) return 'Identified';
  if (b.includes('nls')) return 'In Planning';
  if (b.includes('gap')) return 'Identified';
  return 'Identified';
}

// Generate a unique key for a data item
function getItemKey(d) {
  return d.channel + '|' + d.guidelineId + '|' + (d.page || '') + '|' + (d.guideline || '').substring(0, 40);
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function impactColor(impact) {
  if (impact >= 3.0) return '#B6533E';   /* Earthen — highest impact */
  if (impact >= 2.5) return '#3D441E';   /* Ever Green — high impact */
  if (impact >= 2.0) return '#6B5440';   /* Warm Stone dark — medium impact */
  return '#888';
}

// === API Layer (replaces localStorage) ===
// All status overrides and history are stored in PostgreSQL via the REST API.

let _statusOverrides = {};
let _statusHistory = {};
let _apiReady = false;

// Cross-tab sync: notify other tabs when a status changes
const _broadcastChannel = (typeof BroadcastChannel !== 'undefined')
  ? new BroadcastChannel('baymard-status-sync')
  : null;

// Register a callback to be called when another tab changes a status
let _onStatusChangeExternal = null;
function onStatusChangeExternal(fn) {
  _onStatusChangeExternal = fn;
}

if (_broadcastChannel) {
  _broadcastChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'status-changed') {
      // Update local cache from the message
      if (event.data.itemKey && event.data.newStatus) {
        _statusOverrides[event.data.itemKey] = event.data.newStatus;
      }
      // Notify the page to re-render
      if (_onStatusChangeExternal) _onStatusChangeExternal(event.data);
    }
  };
}

// Fetch all status overrides from the API on page load
async function fetchStatusOverrides() {
  try {
    const resp = await fetch('/api/statuses?_t=' + Date.now());
    if (!resp.ok) throw new Error('Failed to fetch statuses');
    const data = await resp.json();
    // API returns an array of { item_key, status, updated_by, updated_at }
    // Convert to a plain object keyed by item_key for fast lookups
    _statusOverrides = {};
    if (Array.isArray(data)) {
      data.forEach(row => {
        if (row.item_key) _statusOverrides[row.item_key] = row.status;
      });
    }
    _apiReady = true;
  } catch (e) {
    console.warn('Could not fetch status overrides from API, using empty state:', e);
    _statusOverrides = {};
    _apiReady = false;
  }
  return _statusOverrides;
}

// Fetch history for a specific item
async function fetchHistory(itemKey) {
  try {
    const resp = await fetch('/api/history/' + encodeURIComponent(itemKey) + '?_t=' + Date.now());
    if (!resp.ok) throw new Error('Failed to fetch history');
    const data = await resp.json();
    _statusHistory[itemKey] = data || [];
    return data || [];
  } catch (e) {
    console.warn('Could not fetch history from API:', e);
    return [];
  }
}

// Save a status change via the API
async function saveStatusOverride(itemKey, newStatus, changedBy, oldStatus) {
  try {
    const body = { status: newStatus, changedBy: changedBy };
    if (oldStatus) body.oldStatus = oldStatus;
    const resp = await fetch('/api/statuses/' + encodeURIComponent(itemKey), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      const msg = errData.error || 'Failed to save status';
      throw new Error(msg);
    }
    const data = await resp.json();
    // Update local cache
    _statusOverrides[itemKey] = newStatus;
    if (data.history) {
      _statusHistory[itemKey] = data.history;
    }
    // Notify other tabs/windows that a status changed
    if (_broadcastChannel) {
      _broadcastChannel.postMessage({ type: 'status-changed', itemKey, newStatus, oldStatus });
    }
    return data;
  } catch (e) {
    console.error('Error saving status override:', e);
    throw e;
  }
}

// Synchronous accessors (use cached data from fetchStatusOverrides)
function getStatusOverrides() {
  return _statusOverrides;
}

function getStatusHistory() {
  return _statusHistory;
}

function getEffectiveStatus(d) {
  const overrides = getStatusOverrides();
  const key = getItemKey(d);
  if (overrides[key]) return overrides[key];
  return d.mappedStatus || 'Identified';
}

// Determine if an item is "done", "in progress", or "pending"
function getItemState(d) {
  const status = getEffectiveStatus(d);
  const key = getStatusInfo(status).key;
  if (key === 'in-production') return 'done';
  if (['in-development','in-qa','in-uat','in-design'].includes(key)) return 'in-progress';
  return 'pending';
}

// Initialize data with mapped statuses
function initData(DATA) {
  DATA.forEach(d => { d.mappedStatus = mapBucketToStatus(d.bucket); });
  return DATA;
}

// Fetch shared data from data.json
async function fetchData() {
  const resp = await fetch('/data.json?_t=' + Date.now());
  if (!resp.ok) throw new Error('Failed to fetch data.json');
  const data = await resp.json();
  return initData(data);
}
