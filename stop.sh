#!/bin/bash

echo ""

# if we have docker and a running container, stop it
if ! [ -z "which docker" ] && [ "$(docker ps | grep quantum)" ]; then

    echo "STOPPING docker instance ..."
    echo ""
    docker stop quantum > /dev/null
    docker ps -a
    echo ""
fi

# if we have pm2 and a running process, stop it
if ! [ -z "which pm2" ]; then
    qpid=$(pm2 pid quantum)
    if [ "${qpid}" -ne 0 ]; then
        echo "STOPPING pm2 process $qpid ..."
        pm2 stop quantum --watch
        echo ""
    fi
fi

echo ">> All stopped."