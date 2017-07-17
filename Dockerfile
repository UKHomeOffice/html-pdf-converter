FROM quay.io/ukhomeofficedigital/nodejs-base:v6

COPY package.json /app/package.json
RUN npm --loglevel warn install --production
COPY . /app

USER nodejs

CMD ["npm", "start"]
