#!/bin/bash

echo "---------------------------------------------------------------------------"

# install docker, and set to auto-start

path_to_exec=$(which docker)
if [ -x "$path_to_exec" ] ; then
    echo "found docker at    $path_to_exec"
else
    echo "Installing docker ..."
	sudo yum install docker
	sudo groupadd docker
	sudo usermod -aG docker $USER
	sudo systemctl enable docker.service
	sudo systemctl enable containerd.service
fi

# build app container
sudo systemctl start docker

echo "Stopping old instances ..."
docker stop quantum > /dev/null 2>&1
docker rm   quantum > /dev/null 2>&1

echo "building quantum image ..."
sudo docker rmi xenon130/quantum
sudo docker build -t xenon130/quantum -f docker/Dockerfile node

echo "---------------------------------------------------------------------------"
sudo docker image ls