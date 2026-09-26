const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

async function waitForHealth(port) {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return res.json();
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('server did not become healthy');
}

test('synthetic preview supports reads, controlled writes, and persistence', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skull-preview-'));
  fs.cpSync(path.join(repoRoot, 'fixtures', 'state'), temp, { recursive: true });
  const port = 18084;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      STATE_DIR: temp,
      SAFE_WRITE_SCRIPT: path.join(repoRoot, 'scripts', 'safe-write-preview.js'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));

  const health = await waitForHealth(port);
  assert.equal(health.ok, true);
  assert.equal(health.state_dir, temp);

  let res = await fetch(`http://127.0.0.1:${port}/api/hot`);
  let hot = await res.json();
  assert.equal(hot.active_sprint, 'synthetic-preview');
  assert.equal(hot.top_tasks[0].status, 'pending');

  res = await fetch(`http://127.0.0.1:${port}/api/task/complete`, {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify({item:'Verify synthetic preview task'}),
  });
  assert.equal(res.status, 200);

  res = await fetch(`http://127.0.0.1:${port}/api/hot`);
  hot = await res.json();
  assert.equal(hot.top_tasks[0].status, 'done');

  const persisted = fs.readFileSync(path.join(temp, 'hot.yaml'), 'utf8');
  assert.match(persisted, /status: done/);

  res = await fetch(`http://127.0.0.1:${port}/api/commitment/complete`, {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify({what:'Prove isolated write persistence'}),
  });
  assert.equal(res.status, 200);

  const commitment = fs.readFileSync(path.join(temp, 'commitments.yaml'), 'utf8');
  assert.match(commitment, /status: done/);
});
