#!/bin/bash
# Start script for Skull Dashboard
# Called by @reboot crontab entry
export STATE_DIR=/home/clawdbot/clawd/memory/state
export PORT=8084
cd /home/clawdbot/skull-dashboard
exec node server.js >> /home/clawdbot/clawd/logs/skull-dashboard.log 2>&1
