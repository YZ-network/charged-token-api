FROM node:18

ADD . .

RUN chown -R node .
RUN npm i && npm run build

CMD node lib/index.js
