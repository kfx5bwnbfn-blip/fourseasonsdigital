/* === Progress Tracker Page — Page-Specific JS === */
/* Depends on: status.js (shared status logic + API) */

let DATA = [];
let currentChannel = '';
let currentTheme = '';
let filteredData = [];

// === KPIs ===
function renderKPIs() {
  const total = DATA.length;
  const inProd = DATA.filter(d => getStatusInfo(getEffectiveStatus(d)).key === 'in-production').length;
  const inDev = DATA.filter(d => {
    const k = getStatusInfo(getEffectiveStatus(d)).key;
    return ['in-development','in-qa','in-uat'].includes(k);
  }).length;
  const inDesign = DATA.filter(d => getStatusInfo(getEffectiveStatus(d)).key === 'in-design').length;
  const identified = DATA.filter(d => {
    const k = getStatusInfo(getEffectiveStatus(d)).key;
    return ['identified','ticket-created','in-planning'].includes(k);
  }).length;
  const web = DATA.filter(d => d.channel === 'WEB').length;
  const app = DATA.filter(d => d.channel === 'APP').length;
  const top10 = DATA.filter(d => d.top10 && d.top10.toLowerCase().includes('yes')).length;
  const pct = Math.round((inProd / total) * 100);

  document.getElementById('kpiRow').innerHTML = `
    <div class="kpi-card gold">
      <div class="kpi-label">Total Findings</div>
      <div class="kpi-value">${total}</div>
      <div class="kpi-sub">${web} Web &middot; ${app} App</div>
    </div>
    <div class="kpi-card success">
      <div class="kpi-label">In Production</div>
      <div class="kpi-value">${inProd}</div>
      <div class="kpi-sub">${pct}% of roadmap</div>
    </div>
    <div class="kpi-card warning">
      <div class="kpi-label">In Dev / QA / UAT</div>
      <div class="kpi-value">${inDev}</div>
      <div class="kpi-sub">Active workstreams</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Identified / Planning</div>
      <div class="kpi-value">${identified}</div>
      <div class="kpi-sub">Not yet in design</div>
    </div>
    <div class="kpi-card info">
      <div class="kpi-label">Top 10 Priority</div>
      <div class="kpi-value">${top10}</div>
      <div class="kpi-sub">Flagged critical</div>
    </div>
  `;

  document.getElementById('count-all').textContent = total;
  document.getElementById('count-WEB').textContent = web;
  document.getElementById('count-APP').textContent = app;
}

// === Progress Bar ===
function renderProgress() {
  const data = filteredData.length ? filteredData : DATA;
  const total = data.length;
  if (total === 0) {
    document.getElementById('progressBar').innerHTML = '';
    document.getElementById('progressLegend').innerHTML = '<div class="legend-item" style="color:var(--text-muted);">No items match current filters.</div>';
    return;
  }

  const statuses = {};
  data.forEach(d => {
    const s = getStatusInfo(getEffectiveStatus(d));
    statuses[s.key] = statuses[s.key] || { ...s, count: 0 };
    statuses[s.key].count++;
  });

  let barHtml = '';
  let legendHtml = '';
  STATUS_KEYS.forEach(key => {
    if (statuses[key]) {
      const pct = (statuses[key].count / total) * 100;
      barHtml += `<div class="progress-segment" style="flex:${pct};background:${STATUS_COLORS[key]};" title="${STATUS_LABELS[key]}: ${statuses[key].count}">${pct > 5 ? statuses[key].count : ''}</div>`;
      legendHtml += `<div class="legend-item"><span class="legend-dot" style="background:${STATUS_COLORS[key]};"></span>${STATUS_LABELS[key]} (${statuses[key].count})</div>`;
    }
  });
  document.getElementById('progressBar').innerHTML = barHtml;
  document.getElementById('progressLegend').innerHTML = legendHtml;
}

