#!/bin/bash
export STATE_DIR=/home/clawdbot/clawd/memory/state
node /home/clawdbot/skull-dashboard/server.js &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"
sleep 2

echo ""
echo "=== GET /api/health ==="
curl -s http://localhost:8084/api/health | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('ok:', j.ok, '| files:', Object.keys(j.files).join(', '))"

echo ""
echo "=== GET /api/hot ==="
curl -s http://localhost:8084/api/hot | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('sprint:', j.active_sprint); console.log('tasks:', (j.top_tasks||[]).length, '| blockers:', (j.blockers||[]).length, '| clients:', Object.keys(j.clients||{}).length)"

echo ""
echo "=== GET /api/decisions ==="
curl -s http://localhost:8084/api/decisions | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('decisions:', (j.decisions||[]).length)"

echo ""
echo "=== GET /api/commitments ==="
curl -s http://localhost:8084/api/commitments | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('commitments:', (j.commitments||[]).length)"

echo ""
echo "=== GET /api/activity ==="
curl -s "http://localhost:8084/api/activity?limit=5" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('entries returned:', (j.entries||[]).length, '| total:', j.total)"

echo ""
echo "=== GET /api/services ==="
curl -s http://localhost:8084/api/services | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('top-level keys:', Object.keys(j).slice(0,5).join(', '))"

echo ""
echo "Killing server PID $SERVER_PID"
kill $SERVER_PID 2>/dev/null
echo "Done."
