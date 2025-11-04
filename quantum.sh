#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# --------------------------------------------------------------
# Unified starter for Quantum
# - Preserves legacy modes: debug | pm2 | docker | deploy
# - Adds: build | up | down | clean | rebuild
# - Loads env from secrets.env and prints effective config
# --------------------------------------------------------------

# DEFAULTs -----------------------------------------------------

IMAGE="${IMAGE:-outlyer/quantum}"
CONTAINER="${CONTAINER:-quantum}"
DOCKERFILE="${DOCKERFILE:-docker/Dockerfile}"
CONTEXT="${CONTEXT:-node}"
PULL="${PULL:-false}"
COMPOSE_FILE="docker/docker-compose.yml"


# FUNCTIONS  -----------------------------------------------------

log()    { printf "\033[1;34m[start]\033[0m %s\n" "$*"; }
notice() { printf "\033[1;32m[notice]\033[0m %s\n" "$*"; }
warn()   { printf "\033[1;33m[warn]\033[0m %s\n" "$*" >&2; }
die()    { printf "\033[1;31m[fail]\033[0m %s\n" "$*" >&2; exit 1; }

# help message
usage() {
  cat <<EOF

  Usage:    ./quantum.sh [command]

  debug     Run node directly on host (dev)
  pm2       Run with pm2 on host (dev)
  docker    Run built image, mounting ./node (dev hot-reload style)
  deploy    Run built image without mounting source (prod-like)
  build     docker build -t ${IMAGE} -f ${DOCKERFILE} ${CONTEXT}
  up        docker compose up --build -d
  down      docker compose down
  clean     Remove container and image
  rebuild   Clean + build
  help      Show this message (default when no command specified)

  Env       IMAGE, CONTAINER, DOCKERFILE, CONTEXT, PULL=true
EOF
}