// === Filters ===
function populateFilters() {
  const themes = [...new Set(DATA.map(d => d.theme))].sort();
  const owners = [...new Set(DATA.map(d => d.owner).filter(Boolean))].sort();

  const themeCounts = {};
  DATA.forEach(d => { themeCounts[d.theme] = (themeCounts[d.theme] || 0) + 1; });
  let pillsHtml = `<button class="theme-pill active" onclick="setTheme('')" data-theme="">All Themes <span class="pill-count">${DATA.length}</span></button>`;
  themes.forEach(t => {
    pillsHtml += `<button class="theme-pill" onclick="setTheme('${escapeHtml(t)}')" data-theme="${escapeHtml(t)}">${escapeHtml(t)} <span class="pill-count">${themeCounts[t]}</span></button>`;
  });
  document.getElementById('themePills').innerHTML = pillsHtml;

  document.getElementById('filterStatus').innerHTML = '<option value="">All Statuses</option>' + STATUS_ORDER.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  document.getElementById('filterOwner').innerHTML = '<option value="">All Owners</option>' + owners.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
}

// === Filter Logic ===
function setTheme(theme) {
  currentTheme = theme;
  document.querySelectorAll('.theme-pill').forEach(p => p.classList.remove('active'));
  const target = document.querySelector(`.theme-pill[data-theme="${theme}"]`);
  if (target) target.classList.add('active');
  applyFilters();
}

function setChannel(ch) {
  currentChannel = ch;
  document.querySelectorAll('.channel-tab').forEach(t => t.classList.remove('active'));
  const idx = ch === '' ? 0 : (ch === 'WEB' ? 1 : 2);
  document.querySelectorAll('.channel-tab')[idx].classList.add('active');
  applyFilters();
}

function applyFilters() {
  const ft = currentTheme;
  const fs = document.getElementById('filterStatus').value;
  const fo = document.getElementById('filterOwner').value;
  const fsearch = document.getElementById('filterSearch').value.toLowerCase();

  filteredData = DATA.filter(d => {
    if (currentChannel && d.channel !== currentChannel) return false;
    if (ft && d.theme !== ft) return false;
    if (fs) {
      const effStatus = getEffectiveStatus(d);
      if (effStatus !== fs) return false;
    }
    if (fo && d.owner !== fo) return false;
    if (fsearch) {
      const hay = (d.suggestion + ' ' + d.theme + ' ' + d.page + ' ' + d.id).toLowerCase();
      if (!hay.includes(fsearch)) return false;
    }
    return true;
  });
  renderTable();
  renderProgress();
}

function resetFilters() {
  currentTheme = '';
  document.querySelectorAll('.theme-pill').forEach(p => p.classList.remove('active'));
  document.querySelector('.theme-pill[data-theme=""]').classList.add('active');
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterOwner').value = '';
  document.getElementById('filterSearch').value = '';
  applyFilters();
}

