/**
 * Skull Dashboard — API Server 💀
 * Reads YAML state files and serves them to the dashboard frontend.
 */

const express = require('express');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8084;
const STATE_DIR = process.env.STATE_DIR || '/home/clawdbot/clawd/memory/state';
const SAFE_WRITE_SCRIPT = process.env.SAFE_WRITE_SCRIPT || '/home/clawdbot/clawd/scripts/safe-write.js';

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

// Parse JSON bodies
app.use(express.json());

// CORS for local dev
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/**
 * Safely read and parse a YAML file. Returns null on error.
 */
function readYaml(filename) {
  const filepath = path.join(STATE_DIR, filename);
  try {
    const raw = fs.readFileSync(filepath, 'utf8');
    return yaml.load(raw);
  } catch (err) {
    console.error(`[skull-dashboard] Failed to read ${filename}:`, err.message);
    return null;
  }
}

/**
 * Safely write a data object back to a YAML state file using safe-write.js (flock-based locking).
 * Returns true on success, false on failure.
 */
function writeYaml(filename, data) {
  const filepath = path.join(STATE_DIR, filename);
  const content = yaml.dump(data, { lineWidth: -1, noRefs: true });
  try {
    execSync(`node "${SAFE_WRITE_SCRIPT}" "${filepath}" write`, {
      input: content,
      encoding: 'utf8',
      timeout: 15000,
    });
    return true;
  } catch (err) {
    console.error(`[skull-dashboard] Failed to write ${filename}:`, err.message);
    return false;
  }
}

/**
 * GET /api/hot
 * Returns parsed hot.yaml — tasks, blockers, clients, services summary, financial
 */
app.get('/api/hot', (req, res) => {
  const data = readYaml('hot.yaml');
  if (!data) return res.status(500).json({ error: 'Failed to read hot.yaml' });
  res.json(data);
});

/**
 * GET /api/decisions
 * Returns parsed decisions.yaml
 */
app.get('/api/decisions', (req, res) => {
  const data = readYaml('decisions.yaml');
  if (!data) return res.status(500).json({ error: 'Failed to read decisions.yaml' });
  res.json(data);
});

/**
 * GET /api/commitments
 * Returns parsed commitments.yaml
 */
app.get('/api/commitments', (req, res) => {
  const data = readYaml('commitments.yaml');
  if (!data) return res.status(500).json({ error: 'Failed to read commitments.yaml' });
  res.json(data);
});

/**
 * GET /api/activity
 * Returns last N entries from activity-feed.yaml (default 20), reversed
 */
app.get('/api/activity', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const filepath = path.join(STATE_DIR, 'activity-feed.yaml');
  try {
    const raw = fs.readFileSync(filepath, 'utf8');
    // activity-feed.yaml is a YAML stream (array at root or multi-doc)
    let entries = [];
    // Try loading as array first
    const parsed = yaml.load(raw);
    if (Array.isArray(parsed)) {
      entries = parsed;
    } else if (parsed && Array.isArray(parsed.entries)) {
      entries = parsed.entries;
    } else {
      // Try loadAll for multi-document YAML
      yaml.loadAll(raw, (doc) => {
        if (Array.isArray(doc)) entries = entries.concat(doc);
        else if (doc) entries.push(doc);
      });
    }
    // Reverse and limit
    const recent = [...entries].reverse().slice(0, limit);
    res.json({ entries: recent, total: entries.length });
  } catch (err) {
    console.error('[skull-dashboard] Failed to read activity-feed.yaml:', err.message);
    res.status(500).json({ error: 'Failed to read activity-feed.yaml', detail: err.message });
  }
});

/**
 * GET /api/services
 * Returns parsed services.yaml
 */
app.get('/api/services', (req, res) => {
  const data = readYaml('services.yaml');
  if (!data) return res.status(500).json({ error: 'Failed to read services.yaml' });
  res.json(data);
});

/**
 * POST /api/task/complete
 * Body: { item: string, undo: boolean }
 * Marks a top_tasks entry as done (or undoes it). Writes to hot.yaml via safe-write.js.
 */
