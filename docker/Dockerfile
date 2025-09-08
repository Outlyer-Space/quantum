
# Quantum Dockerfile

## base system & updates

FROM --platform=linux/amd64 redhat/ubi9
RUN  yum swap -y fakesystemd systemd && \
	 yum -y update --setopt=tsflags=nodocs && \
	 yum -y install git wget nano make dos2unix


## install node.js & pm2

RUN yum -y install nodejs  && \
	yum -y update --setopt=tsflags=nodocs && \
	npm install -g bower && \
	npm install -g gulp  && \
	npm install -g mean-cli && \
	npm install -g pm2 \
	npm install -g express

## install logrotate for pm2

RUN pm2 install pm2-logrotate && \
	pm2 set pm2-logrotate:compress true && \
	pm2 set pm2-logrotate:retain 7

## deploy quantum app from host into container

RUN  mkdir -p /node
WORKDIR /node
COPY . /node
RUN npm install --no-save

# environment variables
# https://vsupalov.com/docker-arg-env-variable-guide/
#
# - not required/used during image build
# - passed with docker run command via secret.env file
# - not required/used during app start (uses shell env)

EXPOSE 3000

# start node server (pm2 process)
# https://vsupalov.com/debug-docker-container/
#
# the last command can't exit, or the container will shutdown
#
# to debug:
# (1) if exited : add "docker run [...] --entrypoint /bin/bash <image_name>"
# (2) if running: docker exec -it quantum /bin/bash

CMD pm2-runtime start pm2.config.js
