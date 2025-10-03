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
DOCKERFILE="${DOCKERFILE:-docker/Dockerfile}"
CONTEXT="${CONTEXT:-node}"
PULL="${PULL:-false}"
COMPOSE_FILE="docker/docker-compose.yml"

log()  { printf "\033[1;34m[start]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*" >&2; }
die()  { printf "\033[1;31m[fail]\033[0m %s\n" "$*" >&2; exit 1; }

# ---------- Beautified runner ----------
run() {
  local desc="$1"
  shift
  printf "\033[1;34m[run]\033[0m %-40s ... " "$desc"
  if output=$("$@" 2>&1); then
    printf "\033[1;32m[ OK ]\033[0m\n"
    [ -n "$output" ] && echo "$output"
  else
    printf "\033[1;31m[FAIL]\033[0m\n"
    echo "$output" >&2
    return 1
  fi
}

usage() {
  cat <<EOF
Usage: ./quantum.sh [debug|pm2|docker|deploy|build|up|down|clean|rebuild]
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
echo " --------------------------------------------------------------"
echo " > NODE_ENV            : $NODE_ENV"
echo " > MONGO_DB_URL        : $MONGO_DB_URL"
echo " > MONGO_DB_USR        : $MONGO_DB_USR"
echo " > MONGO_DB_PWD        : ${MONGO_DB_PWD:+***}"
echo " > AUTH_PROVIDER       : $AUTH_PROVIDER"
echo " > AUTH_TENANT_ID      : $AUTH_TENANT_ID"
echo " > AUTH_CALLBACK_URL   : $AUTH_CALLBACK_URL"
echo " > AUTH_CLIENT_ID      : $AUTH_CLIENT_ID"
echo " > AUTH_CLIENT_SECRET  : ${AUTH_CLIENT_SECRET:+***}"
echo " --------------------------------------------------------------"

cmd="${1:-up}"

# ---------- Host prerequisites ----------
ensure_host_tools() {
  if ! command -v node >/dev/null 2>&1; then
    warn "NodeJS not found; installing via nvm (16.0.0)"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
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
    run "Removing old container: $CONTAINER" docker rm -f "$CONTAINER"
    run "Removing old image: $IMAGE" docker rmi -f "$IMAGE"
    args=( -t "$IMAGE" -f "$DOCKERFILE" )
    $PULL && args+=( --pull )
    run "Building image" docker build "${args[@]}" "$CONTEXT"
    run "Listing image" docker image ls "$IMAGE"
    ;;

  up)
    run "Starting stack (rebuild + detach)" docker compose -f "$COMPOSE_FILE" up --build -d
    run "Showing stack status" docker compose -f "$COMPOSE_FILE" ps
    ;;

  down)
    run "Stopping stack" docker compose -f "$COMPOSE_FILE" down
    ;;

  clean)
    run "Removing container" docker rm -f "$CONTAINER"
    run "Removing image" docker rmi -f "$IMAGE"
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
    run "Starting PM2 mode on host" pm2 start node/pm2.config.js
    run "Showing PM2 quantum process" pm2 show quantum
    ;;

  docker)
    run "Stopping container" docker stop "$CONTAINER"
    run "Removing container" docker rm "$CONTAINER"
    run "Starting DEVELOPER mode" docker run -d -t \
      --name "$CONTAINER" \
      --env-file secrets.env \
      -v "$(pwd)/node:/node" \
      -p 3000:3000 \
      "$IMAGE"
    run "Listing containers" docker ps -a
    ;;

    app)
    run "Starting only quantum (no deps)" \
      docker compose -f "$COMPOSE_FILE" up -d --build --no-deps quantum
    ;;

  deploy)
    run "Stopping container" docker stop "$CONTAINER"
    run "Removing container" docker rm "$CONTAINER"
    run "Starting DEPLOY mode" docker run -d -t \
      --name "$CONTAINER" \
      --env-file secrets.env \
      -p 3000:3000 \
      "$IMAGE"
    run "Listing containers" docker ps -a
    ;;

  *)
    usage; exit 1;;
esac

exit 0
