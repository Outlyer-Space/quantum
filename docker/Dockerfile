FROM redhat/ubi9

ARG GIT_BRANCH=unknown
ARG GIT_COMMIT=unknown
ARG APP_VERSION=unknown
ENV GIT_BRANCH=${GIT_BRANCH} \
	GIT_COMMIT=${GIT_COMMIT} \
	APP_VERSION=${APP_VERSION} \
	NODE_ENV=production

RUN yum -y install nodejs git make && \
	yum -y update --setopt=tsflags=nodocs && \
	yum clean all && \
	npm install -g pm2

WORKDIR /node

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY . .

EXPOSE 3000

CMD ["pm2-runtime", "start", "pm2.config.js"]
