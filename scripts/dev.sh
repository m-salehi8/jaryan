#!/usr/bin/env bash
# ─────────────────────────────────────────────
# Dev Startup Script — Run project without Docker
# ─────────────────────────────────────────────
# This script:
#   1. Starts MongoDB in Docker (docker-compose.dev.yml)
#   2. Waits for MongoDB to be healthy
#   3. Activates backend venv and starts FastAPI with --reload
#   4. Starts frontend dev server (yarn start)
#
# Usage:
#   ./scripts/dev.sh          # start everything
#   ./scripts/dev.sh mongo    # only start MongoDB
#   ./scripts/dev.sh backend  # only start backend
#   ./scripts/dev.sh frontend # only start frontend
#   ./scripts/dev.sh stop     # stop MongoDB container

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.dev.yml"
CONTAINER_NAME="jaryan_mongo"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_ok()   { echo -e "${GREEN}✓${NC} $1"; }
log_info() { echo -e "${YELLOW}→${NC} $1"; }
log_err()  { echo -e "${RED}✗${NC} $1"; }

start_mongo() {
    log_info "Starting MongoDB in Docker..."
    docker compose -f "$COMPOSE_FILE" up -d
    log_info "Waiting for MongoDB to be healthy..."
    until docker compose -f "$COMPOSE_FILE" exec -T mongo mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; do
        sleep 2
    done
    log_ok "MongoDB is ready on localhost:27017"
}

stop_mongo() {
    log_info "Stopping MongoDB..."
    docker compose -f "$COMPOSE_FILE" down
    log_ok "MongoDB stopped"
}

start_backend() {
    log_info "Starting backend (FastAPI)..."
    cd "$ROOT_DIR/backend"

    if [ -d ".venv" ]; then
        source .venv/bin/activate
        log_ok "Virtual environment activated"
    fi

    # Install dependencies if needed
    if ! python -c "import fastapi" 2>/dev/null; then
        log_info "Installing backend dependencies..."
        pip install -r requirements.txt
    fi

    log_ok "Backend running on http://localhost:8000"
    exec uvicorn server:app --reload --host 0.0.0.0 --port 8000
}

start_frontend() {
    log_info "Starting frontend (React dev server)..."
    cd "$ROOT_DIR/frontend"

    if [ ! -d "node_modules" ]; then
        log_info "Installing frontend dependencies..."
        yarn install --network-timeout 600000
    fi

    log_ok "Frontend running on http://localhost:3000"
    exec yarn start
}

case "${1:-all}" in
    stop)
        stop_mongo
        ;;
    mongo)
        start_mongo
        ;;
    backend)
        start_backend
        ;;
    frontend)
        start_frontend
        ;;
    all)
        # Check if MongoDB is already running
        if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
            start_mongo
        else
            log_ok "MongoDB is already running"
        fi

        # Start backend in background
        log_info "Starting backend in background..."
        cd "$ROOT_DIR/backend"
        if [ -d ".venv" ]; then
            source .venv/bin/activate
        fi
        if ! python -c "import fastapi" 2>/dev/null; then
            pip install -r requirements.txt -q
        fi
        uvicorn server:app --reload --host 0.0.0.0 --port 8000 &
        BACKEND_PID=$!
        log_ok "Backend started (PID: $BACKEND_PID)"

        # Start frontend in foreground
        start_frontend
        ;;
    *)
        echo "Usage: $0 {all|mongo|backend|frontend|stop}"
        echo ""
        echo "  all      — Start MongoDB + Backend (bg) + Frontend (fg)"
        echo "  mongo    — Start only MongoDB container"
        echo "  backend  — Start only FastAPI server"
        echo "  frontend — Start only React dev server"
        echo "  stop     — Stop MongoDB container"
        exit 1
        ;;
esac
