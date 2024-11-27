# FROM node:22.4-alpine3.19@sha256:0d1e8c6ff4362814575daee9c21454dd38984ea29571e9f0eb41f4f26dfa0143
# FROM node:18.20.3-slim@sha256:868cd90cccb17f1f94d3d5521d390eecd9b1b55a56e03741735c78ef4cef5feb
FROM node:22-slim@sha256:ee76feb064dbe3579085bc2517cb54ecf64b083db8f6f80341cfe4a4770d1415

# RUN apk update && apk upgrade
RUN apt-get update 
# See https://crbug.com/795759
RUN apt-get install -yq gconf-service gnupg libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget

# Install latest chrome dev package, which installs the necessary libs to
# make the bundled version of Chromium that Puppeteer installs work.
RUN apt-get install -y curl --no-install-recommends
RUN curl -k https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
RUN sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
RUN apt-get update
RUN apt-get install -y google-chrome-unstable --no-install-recommends

RUN addgroup --system app
RUN adduser --system app --uid 999 --home /app/
RUN adduser app app
RUN chown -R app:app /app/

USER 999
WORKDIR /app

COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
RUN yarn install --frozen-lockfile --production --ignore-optional && \
    yarn run postinstall

# ensure user can exec the chrome binaries installed into the puppeteer directory
RUN chown -R app:app /app/node_modules/puppeteer

COPY . /app

CMD node --unhandled-rejections=strict index.js
