FROM node:18

ADD . .

RUN npm i && npm run build

CMD node lib/index.js
