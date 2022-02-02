FROM node:16-bullseye-slim

RUN  apt-get update

# chromium is now installable without an external repo since Debian 11 (bullseye)
RUN apt-get install -yq chromium
# puppeteer expects the executable to be named chromium-browser
RUN ln -s /usr/bin/chromium /usr/bin/chromium-browser

RUN addgroup --system app
RUN adduser --system app --uid 999 --home /app/
RUN adduser app app
RUN chown -R app:app /app/

USER 999
WORKDIR /app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true

COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
RUN npm ci --production

# ensure user can exec the chrome binaries installed into the puppeteer directory
RUN chown -R app:app /app/node_modules/puppeteer

COPY . /app

CMD node --unhandled-rejections=strict index.js
