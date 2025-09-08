#!/bin/bash

# run mode is passed as an argument, e.g. './start.sh debug2'
#
#   mode    | source    | execution  | exec
# ------------------------------------------------------------
#   debug   | host      | host       | node
#   pm2     | host      | host       | pm2
#   docker  | host      | container  | pm2
#   deploy  | container | container  | pm2
#

# default credentials / config
export NODE_ENV=development
export MONGO_DB_URL='mongodb://localhost:27017/quantum'
export MONGO_DB_USR=
export MONGO_DB_PWD=
export AUTH_PROVIDER='Mongo'
export AUTH_TENANT_ID=
export AUTH_CALLBACK_URL=
export AUTH_CLIENT_ID='sys.admin@localhost'
export AUTH_CLIENT_SECRET='2infinity'

# load secrets file if available
if [ -f ./secrets.env ]; then
  set -a
    source ./secrets.env
  set +a
fi

# --------------------------------------------------------------

# install prereqs if running on host
if [ "$1" = "debug" ] || [ "$1" = "pm2" ]; then

  # make sure nodeJS is installed
  if [ -z "which node" ]; then
    echo "Installing node ..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
    . ~/.nvm/nvm.sh
    nvm install 16.0.0
  fi

  # make sure pm2 is installed
  if [ -z "which pm2" ]; then
    echo "Installing prerequisites ..."
    npm install -g express
    npm install -g pm2 && pm2 update
    pm2 install pm2-logrotate
    pm2 set pm2-logrotate:compress true
    pm2 set pm2-logrotate:retain 5
  fi

fi

# run quantum on the host using node
if [ "$1" = "debug" ]; then
  echo "Starting DEBUG mode / running node"
  node node/server.js
  exit 0
fi

# run quantum on the host using pm2
if [ "$1" = "pm2" ]; then
  cd node
  echo "Starting DEBUG mode / running pm2"
  pm2 start pm2.config.js
  pm2 show quantum
  echo ""
  cd ..
  exit 0
fi

# run inside docker container with source on host
if [ "$1" = "docker" ]; then

  echo "Stopping old instances ..."
  docker stop quantum > /dev/null 2>&1
  docker rm   quantum > /dev/null 2>&1

  echo -n "Starting DEVELOPER mode (local source) "
  docker run -d -t       \
    --name quantum         \
    --env-file secrets.env \
    -v $(pwd)/node:/node/  \
    -p 3000:3000           \
    xenon130/quantum > /dev/null

  # wait 5 seconds
  for i in 1 2 3
  do
    sleep 1.5s
    echo -n "."
  done
  echo " "

  # show status
  printf '%*s\n' "${COLUMNS:-$(tput cols)}" '' | tr ' ' -
  docker ps -a
  printf '%*s\n' "${COLUMNS:-$(tput cols)}" '' | tr ' ' -
  exit 0
fi

# run inside docker container (including source) >> PRODUCTION
if [ "$1" = "deploy" ]; then

  echo "Stopping old instances ..."
  docker stop quantum > /dev/null 2>&1
  docker rm   quantum > /dev/null 2>&1

  echo -n "Starting DEVELOPER mode "
  docker run -d -t       \
    --name quantum         \
    --env-file secrets.env \
    -p 3000:3000           \
    xenon130/quantum > /dev/null

  # show status
  printf '%*s\n' "${COLUMNS:-$(tput cols)}" '' | tr ' ' -
  docker ps -a
  printf '%*s\n' "${COLUMNS:-$(tput cols)}" '' | tr ' ' -
  exit 0
fi

echo ""
echo "ERROR - unrecognized option '$1', use:"
echo " > ./start.sh debug  (run node  , source on host  )"
echo " > ./start.sh pm2    (run pm2   , source on host  )"
echo " > ./start.sh docker (run docker, source on host  )"
echo " > ./start.sh deploy (run docker, source in docker)"
echo ""
exit 1
