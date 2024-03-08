FROM node:18-bullseye

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
ADD . .

RUN npm ci
RUN npm run build

CMD node lib/index.js
