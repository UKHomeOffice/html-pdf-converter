FROM node:12-slim

RUN  apt-get update
# See https://crbug.com/795759
RUN apt-get install -yq libgconf-2-4
RUN apt-get install -yq gnupg
RUN apt-get install -yq libxss1
RUN apt-get install -yq libxtst6
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
RUN npm ci --production

# ensure user can exec the chrome binaries installed into the puppeteer directory
RUN chown -R app:app /app/node_modules/puppeteer

COPY . /app

CMD node --unhandled-rejections=strict index.js
