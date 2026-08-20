FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install && npm install -g nodemon

COPY . .

EXPOSE 9088

CMD ["nodemon", "--watch", "src", "src/server.js"]
