#!/usr/bin/env bash
# Phase 0 - VPS cache discovery.
# Inventories /home/ubuntu/passivbot_lighter/caches/ on the Lighter VPS.
# Output is captured to docs/DISCOVERY.raw.txt for hand-folding into docs/DISCOVERY.md.
#
# Requires: ssh + infos/lighter.pem + network path to your VPS host.
# Usage:   bash scripts/discover_cache.sh

set -euo pipefail

HOST="${VPS_HOST:-your-vps-host}"
USER_NAME="${VPS_USER:-ubuntu}"
KEY="${SSH_KEY_PATH:-infos/lighter.pem}"
REMOTE_DIR="${REMOTE_DIR:-/home/ubuntu/passivbot_lighter}"

SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=10)
SSH_TARGET="${USER_NAME}@${HOST}"

OUT_DIR="docs"
OUT_FILE="${OUT_DIR}/DISCOVERY.raw.txt"
mkdir -p "$OUT_DIR"

section() { printf '\n=== %s ===\n' "$1" | tee -a "$OUT_FILE"; }

: > "$OUT_FILE"

section "host + uptime"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" 'hostname && uptime && date -u +"server_utc=%Y-%m-%dT%H:%M:%SZ"' | tee -a "$OUT_FILE"

section "top-level remote dir"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "ls -la ${REMOTE_DIR}/" | tee -a "$OUT_FILE"

section "caches/ listing"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "ls -la ${REMOTE_DIR}/caches/ 2>/dev/null || echo '(no caches dir)'" | tee -a "$OUT_FILE"

section "caches/ tree (two levels)"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "find ${REMOTE_DIR}/caches -maxdepth 2 -type f -printf '%p %s %TY-%Tm-%TdT%TH:%TM:%TSZ\n' 2>/dev/null | sort" | tee -a "$OUT_FILE"

section "file types + sizes"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "find ${REMOTE_DIR}/caches -maxdepth 3 -type f 2>/dev/null | head -50 | while read f; do printf '%s\n  ' \"\$f\"; file -b \"\$f\"; done" | tee -a "$OUT_FILE"

section "sample heads (first 2 KB of each JSON-ish file)"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "find ${REMOTE_DIR}/caches -maxdepth 3 -type f \( -name '*.json' -o -name '*.jsonl' -o -name '*.ndjson' \) 2>/dev/null | head -20 | while read f; do echo \"--- \$f ---\"; head -c 2048 \"\$f\" 2>/dev/null; echo; echo; done" | tee -a "$OUT_FILE"

section "line counts for json/jsonl files"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "find ${REMOTE_DIR}/caches -maxdepth 3 -type f \( -name '*.json' -o -name '*.jsonl' -o -name '*.ndjson' \) 2>/dev/null | head -30 | xargs -I{} wc -l {}" | tee -a "$OUT_FILE"

section "update cadence (mtime drift over ~60s)"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "
  FILES=\$(find ${REMOTE_DIR}/caches -maxdepth 3 -type f 2>/dev/null | head -15)
  echo 'baseline at t=0'
  for f in \$FILES; do stat -c '%Y %n' \"\$f\"; done
  sleep 60
  echo 'at t=60'
  for f in \$FILES; do stat -c '%Y %n' \"\$f\"; done
" | tee -a "$OUT_FILE"

section "related non-cache dirs"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "ls -la ${REMOTE_DIR}/ | grep -E 'log|state|config|passivbot'" | tee -a "$OUT_FILE"

section "config files we might need"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "find ${REMOTE_DIR} -maxdepth 3 -type f \( -name '*.json' -o -name '*.hjson' -o -name '*.yaml' -o -name '*.toml' \) -not -path '*/caches/*' 2>/dev/null | head -20" | tee -a "$OUT_FILE"

section "running processes (to see bot process)"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "ps -ef | grep -E 'passiv|python' | grep -v grep" | tee -a "$OUT_FILE"

section "done"
printf 'Wrote %s\n' "$OUT_FILE"
