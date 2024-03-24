FROM node:18-alpine

ARG API_VERSION=dev
ENV API_VERSION=$API_VERSION

# Installing needed tools for healthchecks
RUN apk update && apk add curl jq  

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
ADD . .

RUN npm ci
RUN npm run build

CMD node lib/index.js