# beautified runner
run()    {
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

# Host prereq (Node.js)
check_node() {
  if ! command -v node >/dev/null 2>&1; then
    warn "NodeJS not found; installing via nvm (16.0.0)"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
    . ~/.nvm/nvm.sh
    nvm install 16.0.0
  fi

  # pm2
  if ! command -v pm2 >/dev/null 2>&1; then
    warn "pm2 not found; installing"
    npm install -g express pm2 && pm2 update
    pm2 install pm2-logrotate || true
    pm2 set pm2-logrotate:compress true || true
    pm2 set pm2-logrotate:retain 5 || true
  fi
}

# Host prereq (docker)
check_docker(){
  if command -v docker >/dev/null 2>&1; then
      if docker info >/dev/null 2>&1; then
          return 0
      else
          echo "❌ Found Docker but can't connect; please start service."
          exit 1
      fi
  else
      echo "❌ Docker not found in PATH; please install docker."
      exit 1
  fi
}

# Host prereq (secrets.env)
check_secrets(){
  SECRETS_FILE="./secrets.env"

  # ---------- create secrets.env (if needed) ----------
  if ! [[ -e "$SECRETS_FILE" ]]; then
    echo "⚠️  No $SECRETS_FILE found; creating with defaults."

    src="./secrets.env.example"
    dst=$SECRETS_FILE

    # Copy the file, if source is newer
    cp -u -- "$src" "$dst"

    # show where it is
    file_path=$(readlink -f "$SECRETS_FILE")
    echo "✅ Defaults saved to: $file_path"
  fi

  # ---------- Load secrets.env ----------
  while IFS= read -r line || [[ -n $line ]]; do
      # Strip leading/trailing whitespace
      line="${line#"${line%%[![:space:]]*}"}"
      line="${line%"${line##*[![:space:]]}"}"

      # Skip blanks and comment lines
      [[ -z $line || $line == \#* ]] && continue

      # Only read lines that look like VAR=VALUE
      if [[ $line =~ ^([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]]; then
          var_name="${BASH_REMATCH[1]}"
          var_value="${BASH_REMATCH[2]}"
          export "$var_name=$var_value"
      else
          echo "Skipping bad line: $line"
      fi
  done < "$SECRETS_FILE"

}

# show active config
show_config(){
  printf '%s\n' "$(cat ./node/app/media/quantum.banner 2>/dev/null || true)"
  echo " > NODE_ENV            : $NODE_ENV"
  echo " > MONGO_DB_USR        : $MONGO_DB_USR"
  echo " > MONGO_DB_PWD        : $MONGO_DB_PWD"
  echo " > MONGO_DB_URL        : $MONGO_DB_URL"
  echo " > AUTH_PROVIDER       : $AUTH_PROVIDER"
  echo " > AUTH_TENANT_ID      : $AUTH_TENANT_ID"
  echo " > AUTH_CALLBACK_URL   : $AUTH_CALLBACK_URL"
  echo " > AUTH_CLIENT_ID      : $AUTH_CLIENT_ID"
  echo " > AUTH_CLIENT_SECRET  : $AUTH_CLIENT_SECRET"
  echo ""
}


# MAIN     -----------------------------------------------------

if [[ $# -eq 0 ]]; then
  # no command given -> show help & exit
  usage
  exit 1
fi

# ---------- Run Command ----------
cmd="${1}"
case "$cmd" in
  build)
    check_docker
    check_secrets
    show_config
    run "Removing old container: $CONTAINER" docker rm -f "$CONTAINER"
    run "Removing old image: $IMAGE" docker rmi -f "$IMAGE"
    
    GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    log "Git Branch: $GIT_BRANCH | Commit: $GIT_COMMIT"
    
    args=( -t "$IMAGE" -f "$DOCKERFILE" )
    args+=( --build-arg "GIT_BRANCH=$GIT_BRANCH" )
    args+=( --build-arg "GIT_COMMIT=$GIT_COMMIT" )
    $PULL && args+=( --pull )
    run "Building image" docker build "${args[@]}" "$CONTEXT"
    run "Listing image" docker image ls "$IMAGE"
    ;;

  up)
    check_docker
    check_secrets
    show_config
    
    export GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    export GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    log "Git Branch: $GIT_BRANCH | Commit: $GIT_COMMIT"
    
    run "Starting stack (rebuild + detach)" docker compose -f "$COMPOSE_FILE" up --build -d
    run "Showing stack status" docker compose -f "$COMPOSE_FILE" ps
    ;;

  down)
    check_docker
    run "Stopping stack" docker compose -f "$COMPOSE_FILE" down
    ;;

  clean)
    check_docker
    run "Removing container" docker rm -f "$CONTAINER"
    run "Removing image" docker rmi -f "$IMAGE"
    ;;

  rebuild)
    "$0" clean
    "$0" build
    ;;

  debug)
    check_node
    check_secrets
    show_config
    log "Starting DEBUG mode / running node"
    node node/server.js
    ;;

  pm2)
    check_node
    check_secrets
    show_config
    run "Starting PM2 mode on host" pm2 start node/pm2.config.js
    run "Showing PM2 quantum process" pm2 show quantum
    ;;

  docker)
    check_docker
    check_secrets
    show_config
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
    check_docker
    check_secrets
    show_config
    run "Starting only quantum (no deps)" \
      docker compose -f "$COMPOSE_FILE" up -d --build --no-deps quantum
    ;;

  deploy)
    check_docker
    check_secrets
    show_config
    run "Stopping container" docker stop "$CONTAINER"
    run "Removing container" docker rm "$CONTAINER"
    run "Starting DEPLOY mode" docker run -d -t \
      --name "$CONTAINER" \
      --env-file secrets.env \
      -p 3000:3000 \
      "$IMAGE"
    run "Listing containers" docker ps -a
    ;;

  help)
    usage
    ;;

  *)
    usage; exit 1;;
esac

# ---------- Success confirmation ----------
notice "Command '$cmd' completed successfully"
exit 0
