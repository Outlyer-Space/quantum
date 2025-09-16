#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# --------------------------------------------------------------
# Unified starter for Quantum
# - Preserves legacy modes: debug | pm2 | docker | deploy
# - Adds: build | up | down | clean | rebuild
# - Loads env from secrets.env and prints effective config
# --------------------------------------------------------------

# ---------- Defaults for local dev ----------
export NODE_ENV=${NODE_ENV:-development}
export MONGO_DB_URL=${MONGO_DB_URL:-mongodb://localhost:27017/quantum}
export MONGO_DB_USR=${MONGO_DB_USR:-}
export MONGO_DB_PWD=${MONGO_DB_PWD:-}
export AUTH_PROVIDER=${AUTH_PROVIDER:-Mongo}
export AUTH_TENANT_ID=${AUTH_TENANT_ID:-}
export AUTH_CALLBACK_URL=${AUTH_CALLBACK_URL:-}
export AUTH_CLIENT_ID=${AUTH_CLIENT_ID:-sys.admin@localhost}
export AUTH_CLIENT_SECRET=${AUTH_CLIENT_SECRET:-2infinity}

# Docker build settings (tunable via env)
IMAGE="${IMAGE:-xenon130/quantum}"
CONTAINER="${CONTAINER:-quantum}"
# Build from project root using Dockerfile in docker/ but context at node/
DOCKERFILE="${DOCKERFILE:-docker/Dockerfile}"
CONTEXT="${CONTEXT:-node}"
PULL="${PULL:-false}"

log()  { printf "\033[1;34m[start]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*" >&2; }
die()  { printf "\033[1;31m[fail]\033[0m %s\n" "$*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage: ./start.sh [debug|pm2|docker|deploy|build|up|down|clean|rebuild]
  debug    Run node directly on host (dev)
  pm2      Run with pm2 on host (dev)
  docker   Run built image, mounting ./node (dev hot-reload style)
  deploy   Run built image without mounting source (prod-like)
  build    docker build -t ${IMAGE} -f ${DOCKERFILE} ${CONTEXT}
  up       docker compose up --build -d
  down     docker compose down
  clean    Remove container and image
  rebuild  Clean + build
Env: IMAGE, CONTAINER, DOCKERFILE, CONTEXT, PULL=true
EOF
}

# ---------- Load secrets if present ----------
if [ -f ./secrets.env ]; then
  set -a
    # shellcheck disable=SC1091
    source ./secrets.env
  set +a
fi

# ---------- Print effective config (dev) ----------
printf '%s\n' "$(cat ./node/app/media/quantum.banner 2>/dev/null || true)"
echo " -""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-"
echo " > NODE_ENV            : $NODE_ENV"
echo " > MONGO_DB_URL        : $MONGO_DB_URL"
echo " > MONGO_DB_USR        : $MONGO_DB_USR"
echo " > MONGO_DB_PWD        : ${MONGO_DB_PWD:+***}"
echo " > AUTH_PROVIDER       : $AUTH_PROVIDER"
echo " > AUTH_TENANT_ID      : $AUTH_TENANT_ID"
echo " > AUTH_CALLBACK_URL   : $AUTH_CALLBACK_URL"
echo " > AUTH_CLIENT_ID      : $AUTH_CLIENT_ID"
echo " > AUTH_CLIENT_SECRET  : ${AUTH_CLIENT_SECRET:+***}"
echo " -""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-""-"

cmd="${1:-up}"

# ---------- Host prerequisites for legacy host modes ----------
ensure_host_tools() {
  if ! command -v node >/dev/null 2>&1; then
    warn "NodeJS not found; installing via nvm (16.0.0)"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
    # shellcheck disable=SC1090
    . ~/.nvm/nvm.sh
    nvm install 16.0.0
  fi
  if ! command -v pm2 >/dev/null 2>&1; then
    warn "pm2 not found; installing"
    npm install -g express pm2 && pm2 update
    pm2 install pm2-logrotate || true
    pm2 set pm2-logrotate:compress true || true
    pm2 set pm2-logrotate:retain 5 || true
  fi
}

# ---------- Actions ----------
case "$cmd" in
  build)
    log "Stopping old container (if any): $CONTAINER"
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    log "Removing old image (if any): $IMAGE"
    docker rmi -f "$IMAGE" >/dev/null 2>&1 || true
    log "Building image..."
    args=( -t "$IMAGE" -f "$DOCKERFILE" )
    $PULL && args+=( --pull )
    docker build "${args[@]}" "$CONTEXT"
    log "Build complete."
    docker image ls "$IMAGE" || true
    ;;

  up)
    if [ -f docker-compose.yml ] || [ -f compose.yml ]; then
      log "Starting stack with docker compose (rebuild + detach)..."
      docker compose up --build -d
      docker compose ps
    else
      die "No docker-compose.yml/compose.yml found. Use 'build' or add a compose file."
    fi
    ;;

  down)
    if [ -f docker-compose.yml ] || [ -f compose.yml ]; then
      log "Stopping stack..."
      docker compose down
    else
      warn "No compose file found; stopping single container if present."
      docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    fi
    ;;

  clean)
    log "Removing container and image..."
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    docker rmi -f "$IMAGE" >/dev/null 2>&1 || true
    ;;

  rebuild)
    "$0" clean
    "$0" build
    ;;

  debug)
    ensure_host_tools
    log "Starting DEBUG mode / running node"
    node node/server.js
    ;;

  pm2)
    ensure_host_tools
    log "Starting PM2 mode on host"
    ( cd node && pm2 start pm2.config.js && pm2 show quantum )
    ;;

  docker)
    log "Stopping old instances ..."
    docker stop "$CONTAINER" >/dev/null 2>&1 || true
    docker rm   "$CONTAINER" >/dev/null 2>&1 || true
    log "Starting DEVELOPER mode (local source mount)"
    docker run -d -t \
      --name "$CONTAINER" \
      --env-file secrets.env \
      -v "$(pwd)/node:/node" \
      -p 3000:3000 \
      "$IMAGE" >/dev/null
    docker ps -a
    ;;

  deploy)
    log "Stopping old instances ..."
    docker stop "$CONTAINER" >/dev/null 2>&1 || true
    docker rm   "$CONTAINER" >/dev/null 2>&1 || true
    log "Starting DEPLOY mode"
    docker run -d -t \
      --name "$CONTAINER" \
      --env-file secrets.env \
      -p 3000:3000 \
      "$IMAGE" >/dev/null
    docker ps -a
    ;;

  *)
    usage; exit 1;;
esac

exit 0
