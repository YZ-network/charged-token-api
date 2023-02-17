FROM node:16

ADD . .

RUN npm i && npm run build

CMD node lib/index.js
