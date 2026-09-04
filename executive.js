/* === Executive Summary Page — Page-Specific JS === */
/* Depends on: status.js (shared status logic + API) */

let DATA = [];

// === Render Summary KPIs ===
function renderSummary() {
  const total = DATA.length;
  const done = DATA.filter(d => getItemState(d) === 'done').length;
  const inProgress = DATA.filter(d => getItemState(d) === 'in-progress').length;
  const pending = DATA.filter(d => getItemState(d) === 'pending').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const webTotal = DATA.filter(d => d.channel === 'WEB').length;
  const webDone = DATA.filter(d => d.channel === 'WEB' && getItemState(d) === 'done').length;
  const appTotal = DATA.filter(d => d.channel === 'APP').length;
  const appDone = DATA.filter(d => d.channel === 'APP' && getItemState(d) === 'done').length;

  document.getElementById('summaryRow').innerHTML = `
    <div class="summary-card green">
      <div class="s-label">Findings Addressed</div>
      <div class="s-value">${done}/${total}</div>
      <div class="s-sub">${pct}% of all findings closed</div>
    </div>
    <div class="summary-card blue">
      <div class="s-label">In Progress</div>
      <div class="s-value">${inProgress}</div>
      <div class="s-sub">In design, development, QA, or UAT</div>
    </div>
    <div class="summary-card grey">
      <div class="s-label">Not Yet Started</div>
      <div class="s-value">${pending}</div>
      <div class="s-sub">Identified or ticket created</div>
    </div>
    <div class="summary-card">
      <div class="s-label">Website Progress</div>
      <div class="s-value">${webDone}/${webTotal}</div>
      <div class="s-sub">${webTotal > 0 ? Math.round(webDone/webTotal*100) : 0}% addressed</div>
    </div>
    <div class="summary-card">
      <div class="s-label">Mobile App Progress</div>
      <div class="s-value">${appDone}/${appTotal}</div>
      <div class="s-sub">${appTotal > 0 ? Math.round(appDone/appTotal*100) : 0}% addressed</div>
    </div>
  `;
}

// === Render Overall Progress Bar ===
function renderProgressBar() {
  const statuses = {};
  STATUS_KEYS.forEach(k => statuses[k] = { count: 0, label: STATUS_LABELS[k], color: STATUS_COLORS[k] });
  DATA.forEach(d => {
    const k = getStatusInfo(getEffectiveStatus(d)).key;
    if (statuses[k]) statuses[k].count++;
  });

  const total = DATA.length;
  let barHtml = '';
  let legendHtml = '';
  STATUS_KEYS.forEach(key => {
    const s = statuses[key];
    if (s.count > 0) {
      const pct = (s.count / total) * 100;
      barHtml += '<div class="progress-segment" style="flex:' + pct + ';background:' + s.color + ';" title="' + s.label + ': ' + s.count + '">' + (pct > 5 ? s.count : '') + '</div>';
    }
    legendHtml += '<div class="legend-item"><span class="legend-dot" style="background:' + s.color + ';"></span>' + s.label + ' (' + s.count + ')</div>';
  });
  document.getElementById('progressBar').innerHTML = barHtml;
  document.getElementById('progressLegend').innerHTML = legendHtml;
}

