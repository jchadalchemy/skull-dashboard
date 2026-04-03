/**
 * Skull Dashboard 💀 — Frontend Logic
 * Fetches state from the API and renders all 8 cards.
 * Auto-refreshes every 30s by default.
 */

const REFRESH_INTERVAL = (window.REFRESH_INTERVAL || 30) * 1000;
let autoRefreshTimer = null;

// ──────────────────────────────────────────────
// Utility helpers
// ──────────────────────────────────────────────

function el(id) {
  return document.getElementById(id);
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format an ISO timestamp to a relative age string.
 * e.g. "2026-04-03T13:15Z" → "2h ago"
 */
function relativeAge(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d)) return '';
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  return `${diffD}d ago`;
}

/**
 * Format deadline countdown for commitments.
 * Returns { label, cls } where cls is 'overdue' | 'due-soon' | 'ok'
 */
function deadlineCountdown(deadlineStr) {
  if (!deadlineStr) return { label: 'no deadline', cls: 'ok' };
  const d = new Date(deadlineStr);
  if (isNaN(d)) return { label: esc(deadlineStr), cls: 'ok' };
  const diffMs = d.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 0) {
    const abs = Math.abs(diffMin);
    if (abs < 60) return { label: `${abs}m overdue`, cls: 'overdue' };
    const h = Math.round(abs / 60);
    if (h < 24) return { label: `${h}h overdue`, cls: 'overdue' };
    return { label: `${Math.round(h / 24)}d overdue`, cls: 'overdue' };
  }
  if (diffMin < 60) return { label: `due in ${diffMin}m`, cls: 'due-soon' };
  const h = Math.round(diffMin / 60);
  if (h < 24) return { label: `due in ${h}h`, cls: 'due-soon' };
  return { label: `due in ${Math.round(h / 24)}d`, cls: 'ok' };
}

/**
 * Detect task priority color from emoji prefix.
 */
function taskStatusClass(item, status) {
  if (typeof item === 'string') {
    if (item.startsWith('🔥')) return 'red';
    if (item.startsWith('🔴')) return 'red';
    if (item.startsWith('🟡')) return 'yellow';
    if (item.startsWith('🟢')) return 'green';
    if (item.startsWith('🔵')) return 'blue';
  }
  if (typeof status === 'string') {
    const s = status.toLowerCase();
    if (s.includes('overdue') || s.includes('critical')) return 'red';
    if (s.includes('blocked') || s.includes('starting') || s.includes('in_progress')) return 'yellow';
    if (s.includes('done') || s.includes('complete') || s.includes('live')) return 'green';
  }
  return 'gray';
}

function clientStatusClass(status) {
  if (!status) return 'gray';
  const s = status.toUpperCase();
  if (s.includes('LIVE')) return 'green';
  if (s.includes('SUSPENDED') || s.includes('BLOCKED')) return 'red';
  if (s.includes('PENDING') || s.includes('IN PROGRESS')) return 'yellow';
  return 'gray';
}

function decisionStatusIcon(status) {
  if (!status) return '<span class="warn-icon">⚠️</span>';
  const s = status.toLowerCase();
  if (s === 'active' || s === 'executed' || s === 'permanent') return '<span class="ok-icon">✅</span>';
  if (s === 'open' || s === 'not_started') return '<span class="warn-icon">⚠️</span>';
  if (s === 'in_progress') return '🔄';
  return '<span class="warn-icon">⚠️</span>';
}

function setCardStatus(cardId, status) {
  const card = el(cardId);
  if (card) card.setAttribute('data-status', status);
}

// ──────────────────────────────────────────────
// Fetch helpers
// ──────────────────────────────────────────────

