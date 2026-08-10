#!/usr/bin/env bash
#
# Jaryan — local runner (no Docker).
#
#   ./run.sh              install if needed, then start backend + frontend
#   ./run.sh setup        install dependencies, migrate and seed, then exit
#   ./run.sh backend      run only the Django backend (foreground)
#   ./run.sh frontend     run only the React dev server (foreground)
#   ./run.sh seed         re-seed the database (destructive: --reset)
#   ./run.sh celery       run the Celery worker + beat (needs Redis)
#   ./run.sh status       report which optional services are reachable
#   ./run.sh clean        remove venv, node_modules and db.sqlite3
#
# Backend  → http://127.0.0.1:8000   (admin panel at /admin/)
# Frontend → http://localhost:3000
# Login    → admin@jaryan.ir / admin1234

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$BACKEND/.venv"
PY="$VENV/bin/python"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

# Colours, but only when attached to a terminal.
if [ -t 1 ]; then
  R=$'\e[31m'; G=$'\e[32m'; Y=$'\e[33m'; B=$'\e[34m'; DIM=$'\e[2m'; N=$'\e[0m'
else
  R=; G=; Y=; B=; DIM=; N=
fi

info() { printf '%s==>%s %s\n' "$B" "$N" "$*"; }
ok()   { printf '%s  ✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '%s  !%s %s\n' "$Y" "$N" "$*"; }
die()  { printf '%s  ✗%s %s\n' "$R" "$N" "$*" >&2; exit 1; }

# The repo ships an extracted Node tarball; prefer it over a system Node.
if [ -x "$ROOT/node/bin/node" ]; then
  export PATH="$ROOT/node/bin:$PATH"
fi

port_busy() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -q ":$1 "
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

# MongoDB and Redis are optional; report what's missing but never block startup.
check_optional_services() {
  if command -v mongosh >/dev/null 2>&1 &&
     mongosh --quiet --eval 'db.adminCommand({ping:1})' >/dev/null 2>&1; then
    ok "MongoDB is up"
  else
    warn "MongoDB unreachable — login/dashboard/forms work, process execution does not"
  fi

  if command -v redis-cli >/dev/null 2>&1 && [ "$(redis-cli ping 2>/dev/null)" = "PONG" ]; then
    ok "Redis is up"
  else
    warn "Redis unreachable — Celery task timeouts will not run"
  fi
}

setup_backend() {
  command -v python3 >/dev/null 2>&1 || die "python3 not found"

  if [ ! -x "$PY" ]; then
    info "Creating virtualenv"
    python3 -m venv "$VENV" || die "venv creation failed (try: sudo apt install python3-venv)"
  fi

  # Re-install only when the requirements file is newer than the last install.
  local stamp="$VENV/.requirements-stamp"
  local reqs="$BACKEND/requirements-local.txt"
  if [ ! -f "$stamp" ] || [ "$reqs" -nt "$stamp" ]; then
    info "Installing Python dependencies"
    "$PY" -m pip install --quiet --upgrade pip
    "$PY" -m pip install --quiet -r "$reqs" || die "pip install failed"
    touch "$stamp"
    ok "Python dependencies installed"
  else
    ok "Python dependencies up to date"
  fi

  info "Applying migrations"
  (cd "$BACKEND" && "$PY" manage.py migrate --noinput) || die "migrate failed"

  # seed is idempotent: it prints a warning and exits 0 if the org already exists.
  info "Seeding sample data"
  (cd "$BACKEND" && "$PY" manage.py seed) || die "seed failed"
}

setup_frontend() {
  command -v node >/dev/null 2>&1 || die "node not found (expected $ROOT/node/bin or a system install)"

  if [ ! -d "$FRONTEND/node_modules" ]; then
    info "Installing frontend dependencies (this takes a few minutes)"
    corepack enable >/dev/null 2>&1 || true
    (cd "$FRONTEND" && yarn install --network-timeout 600000) || die "yarn install failed"
    ok "Frontend dependencies installed"
  else
    ok "Frontend dependencies present"
  fi
}

run_backend() {
  port_busy "$BACKEND_PORT" && die "port $BACKEND_PORT is already in use (override with BACKEND_PORT=…)"
  info "Backend → http://127.0.0.1:$BACKEND_PORT"
  cd "$BACKEND"
  exec "$PY" manage.py runserver "0.0.0.0:$BACKEND_PORT"
}

run_frontend() {
  port_busy "$FRONTEND_PORT" && die "port $FRONTEND_PORT is already in use (override with FRONTEND_PORT=…)"
  info "Frontend → http://localhost:$FRONTEND_PORT"
  cd "$FRONTEND"
  export PORT="$FRONTEND_PORT"
  export BROWSER="${BROWSER:-none}"
  # package.json proxies /api to 127.0.0.1:8000. On a custom backend port the
  # proxy no longer matches, so point the client at the backend explicitly.
  if [ "$BACKEND_PORT" != "8000" ]; then
    export REACT_APP_BACKEND_URL="http://localhost:$BACKEND_PORT"
  fi
  exec yarn start
}

run_both() {
  setup_backend
  setup_frontend
  check_optional_services

  port_busy "$BACKEND_PORT" && die "port $BACKEND_PORT is already in use (override with BACKEND_PORT=…)"
  port_busy "$FRONTEND_PORT" && die "port $FRONTEND_PORT is already in use (override with FRONTEND_PORT=…)"

  local logs="$ROOT/.logs"
  mkdir -p "$logs"

  # Kill the whole process group on exit so Ctrl-C takes both servers down.
  local pids=()
  cleanup() {
    trap - INT TERM EXIT
    printf '\n'
    info "Shutting down"
    for pid in "${pids[@]:-}"; do
      kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true
  }
  trap cleanup INT TERM EXIT

  info "Starting backend → http://127.0.0.1:$BACKEND_PORT ${DIM}($logs/backend.log)${N}"
  (cd "$BACKEND" && exec "$PY" manage.py runserver "0.0.0.0:$BACKEND_PORT") \
    >"$logs/backend.log" 2>&1 &
  pids+=($!)

  # Give Django a moment, then confirm it survived startup.
  sleep 4
  if ! kill -0 "${pids[0]}" 2>/dev/null; then
    printf '\n%s' "$R"; tail -n 30 "$logs/backend.log"; printf '%s\n' "$N"
    die "backend failed to start — full log at $logs/backend.log"
  fi
  ok "Backend running"

  info "Starting frontend → http://localhost:$FRONTEND_PORT ${DIM}($logs/frontend.log)${N}"
  (
    cd "$FRONTEND"
    export PORT="$FRONTEND_PORT" BROWSER="${BROWSER:-none}"
    [ "$BACKEND_PORT" != "8000" ] && export REACT_APP_BACKEND_URL="http://localhost:$BACKEND_PORT"
    exec yarn start
  ) >"$logs/frontend.log" 2>&1 &
  pids+=($!)

  printf '\n'
  ok "Open ${B}http://localhost:$FRONTEND_PORT${N}"
  printf '    login: %sadmin@jaryan.ir%s / %sadmin1234%s\n' "$B" "$N" "$B" "$N"
  printf '    admin: %shttp://127.0.0.1:%s/admin/%s\n' "$B" "$BACKEND_PORT" "$N"
  printf '    logs:  %stail -f %s/{backend,frontend}.log%s\n' "$DIM" "$logs" "$N"
  printf '    %sCtrl-C to stop both%s\n\n' "$DIM" "$N"

  wait
}

run_celery() {
  [ -x "$PY" ] || die "backend not set up — run ./run.sh setup first"
  [ "$(redis-cli ping 2>/dev/null)" = "PONG" ] || die "Redis is not running"

  local pids=()
  trap 'for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done' INT TERM EXIT

  cd "$BACKEND"
  info "Starting Celery worker and beat"
  "$VENV/bin/celery" -A jaryan worker -l info & pids+=($!)
  "$VENV/bin/celery" -A jaryan beat -l info & pids+=($!)
  wait
}

cmd_status() {
  info "Environment"
  [ -x "$PY" ] && ok "venv present" || warn "venv missing — run ./run.sh setup"
  [ -d "$FRONTEND/node_modules" ] && ok "node_modules present" || warn "node_modules missing"
  [ -f "$BACKEND/db.sqlite3" ] && ok "db.sqlite3 present" || warn "db.sqlite3 missing — run ./run.sh setup"
  command -v node >/dev/null 2>&1 && ok "node $(node -v)" || warn "node not found"

  info "Optional services"
  check_optional_services

  info "Ports"
  port_busy "$BACKEND_PORT"  && warn "$BACKEND_PORT in use"  || ok "$BACKEND_PORT free"
  port_busy "$FRONTEND_PORT" && warn "$FRONTEND_PORT in use" || ok "$FRONTEND_PORT free"
}

cmd_clean() {
  printf 'This deletes %s, %s and %s.\n' "$VENV" "$FRONTEND/node_modules" "$BACKEND/db.sqlite3"
  read -r -p 'Continue? [y/N] ' reply
  case "$reply" in
    [yY]*) ;;
    *) info "Aborted"; return 0 ;;
  esac
  rm -rf "$VENV" "$FRONTEND/node_modules" "$BACKEND/db.sqlite3" "$ROOT/.logs"
  ok "Cleaned"
}

case "${1:-all}" in
  all)      run_both ;;
  setup)    setup_backend; setup_frontend; check_optional_services; ok "Setup complete — run ./run.sh to start" ;;
  backend)  setup_backend; run_backend ;;
  frontend) setup_frontend; run_frontend ;;
  seed)     [ -x "$PY" ] || die "run ./run.sh setup first"
            cd "$BACKEND" && exec "$PY" manage.py seed --reset ;;
  celery)   run_celery ;;
  status)   cmd_status ;;
  clean)    cmd_clean ;;
  -h|--help|help)
            sed -n '3,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ;;
  *)        die "unknown command '$1' — try: ./run.sh --help" ;;
esac