// === Table Rendering ===
function renderTable() {
  const sorted = [...filteredData].sort((a, b) => {
    const impDiff = (b.impact || 0) - (a.impact || 0);
    if (impDiff !== 0) return impDiff;
    return (b.priority || 0) - (a.priority || 0);
  });
  let html = '';
  sorted.forEach((d, i) => {
    const itemKey = getItemKey(d);
    const effectiveStatus = getEffectiveStatus(d);
    const s = getStatusInfo(effectiveStatus);
    const prio = d.priority || 0;
    const prioCls = 'prio-' + Math.min(prio, 9);
    const chCls = d.channel === 'WEB' ? 'ch-web' : 'ch-app';
    const platTags = (d.platforms || []).map(p => `<span class="platform-tag">${escapeHtml(p)}</span>`).join('');
    const tickets = [];
    if (d.productTicket) tickets.push(`<span class="ticket-link">${escapeHtml(d.productTicket)}</span>`);
    if (d.designTicket) tickets.push(`<span class="ticket-link">${escapeHtml(d.designTicket)}</span> (design)`);
    if (d.jira) tickets.push(`<span class="ticket-link">${escapeHtml(d.jira)}</span> (JIRA)`);

    html += `<tr onclick="toggleDetail(${i})" id="row-${i}">`;
    html += `<td class="priority-cell ${prioCls}">${prio}</td>`;
    html += `<td><span class="ch-badge ${chCls}">${d.channel}</span></td>`;
    html += `<td><span class="badge ${s.cls}">${s.label}</span></td>`;
    html += `<td style="font-size:0.82rem;color:var(--text-secondary);">${escapeHtml(d.theme)}</td>`;
    html += `<td style="font-size:0.82rem;">${escapeHtml(d.page)}</td>`;
    html += `<td class="guideline-id-cell" style="color:var(--accent-dark);">#${escapeHtml(d.guidelineId || d.id)}</td>`;
    html += `<td><div style="font-weight:600;line-height:1.35;">${escapeHtml(d.suggestion)}</div>`;
    if (d.epic) html += `<span style="font-size:0.7rem;color:var(--info);font-weight:600;">${escapeHtml(d.epic)}</span>`;
    if (d.top10 && d.top10.toLowerCase().includes('yes')) html += ` <span style="font-size:0.7rem;color:var(--gold);font-weight:600;">&#9733; TOP 10</span>`;
    html += `</td>`;
    html += `<td class="hide-mobile"><span class="badge ${s.cls}">${s.label}</span></td>`;
    html += `<td class="impact-cell"><span class="impact-badge" style="background:${impactColor(d.impact)}20;color:${impactColor(d.impact)};">${d.impact}</span></td>`;
    html += `<td><span class="effort-badge effort-${d.effort}">${d.effort}</span></td>`;
    html += `<td class="hide-mobile" style="font-size:0.82rem;">${escapeHtml(d.owner || '—')}</td>`;
    html += `<td class="hide-mobile" style="font-size:0.78rem;color:var(--text-secondary);">${escapeHtml(d.targetDate || '—')}</td>`;
    html += `</tr>`;

    // Detail row
    html += `<tr class="detail-row" id="detail-${i}"><td colspan="12">`;
    html += `<div class="detail-grid">`;
    html += `<div class="detail-section">`;
    html += `<h4>Current State</h4><p>${escapeHtml(d.currentFS || 'Not specified')}</p>`;
    html += `<h4>Recommendation</h4><p>${escapeHtml(d.recommendation || 'Not specified')}</p>`;
    html += `</div>`;
    html += `<div class="detail-section">`;
    html += `<h4>Action Plan</h4><p>${escapeHtml(d.whatToDo || 'Not specified')}</p>`;
    if (d.story) html += `<h4>Backlog Story</h4><p>${escapeHtml(d.story)}</p>`;
    if (d.note) html += `<h4>Notes</h4><p style="font-style:italic;">${escapeHtml(d.note)}</p>`;
    if (d.dependencies) html += `<h4>Dependencies</h4><p>${escapeHtml(d.dependencies)}</p>`;
    html += `</div></div>`;
    html += `<div class="detail-meta">`;
    html += `<div class="detail-meta-item"><span class="lbl">Guideline ID</span><span class="val">#${escapeHtml(d.guidelineId || d.id)}</span></div>`;
    html += `<div class="detail-meta-item"><span class="lbl">Bucket</span><span class="val">${s.label}</span></div>`;
    html += `<div class="detail-meta-item"><span class="lbl">Epic</span><span class="val">${escapeHtml(d.epic || '—')}</span></div>`;
    html += `<div class="detail-meta-item"><span class="lbl">Backlog Status</span><span class="val">${escapeHtml(d.backlogStatus || '—')}</span></div>`;
    html += `<div class="detail-meta-item"><span class="lbl">Owner</span><span class="val">${escapeHtml(d.owner || '—')}</span></div>`;
    html += `<div class="detail-meta-item"><span class="lbl">Target Date</span><span class="val">${escapeHtml(d.targetDate || 'TBD')}</span></div>`;
    html += `<div class="detail-meta-item"><span class="lbl">Effort</span><span class="val">${escapeHtml(d.effort)}</span></div>`;
    html += `<div class="detail-meta-item"><span class="lbl">Impact Score</span><span class="val">${d.impact}</span></div>`;
    if (tickets.length) html += `<div class="detail-meta-item"><span class="lbl">Tickets</span><span class="val">${tickets.join(' &middot; ')}</span></div>`;
    html += `<div class="detail-meta-item"><span class="lbl">Platforms</span><span class="val"><div class="platform-tags">${platTags}</div></span></div>`;
    html += `<div class="detail-meta-item"><span class="lbl">Competitor — Ritz</span><span class="val">${escapeHtml(d.ritz || '—')}</span></div>`;
    html += `<div class="detail-meta-item"><span class="lbl">Competitor — Aman</span><span class="val">${escapeHtml(d.aman || '—')}</span></div>`;
    html += `</div>`;

    // Status Editor
    const currentStatus = getEffectiveStatus(d);
    const currentStatusInfo = getStatusInfo(currentStatus);
    html += `<div class="status-editor-wrap">`;
    html += `<div class="status-editor-header">`;
    html += `<h4>Status Management</h4>`;
    html += `<button class="status-editor-btn" onclick="openStatusForm('${escapeHtml(itemKey)}', ${i})"><i data-lucide="pencil" style="width:14px;height:14px;"></i> Change Status</button>`;
    html += `<span class="status-current">Current: <span class="badge ${currentStatusInfo.cls}">${currentStatusInfo.label}</span></span>`;
    html += `</div>`;
    html += `<div class="status-form" id="status-form-${i}">`;
    html += `<div class="status-form-row">`;
    html += `<label>New Status</label>`;
    html += `<select id="status-select-${i}">`;
    STATUS_ORDER.forEach(st => {
      html += `<option value="${escapeHtml(st)}">${escapeHtml(st)}</option>`;
    });
    html += `</select>`;
    html += `</div>`;
    html += `<div class="status-form-row">`;
    html += `<label>Changed By <span style="color:var(--danger);">*</span> <span style="text-transform:none;letter-spacing:0;font-size:0.7rem;color:var(--text-muted);">(required for traceability)</span></label>`;
    html += `<input type="text" id="status-name-${i}" placeholder="Enter your name..." autocomplete="name">`;
    html += `</div>`;
    html += `<div class="status-form-error" id="status-error-${i}">Please enter your name to confirm the status change.</div>`;
    html += `<div class="status-form-actions">`;
    html += `<button class="btn-save" onclick="saveStatus('${escapeHtml(itemKey)}', ${i})">Save Status</button>`;
    html += `<button class="btn-cancel" onclick="closeStatusForm(${i})">Cancel</button>`;
    html += `</div>`;
    html += `</div>`;
    html += `<div class="change-history" id="change-history-${i}"></div>`;
    html += `</div>`;

    html += `</td></tr>`;
  });
  document.getElementById('tableBody').innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function toggleDetail(i) {
  const row = document.getElementById('row-' + i);
  const detail = document.getElementById('detail-' + i);
  row.classList.toggle('expanded');
  detail.classList.toggle('show');
  if (detail.classList.contains('show')) {
    renderChangeHistory(i);
  }
}

// === Status Editor ===
function openStatusForm(itemKey, i) {
  const form = document.getElementById('status-form-' + i);
  const sorted = getSortedData();
  const d = sorted[i];
  const currentStatus = d ? getEffectiveStatus(d) : 'Identified';
  const select = document.getElementById('status-select-' + i);
  select.value = currentStatus;
  form.classList.add('show');
  document.getElementById('status-name-' + i).focus();
}

function closeStatusForm(i) {
  const form = document.getElementById('status-form-' + i);
  form.classList.remove('show');
  document.getElementById('status-error-' + i).classList.remove('show');
  document.getElementById('status-name-' + i).classList.remove('required-empty');
}

function getSortedData() {
  return [...filteredData].sort((a, b) => {
    const impDiff = (b.impact || 0) - (a.impact || 0);
    if (impDiff !== 0) return impDiff;
    return (b.priority || 0) - (a.priority || 0);
  });
}

async function saveStatus(itemKey, i) {
  const nameInput = document.getElementById('status-name-' + i);
  const name = nameInput.value.trim();
  const errorEl = document.getElementById('status-error-' + i);

  if (!name) {
    nameInput.classList.add('required-empty');
    errorEl.classList.add('show');
    nameInput.focus();
    return;
  }

  const newStatus = document.getElementById('status-select-' + i).value;
  const sorted = getSortedData();
  const d = sorted[i];
  const oldStatus = d ? getEffectiveStatus(d) : 'Identified';
  const oldInfo = getStatusInfo(oldStatus);
  const newInfo = getStatusInfo(newStatus);

  // Save via API
  try {
    await saveStatusOverride(itemKey, newStatus, name, oldStatus);
  } catch (e) {
    errorEl.textContent = 'Error saving status. Please try again.';
    errorEl.classList.add('show');
    return;
  }

  closeStatusForm(i);

  // Update the current status display
  const statusCurrent = document.querySelector('#detail-' + i + ' .status-current');
  if (statusCurrent) {
    statusCurrent.innerHTML = 'Current: <span class="badge ' + newInfo.cls + '">' + newInfo.label + '</span>';
  }

  // Update the bucket column and status column in the table row
  const bucketCell = document.querySelector('#row-' + i + ' td:nth-child(3)');
  if (bucketCell) bucketCell.innerHTML = '<span class="badge ' + newInfo.cls + '">' + newInfo.label + '</span>';
  const statusCell = document.querySelector('#row-' + i + ' td.hide-mobile');
  if (statusCell) statusCell.innerHTML = '<span class="badge ' + newInfo.cls + '">' + newInfo.label + '</span>';

  renderChangeHistory(i);
  refreshGlobalStats();
}

async function renderChangeHistory(i) {
  const sorted = getSortedData();
  const d = sorted[i];
  if (!d) return;
  const itemKey = getItemKey(d);

  const container = document.getElementById('change-history-' + i);
  if (!container) return;

  // Fetch history from API
  let entries = _statusHistory[itemKey] || [];
  if (entries.length === 0) {
    entries = await fetchHistory(itemKey);
  }

  if (entries.length === 0) {
    container.innerHTML = '<div class="change-history-title"><i data-lucide="history" style="width:12px;height:12px;"></i> Change History</div><div class="change-history-empty">No status changes recorded yet.</div>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  let html = '<div class="change-history-title"><i data-lucide="history" style="width:12px;height:12px;"></i> Change History</div>';
  html += '<div class="change-history-list">';
  [...entries].reverse().forEach(entry => {
    const date = new Date(entry.date);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    html += '<div class="change-history-item">';
    html += '<span class="ch-from">' + escapeHtml(entry.from) + '</span>';
    html += '<span class="ch-arrow">&rarr;</span>';
    html += '<span class="ch-to">' + escapeHtml(entry.to) + '</span>';
    html += '<span class="ch-by">by ' + escapeHtml(entry.by) + '</span>';
    html += '<span class="ch-date">' + dateStr + '</span>';
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function refreshGlobalStats() {
  renderKPIs();
  renderProgress();
}

// === Timeline View ===
function renderTimeline() {
  const channelData = currentChannel ? DATA.filter(d => d.channel === currentChannel) : DATA;
  const quarters = { 'End of Q4 2026': [], 'End of Q2 2027': [], 'End of Q3 2027': [], 'End of Q4 2027': [], 'Other / TBD': [] };
  channelData.forEach(d => {
    const td = d.targetDate || '';
    if (td.includes('Q4 2026') || td.toLowerCase().includes('live') || td.toLowerCase().includes('test')) quarters['End of Q4 2026'].push(d);
    else if (td.includes('Q2 2027')) quarters['End of Q2 2027'].push(d);
    else if (td.includes('Q3 2027')) quarters['End of Q3 2027'].push(d);
    else if (td.includes('Q4 2027')) quarters['End of Q4 2027'].push(d);
    else quarters['Other / TBD'].push(d);
  });

  const order = ['End of Q4 2026', 'End of Q2 2027', 'End of Q3 2027', 'End of Q4 2027', 'Other / TBD'];
  let html = '';
  order.forEach(q => {
    if (quarters[q].length === 0) return;
    const sorted = quarters[q].sort((a,b) => (b.impact||0) - (a.impact||0));
    html += `<div class="timeline-q">`;
    html += `<div class="timeline-q-header"><span class="q-badge">${q}</span> <span style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:0.82rem;color:var(--text-muted);">${sorted.length} items</span></div>`;
    html += `<div class="timeline-items">`;
    sorted.forEach(d => {
      const s = getStatusInfo(getEffectiveStatus(d));
      const chCls = d.channel === 'WEB' ? 'ch-web' : 'ch-app';
      html += `<div class="timeline-item" style="border-left-color:${s.color};">`;
      html += `<div class="ti-top"><span class="ch-badge ${chCls}">${d.channel}</span><span class="badge ${s.cls}">${s.label}</span></div>`;
      html += `<div class="ti-title">#${escapeHtml(d.guidelineId || d.id)} ${escapeHtml(d.suggestion)}</div>`;
      html += `<div class="ti-meta">${escapeHtml(d.theme)} &middot; ${escapeHtml(d.page)} &middot; Owner: ${escapeHtml(d.owner || 'TBD')} &middot; Impact: ${d.impact}</div>`;
      html += `</div>`;
    });
    html += `</div></div>`;
  });
  document.getElementById('timelineView').innerHTML = html;
}

// === Theme View ===
function renderTheme() {
  const channelData = currentChannel ? DATA.filter(d => d.channel === currentChannel) : DATA;
  const themes = {};
  channelData.forEach(d => { themes[d.theme] = themes[d.theme] || []; themes[d.theme].push(d); });
  let html = '';
  Object.keys(themes).sort().forEach(theme => {
    const items = themes[theme].sort((a,b) => (b.impact||0) - (a.impact||0));
    html += `<div class="theme-group">`;
    html += `<div class="theme-header">${escapeHtml(theme)} <span class="count">${items.length}</span></div>`;
    html += `<div class="table-wrapper"><table><thead><tr><th style="width:36px;">P</th><th style="width:60px;">Channel</th><th style="width:110px;">Bucket</th><th>Page / Element</th><th style="width:70px;">Guideline ID</th><th>Finding</th><th style="width:90px;">Status</th><th style="width:55px;">Impact</th><th style="width:90px;">Owner</th></tr></thead><tbody>`;
    items.forEach(d => {
      const s = getStatusInfo(getEffectiveStatus(d));
      const chCls = d.channel === 'WEB' ? 'ch-web' : 'ch-app';
      html += `<tr><td class="priority-cell prio-${Math.min(d.priority||0,9)}">${d.priority||0}</td>`;
      html += `<td><span class="ch-badge ${chCls}">${d.channel}</span></td>`;
      html += `<td><span class="badge ${s.cls}">${s.label}</span></td>`;
      html += `<td style="font-size:0.82rem;">${escapeHtml(d.page)}</td>`;
      html += `<td class="guideline-id-cell" style="color:var(--accent-dark);">#${escapeHtml(d.guidelineId || d.id)}</td>`;
      html += `<td style="font-size:0.85rem;">${escapeHtml(d.suggestion)}</td>`;
      html += `<td><span class="badge ${s.cls}">${s.label}</span></td>`;
      html += `<td class="impact-cell"><span class="impact-badge" style="background:${impactColor(d.impact)}20;color:${impactColor(d.impact)};">${d.impact}</span></td>`;
      html += `<td style="font-size:0.82rem;">${escapeHtml(d.owner || '—')}</td>`;
      html += `</tr>`;
    });
    html += `</tbody></table></div></div>`;
  });
  document.getElementById('themeView').innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// === View Tabs ===
function switchViewTab(ev, tab) {
  document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.view-tab-content').forEach(c => c.classList.remove('active'));
  ev.target.closest('.view-tab').classList.add('active');
  document.getElementById('vtab-' + tab).classList.add('active');
  if (tab === 'timeline') renderTimeline();
  if (tab === 'theme') renderTheme();
}

// === Init ===
async function init() {
  try {
    DATA = await fetchData();
  } catch (e) {
    console.error('Failed to load data:', e);
    document.getElementById('tableBody').innerHTML = '<tr><td colspan="12" style="color:var(--danger);padding:2rem;">Failed to load data. Please ensure the server is running.</td></tr>';
    return;
  }

  await fetchStatusOverrides();

  filteredData = [...DATA];
  renderKPIs();
  renderProgress();
  populateFilters();
  renderTable();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

init();
