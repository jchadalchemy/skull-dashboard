/**
 * Skull Dashboard — API Server 💀
 * Reads YAML state files and serves them to the dashboard frontend.
 */

const express = require('express');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8084;
const STATE_DIR = process.env.STATE_DIR || '/home/clawdbot/clawd/memory/state';

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

// CORS for local dev
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
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