async function fetchJSON(endpoint) {
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ──────────────────────────────────────────────
// Renderers
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// Interactive checkbox helpers
// ──────────────────────────────────────────────

/**
 * POST to an API endpoint and handle undo state.
 */
async function postAction(endpoint, body) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function renderTasks(data) {
  const tasks = data.top_tasks || [];
  el('tasks-count').textContent = tasks.length;

  if (!tasks.length) {
    el('tasks-body').innerHTML = '<span class="empty-state">No active tasks</span>';
    setCardStatus('card-tasks', 'ok');
    return;
  }

  // Check if any non-done are overdue/critical
  const activeTasks = tasks.filter(t => t.status !== 'done');
  const hasRed = activeTasks.some(t => taskStatusClass(t.item, t.status) === 'red');
  setCardStatus('card-tasks', activeTasks.length === 0 ? 'ok' : hasRed ? 'error' : 'warn');

  const container = document.createElement('div');
  container.className = 'task-list-container';

  tasks.forEach(t => {
    const isDone = t.status === 'done';
    const cls = taskStatusClass(t.item, t.status);
    const age = t.verified_at ? relativeAge(t.verified_at) : '';
    const statusLabel = t.status || '';
    const checkId = 'task-' + btoa(encodeURIComponent(t.item)).slice(0, 16);

    const div = document.createElement('div');
    div.className = 'task-item' + (isDone ? ' completed' : '');
    div.innerHTML = `
      <input type="checkbox" class="item-checkbox" id="${checkId}" ${isDone ? 'checked' : ''}>
      <div class="task-content">
        <label class="task-text" for="${checkId}" style="cursor:pointer">${esc(t.item)}</label>
        <div class="task-meta">
          ${(!isDone && statusLabel) ? `<span class="status-badge status-${cls}">${esc(statusLabel)}</span>` : ''}
          ${isDone ? '<span class="status-badge status-green">done</span>' : ''}
          ${age ? `<span class="age-chip">${age}</span>` : ''}
        </div>
      </div>
    `;

    const checkbox = div.querySelector('.item-checkbox');
    checkbox.addEventListener('change', async () => {
      try {
        await postAction('/api/task/complete', { item: t.item, undo: !checkbox.checked });
        div.classList.toggle('completed', checkbox.checked);
        // Soft re-sort: move to bottom if checked, to top if unchecked
        if (checkbox.checked) container.appendChild(div);
        else container.prepend(div);
      } catch (err) {
        console.error('Task update failed:', err);
        checkbox.checked = !checkbox.checked; // revert
        alert('Failed to update task: ' + err.message);
      }
    });

    container.appendChild(div);
  });

  el('tasks-body').innerHTML = '';
  el('tasks-body').appendChild(container);
}

function renderBlockers(data) {
  const blockers = data.blockers || [];
  el('blockers-count').textContent = blockers.length;

  if (!blockers.length) {
    el('blockers-body').innerHTML = '<span class="empty-state">No blockers 🎉</span>';
    setCardStatus('card-blockers', 'ok');
    return;
  }

  const activeBlockers = blockers.filter(b => b.status !== 'resolved');
  setCardStatus('card-blockers', activeBlockers.length === 0 ? 'ok' : 'warn');

  const container = document.createElement('div');
  container.className = 'task-list-container';

  blockers.forEach(b => {
    const isResolved = b.status === 'resolved';
    const age = b.verified_at ? relativeAge(b.verified_at) : '';
    const checkId = 'blocker-' + btoa(encodeURIComponent(b.item)).slice(0, 16);

    const div = document.createElement('div');
    div.className = 'blocker-item' + (isResolved ? ' resolved' : '');
    div.innerHTML = `
      <input type="checkbox" class="item-checkbox" id="${checkId}" ${isResolved ? 'checked' : ''}>
      <div class="blocker-content">
        <label class="blocker-text" for="${checkId}" style="cursor:pointer">${esc(b.item)}</label>
        <div class="blocker-owner">
          ${b.owner ? `👤 ${esc(b.owner)}` : ''}
          ${age ? `<span class="age-chip" style="margin-left:6px">${age}</span>` : ''}
          ${isResolved ? '<span class="age-chip" style="margin-left:6px;color:var(--green)">resolved</span>' : ''}
        </div>
      </div>
    `;

    const checkbox = div.querySelector('.item-checkbox');
    checkbox.addEventListener('change', async () => {
      try {
        await postAction('/api/blocker/resolve', { item: b.item, undo: !checkbox.checked });
        div.classList.toggle('resolved', checkbox.checked);
        if (checkbox.checked) container.appendChild(div);
        else container.prepend(div);
      } catch (err) {
        console.error('Blocker update failed:', err);
        checkbox.checked = !checkbox.checked;
        alert('Failed to update blocker: ' + err.message);
      }
    });

    container.appendChild(div);
  });

  el('blockers-body').innerHTML = '';
  el('blockers-body').appendChild(container);
}

function renderCommitments(commitData) {
  const commitments = commitData.commitments || [];
  el('commitments-count').textContent = commitments.length;

  if (!commitments.length) {
    el('commitments-body').innerHTML = '<span class="empty-state">No active commitments</span>';
    setCardStatus('card-commitments', 'ok');
    return;
  }

  let hasOverdue = false;
  const active = commitments.filter(c => c.status !== 'done');
  active.forEach(c => {
    const { cls } = deadlineCountdown(c.deadline || c.by);
    if (cls === 'overdue') hasOverdue = true;
  });

  const container = document.createElement('div');
  container.className = 'task-list-container';

  commitments.forEach(c => {
    const isDone = c.status === 'done';
    const { label, cls } = deadlineCountdown(c.deadline || c.by);
    const isOverdue = cls === 'overdue' && !isDone;
    const isDueSoon = cls === 'due-soon' && !isDone;

    const itemClass = isDone ? 'completed' : isOverdue ? 'overdue' : isDueSoon ? 'due-soon' : '';
    const what = c.what || c.item || JSON.stringify(c);
    const checkId = 'commit-' + btoa(encodeURIComponent(what)).slice(0, 16);

    const div = document.createElement('div');
    div.className = 'commitment-item ' + itemClass;
    div.innerHTML = `
      <input type="checkbox" class="item-checkbox" id="${checkId}" ${isDone ? 'checked' : ''}>
      <div class="commitment-content">
        <label class="commitment-what" for="${checkId}" style="cursor:pointer">${esc(what)}</label>
        <div class="commitment-meta">
          ${c.who ? `<span class="commitment-who">→ ${esc(c.who)}</span>` : ''}
          ${(c.deadline || c.by) && !isDone ? `<span class="commitment-deadline">${esc(c.deadline || c.by)}</span>` : ''}
          ${!isDone ? `<span class="commitment-countdown ${cls}">${label}</span>` : '<span class="commitment-countdown ok">done</span>'}
        </div>
      </div>
    `;

    const checkbox = div.querySelector('.item-checkbox');
    checkbox.addEventListener('change', async () => {
      try {
        await postAction('/api/commitment/complete', { what, undo: !checkbox.checked });
        div.classList.toggle('completed', checkbox.checked);
        if (checkbox.checked) container.appendChild(div);
        else container.prepend(div);
      } catch (err) {
        console.error('Commitment update failed:', err);
        checkbox.checked = !checkbox.checked;
        alert('Failed to update commitment: ' + err.message);
      }
    });

    container.appendChild(div);
  });

  el('commitments-body').innerHTML = '';
  el('commitments-body').appendChild(container);
  setCardStatus('card-commitments', hasOverdue ? 'error' : 'neutral');
}

function renderDecisions(decisionsData) {
  const decisions = (decisionsData.decisions || []).slice();

  // Sort: unexecuted first
  const order = { open: 0, not_started: 1, in_progress: 2, active: 3, permanent: 4, executed: 5 };
  decisions.sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99));

  el('decisions-count').textContent = decisions.length;

  if (!decisions.length) {
    el('decisions-body').innerHTML = '<span class="empty-state">No decisions logged</span>';
    setCardStatus('card-decisions', 'ok');
    return;
  }

  const hasUnexecuted = decisions.some(d => ['open', 'not_started'].includes(d.status));
  setCardStatus('card-decisions', hasUnexecuted ? 'warn' : 'neutral');

  el('decisions-body').innerHTML = decisions.map(d => {
    const icon = decisionStatusIcon(d.status);
    const age = d.date ? relativeAge(d.date + 'T00:00:00Z') : '';
    return `
      <div class="decision-item">
        <div class="decision-header">
          <span class="decision-icon">${icon}</span>
          <span class="decision-text">${esc(d.decision)}</span>
        </div>
        <div class="decision-meta">
          ${d.id ? `<span class="decision-id">#${esc(d.id)}</span>` : ''}
          ${d.status ? `<span class="status-badge status-gray">${esc(d.status)}</span>` : ''}
          ${age ? `<span class="age-chip">${age}</span>` : ''}
          ${d.note ? `<span style="color:var(--text-muted)">${esc(d.note)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderClients(data) {
  const clients = data.clients || {};
  const entries = Object.entries(clients);
  el('clients-count').textContent = entries.length;

  if (!entries.length) {
    el('clients-body').innerHTML = '<span class="empty-state">No client data</span>';
    setCardStatus('card-clients', 'neutral');
    return;
  }

  const hasSuspended = entries.some(([, v]) => v.status && v.status.toUpperCase().includes('SUSPENDED'));
  setCardStatus('card-clients', hasSuspended ? 'warn' : 'ok');

  el('clients-body').innerHTML = entries.map(([name, info]) => {
    const cls = clientStatusClass(info.status || '');
    const friendlyName = name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `
      <div class="client-item">
        <div>
          <div class="client-name">${esc(friendlyName)}</div>
          ${info.instance ? `<div class="client-instance">${esc(info.instance)}</div>` : ''}
        </div>
        <div>
          <div class="client-status status-badge status-${cls}">${esc((info.status || '').split('.')[0])}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderServices(data) {
  const summary = data.services_summary || {};
  const entries = Object.entries(summary).filter(([k]) => k !== 'verified_at');
  el('services-count').textContent = entries.length;

  if (!entries.length) {
    el('services-body').innerHTML = '<span class="empty-state">No service data</span>';
    setCardStatus('card-services', 'neutral');
    return;
  }

  const allGood = !JSON.stringify(summary).toLowerCase().includes('❌');
  setCardStatus('card-services', allGood ? 'ok' : 'error');

  el('services-body').innerHTML = entries.map(([key, val]) => {
    const label = key.replace(/_/g, ' ');
    const valStr = String(val);
    const valColor = valStr.includes('✅') ? 'var(--green)'
      : valStr.includes('❌') ? 'var(--red)'
      : valStr.includes('⚠️') ? 'var(--yellow)'
      : 'var(--text-primary)';
    return `
      <div class="service-row">
        <span class="service-name">${esc(label)}</span>
        <span class="service-value" style="color:${valColor}">${esc(valStr)}</span>
      </div>
    `;
  }).join('');

  if (summary.verified_at) {
    el('services-body').innerHTML += `<div style="margin-top:8px;font-size:11px;color:var(--text-muted);font-family:var(--mono)">verified ${relativeAge(summary.verified_at)}</div>`;
  }
}

function renderActivity(data) {
  const entries = data.entries || [];
  const total = data.total || 0;
  el('activity-count').textContent = `${entries.length}/${total}`;

  if (!entries.length) {
    el('activity-body').innerHTML = '<span class="empty-state">No activity entries</span>';
    setCardStatus('card-activity', 'neutral');
    return;
  }

  setCardStatus('card-activity', 'neutral');

  el('activity-body').innerHTML = entries.map(e => {
    const ts = e.ts ? new Date(e.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const age = e.ts ? relativeAge(e.ts) : '';
    return `
      <div class="activity-entry">
        <div class="activity-header">
          ${ts ? `<span class="activity-ts">${esc(ts)}</span>` : ''}
          ${e.source ? `<span class="activity-source">[${esc(e.source)}]</span>` : ''}
          ${age ? `<span class="age-chip">${age}</span>` : ''}
        </div>
        <div class="activity-action">${esc(e.action)}</div>
      </div>
    `;
  }).join('');
}

function renderFinancial(data) {
  const fin = data.financial || {};
  el('financial-count').textContent = '—';

  if (!Object.keys(fin).length) {
    el('financial-body').innerHTML = '<span class="empty-state">No financial data</span>';
    return;
  }

  // Determine color for bank balance
  const balance = parseFloat((fin.bank_balance || '0').replace(/[^0-9.]/g, ''));
  const balanceCls = balance < 200 ? 'low' : balance < 500 ? 'warning' : 'ok';

  const age = fin.verified_at ? relativeAge(fin.verified_at) : '';
  setCardStatus('card-financial', balance < 200 ? 'error' : balance < 500 ? 'warn' : 'neutral');

  el('financial-body').innerHTML = `
    <div class="financial-grid">
      <div class="financial-stat">
        <div class="financial-label">Bank Balance</div>
        <div class="financial-value ${balanceCls}">${esc(fin.bank_balance || '—')}</div>
      </div>
      <div class="financial-stat">
        <div class="financial-label">Burn Rate</div>
        <div class="financial-value">${esc(fin.burn_rate || '—')}</div>
      </div>
      <div class="financial-stat">
        <div class="financial-label">Runway</div>
        <div class="financial-value ${balanceCls}">${esc(fin.runway || '—')}</div>
      </div>
      <div class="financial-stat">
        <div class="financial-label">Revenue</div>
        <div class="financial-value">${esc(fin.revenue || '—')}</div>
      </div>
      ${fin.strategy ? `<div class="financial-note">${esc(fin.strategy)}</div>` : ''}
      ${age ? `<div class="financial-note" style="color:var(--text-muted)">verified ${age}</div>` : ''}
    </div>
  `;
}

function renderScheduleC(data) {
  const sc = data.schedule_c_status;
  if (!sc) {
    el('footer-schedule-c').innerHTML = '<span style="color:var(--text-muted)">No data</span>';
    return;
  }
  const statusColor = sc.status === 'blocked' ? 'var(--red)' : 'var(--green)';
  const deps = (sc.depends_on || []).map(d => `<li>${esc(d)}</li>`).join('');
  el('footer-schedule-c').innerHTML = `
    <span style="color:${statusColor};font-weight:600">${esc(sc.item)} — ${esc(sc.status)}</span>
    ${sc.note ? `<div style="color:var(--text-muted);font-size:11px;margin-top:4px">${esc(sc.note)}</div>` : ''}
    ${deps ? `<ul style="margin-top:4px;padding-left:16px;color:var(--text-muted);font-size:11px">${deps}</ul>` : ''}
  `;
}

// ──────────────────────────────────────────────
// Main refresh cycle
// ──────────────────────────────────────────────

async function refreshAll() {
  const start = Date.now();
  el('last-refresh').textContent = 'Refreshing…';

  try {
    const [hot, decisions, commitments, activity] = await Promise.all([
      fetchJSON('/api/hot'),
      fetchJSON('/api/decisions'),
      fetchJSON('/api/commitments'),
      fetchJSON('/api/activity?limit=20'),
    ]);

    // Sprint banner
    el('sprint-name').textContent = hot.active_sprint || 'Unknown';

    // Render all cards
    renderTasks(hot);
    renderBlockers(hot);
    renderClients(hot);
    renderServices(hot);
    renderFinancial(hot);
    renderScheduleC(hot);
    renderCommitments(commitments);
    renderDecisions(decisions);
    renderActivity(activity);

    const elapsed = Date.now() - start;
    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    el('last-refresh').textContent = `Updated ${now} (${elapsed}ms)`;

  } catch (err) {
    console.error('[skull-dashboard] Refresh error:', err);
    el('last-refresh').textContent = `Error: ${err.message}`;
  }
}

// ──────────────────────────────────────────────
// Auto-refresh control
// ──────────────────────────────────────────────

function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(refreshAll, REFRESH_INTERVAL);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const toggle = el('auto-refresh');
  toggle.addEventListener('change', () => {
    if (toggle.checked) startAutoRefresh();
    else stopAutoRefresh();
  });

  // Initial load
  refreshAll();
  startAutoRefresh();
});
