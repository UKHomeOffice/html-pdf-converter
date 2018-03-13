FROM quay.io/ukhomeofficedigital/nodejs-base:v8

COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
RUN npm --loglevel warn install

COPY . /app
COPY test /app/test

USER nodejs

CMD ["npm", "run", "test:regression"]