// === Render Channel Sections ===
function renderChannels() {
  const channels = [
    { key: 'WEB', label: 'Website', icon: '🌐' },
    { key: 'APP', label: 'Mobile App', icon: '📱' }
  ];

  let html = '';
  channels.forEach(ch => {
    const items = DATA.filter(d => d.channel === ch.key);
    const done = items.filter(d => getItemState(d) === 'done').length;
    const inProgress = items.filter(d => getItemState(d) === 'in-progress').length;
    const pending = items.filter(d => getItemState(d) === 'pending').length;
    const pct = items.length > 0 ? Math.round((done / items.length) * 100) : 0;

    // Group by bucket
    const buckets = {};
    items.forEach(d => {
      const b = d.bucket || 'Uncategorized';
      if (!buckets[b]) buckets[b] = [];
      buckets[b].push(d);
    });

    // Sort buckets: Addressed first, then by count descending
    const bucketOrder = Object.keys(buckets).sort((a, b) => {
      const aDone = buckets[a].filter(d => getItemState(d) === 'done').length;
      const bDone = buckets[b].filter(d => getItemState(d) === 'done').length;
      return bDone - aDone || buckets[b].length - buckets[a].length;
    });

    html += '<div class="channel-section">';
    html += '<div class="channel-header">';
    html += '<h2>' + ch.label + '</h2>';
    html += '<span class="channel-badge">' + items.length + ' findings</span>';
    html += '<div class="channel-stats">';
    html += '<div class="channel-stat"><span class="num">' + done + '</span> done</div>';
    html += '<div class="channel-stat"><span class="num">' + inProgress + '</span> in progress</div>';
    html += '<div class="channel-stat"><span class="num">' + pending + '</span> pending</div>';
    html += '<div class="channel-stat"><span class="num">' + pct + '%</span> complete</div>';
    html += '</div>';
    html += '</div>';

    html += '<div class="bucket-grid">';
    bucketOrder.forEach(bucketName => {
      const bucketItems = buckets[bucketName];
      const bucketDone = bucketItems.filter(d => getItemState(d) === 'done').length;

      html += '<div class="bucket-col">';
      html += '<div class="bucket-col-header">';
      html += '<h3>' + escapeHtml(bucketName) + '</h3>';
      html += '<span class="bucket-count">' + bucketDone + '/' + bucketItems.length + ' done</span>';
      html += '</div>';
      html += '<div class="bucket-items">';
      bucketItems.forEach(d => {
        const state = getItemState(d);
        const iconClass = state;
        const icon = state === 'done' ? '✓' : state === 'in-progress' ? '◐' : '○';
        const gid = d.guidelineId || '';
        const guidelineText = d.guideline || d.suggestion || '';
        const cleanGuideline = guidelineText.replace(/^#\d+\s*/, '');
        const theme = d.theme || '';

        html += '<div class="bucket-item">';
        html += '<div class="item-status-icon ' + iconClass + '">' + icon + '</div>';
        html += '<div class="item-content">';
        html += '<div class="item-guideline"><span class="gid">#' + escapeHtml(gid) + '</span> ' + escapeHtml(cleanGuideline) + '</div>';
        if (theme) html += '<div class="item-meta">' + escapeHtml(theme) + '</div>';
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';
      html += '</div>';
    });
    html += '</div>'; // bucket-grid
    html += '</div>'; // channel-section
  });

  document.getElementById('channelSections').innerHTML = html;
}

// === Init ===
async function init() {
  document.getElementById('lastUpdated').textContent = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Fetch data and status overrides in parallel
  try {
    DATA = await fetchData();
  } catch (e) {
    console.error('Failed to load data:', e);
    document.getElementById('channelSections').innerHTML = '<p style="color:var(--danger);">Failed to load data. Please ensure the server is running.</p>';
    return;
  }

  await fetchStatusOverrides();

  renderSummary();
  renderProgressBar();
  renderChannels();

  // === Cross-tab sync: re-render when another tab changes a status ===
  if (typeof onStatusChangeExternal === 'function') {
    onStatusChangeExternal(function(data) {
      renderSummary();
      renderProgressBar();
      renderChannels();
    });
  }

  // Refresh from API when the page becomes visible again (e.g. switching tabs)
  document.addEventListener('visibilitychange', async function() {
    if (!document.hidden) {
      await fetchStatusOverrides();
      renderSummary();
      renderProgressBar();
      renderChannels();
    }
  });

  // Periodic poll as a fallback (every 30 seconds)
  setInterval(async function() {
    if (document.hidden) return;
    await fetchStatusOverrides();
    renderSummary();
    renderProgressBar();
    renderChannels();
  }, 30000);
}

init();
