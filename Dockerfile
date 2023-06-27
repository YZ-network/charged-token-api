FROM node:18

ADD . .

RUN npm ci
RUN npm run build

CMD node lib/index.js
