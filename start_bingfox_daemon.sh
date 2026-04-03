#!/bin/bash

# Bingfox Starter Script (Daemon Mode)
# This script starts the Bingfox server in the background.

echo "🚀 Starting Bingfox in the background..."

# Check if node_modules exists, if not, advise user
if [ ! -d "node_modules" ]; then
    echo "⚠️  Note: node_modules not found. Please run 'npm install' first."
    exit 1
fi

# Run the server using nohup to keep it running after closing the terminal
nohup node server.js > bingfox.log 2>&1 &

PID=$!
echo "✅ Bingfox is now running in the background!"
echo "📄 Logs: tail -f bingfox.log"
echo "🆔 PID: $PID"
echo "🛑 To stop: kill $PID"
