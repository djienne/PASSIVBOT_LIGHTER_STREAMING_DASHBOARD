#!/usr/bin/env bash
# Start backend (uvicorn) and frontend (vite) concurrently for local dev.
# Usage: bash scripts/run_dev.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Activate backend venv if present
if [ -f "backend/.venv/Scripts/python.exe" ]; then
  PY="backend/.venv/Scripts/python.exe"
elif [ -f "backend/.venv/bin/python" ]; then
  PY="backend/.venv/bin/python"
else
  echo "! backend/.venv not found — run: cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -e .[dev]"
  exit 1
fi

if [ ! -d "frontend/node_modules" ]; then
  echo "! frontend/node_modules not found — run: cd frontend && npm install"
  exit 1
fi

cleanup() {
  echo "stopping dev servers..."
  kill "$BACKEND_PID" 2>/dev/null || true
  kill "$FRONTEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "+ backend: uvicorn app.main:app on :8787"
(
  cd backend
  "../$PY" -m uvicorn app.main:app --host 127.0.0.1 --port 8787 --reload
) &
BACKEND_PID=$!

echo "+ frontend: vite on :5173"
(
  cd frontend
  npm run dev -- --host 127.0.0.1
) &
FRONTEND_PID=$!

wait "$BACKEND_PID" "$FRONTEND_PID"
