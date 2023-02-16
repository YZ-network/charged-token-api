FROM node:16

ADD . .

RUN npm i

CMD npm start