app.post('/api/task/complete', (req, res) => {
  const { item, undo } = req.body || {};
  if (!item) return res.status(400).json({ error: 'item is required' });

  const data = readYaml('hot.yaml');
  if (!data) return res.status(500).json({ error: 'Failed to read hot.yaml' });

  const tasks = data.top_tasks || [];
  const task = tasks.find(t => t.item === item);
  if (!task) return res.status(404).json({ error: 'Task not found', item });

  if (undo) {
    task.status = task._original_status !== undefined ? task._original_status : 'pending';
    delete task._original_status;
    delete task.completed_at;
  } else {
    if (task._original_status === undefined) {
      task._original_status = task.status;
    }
    task.status = 'done';
    task.completed_at = new Date().toISOString();
  }

  if (!writeYaml('hot.yaml', data)) {
    return res.status(500).json({ error: 'Failed to write hot.yaml' });
  }
  console.log(`[skull-dashboard] Task ${undo ? 'undone' : 'completed'}: ${item.slice(0, 60)}`);
  res.json({ ok: true, undo: !!undo });
});

/**
 * POST /api/blocker/resolve
 * Body: { item: string, undo: boolean }
 * Marks a blocker as resolved (or undoes it). Writes to hot.yaml via safe-write.js.
 */
app.post('/api/blocker/resolve', (req, res) => {
  const { item, undo } = req.body || {};
  if (!item) return res.status(400).json({ error: 'item is required' });

  const data = readYaml('hot.yaml');
  if (!data) return res.status(500).json({ error: 'Failed to read hot.yaml' });

  const blockers = data.blockers || [];
  const blocker = blockers.find(b => b.item === item);
  if (!blocker) return res.status(404).json({ error: 'Blocker not found', item });

  if (undo) {
    blocker.status = blocker._original_status !== undefined ? blocker._original_status : 'open';
    delete blocker._original_status;
    delete blocker.resolved_at;
  } else {
    if (blocker._original_status === undefined) {
      blocker._original_status = blocker.status;
    }
    blocker.status = 'resolved';
    blocker.resolved_at = new Date().toISOString();
  }

  if (!writeYaml('hot.yaml', data)) {
    return res.status(500).json({ error: 'Failed to write hot.yaml' });
  }
  console.log(`[skull-dashboard] Blocker ${undo ? 'unresolved' : 'resolved'}: ${item.slice(0, 60)}`);
  res.json({ ok: true, undo: !!undo });
});

/**
 * POST /api/commitment/complete
 * Body: { what: string, undo: boolean }
 * Marks a commitment as done (or undoes it). Writes to commitments.yaml via safe-write.js.
 */
app.post('/api/commitment/complete', (req, res) => {
  const { what, undo } = req.body || {};
  if (!what) return res.status(400).json({ error: 'what is required' });

  const data = readYaml('commitments.yaml');
  if (!data) return res.status(500).json({ error: 'Failed to read commitments.yaml' });

  const commitments = data.commitments || [];
  // Match on what or item field
  const commitment = commitments.find(c => (c.what || c.item) === what);
  if (!commitment) return res.status(404).json({ error: 'Commitment not found', what });

  if (undo) {
    commitment.status = commitment._original_status !== undefined ? commitment._original_status : 'pending';
    delete commitment._original_status;
    delete commitment.completed_at;
  } else {
    if (commitment._original_status === undefined) {
      commitment._original_status = commitment.status;
    }
    commitment.status = 'done';
    commitment.completed_at = new Date().toISOString();
  }

  if (!writeYaml('commitments.yaml', data)) {
    return res.status(500).json({ error: 'Failed to write commitments.yaml' });
  }
  console.log(`[skull-dashboard] Commitment ${undo ? 'undone' : 'completed'}: ${what.slice(0, 60)}`);
  res.json({ ok: true, undo: !!undo });
});

/**
 * GET /api/health
 * Quick health check — verifies all state files are readable
 */
app.get('/api/health', (req, res) => {
  const files = ['hot.yaml', 'decisions.yaml', 'commitments.yaml', 'activity-feed.yaml', 'services.yaml'];
  const results = {};
  let allOk = true;

  for (const file of files) {
    const filepath = path.join(STATE_DIR, file);
    try {
      const stat = fs.statSync(filepath);
      results[file] = {
        ok: true,
        size: stat.size,
        modified: stat.mtime.toISOString(),
      };
    } catch (err) {
      results[file] = { ok: false, error: err.message };
      allOk = false;
    }
  }

  res.status(allOk ? 200 : 207).json({
    ok: allOk,
    state_dir: STATE_DIR,
    files: results,
    server_time: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`💀 Skull Dashboard running on http://localhost:${PORT}`);
  console.log(`   State dir: ${STATE_DIR}`);
});
