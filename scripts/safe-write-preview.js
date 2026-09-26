#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const [, , target, command] = process.argv;
if (!target || command !== 'write') {
  console.error('usage: safe-write-preview.js <target> write');
  process.exit(2);
}

const allowedRoot = path.resolve(process.env.STATE_DIR || path.join(__dirname, '..', 'fixtures', 'state'));
const resolvedTarget = path.resolve(target);
if (resolvedTarget !== allowedRoot && !resolvedTarget.startsWith(allowedRoot + path.sep)) {
  console.error('refusing write outside STATE_DIR');
  process.exit(3);
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  fs.mkdirSync(path.dirname(resolvedTarget), { recursive: true });
  const temp = resolvedTarget + '.tmp-' + process.pid;
  fs.writeFileSync(temp, input, 'utf8');
  fs.renameSync(temp, resolvedTarget);
});
