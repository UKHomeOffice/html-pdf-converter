FROM node:24.18.0-slim

# Install latest chrome dev package, which installs the necessary libs to
# make the bundled version of Chromium that Puppeteer installs work.

RUN apt-get update && apt-get upgrade -y \
	&& apt-get install -y curl gnupg --no-install-recommends \
	&& curl -k https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
	&& sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
	&& apt-get update \
	&& apt-get install -y google-chrome-unstable --no-install-recommends \
	&& npm update -g npm yarn \
    # Upgrade bundled npm deps so Trivy does not report vulnerable tar/undici from base image toolchain
    && npm install -g npm@12.0.1 \
	&& npm --version \
	&& yarn --version \
	&& addgroup --system app \
	&& adduser --system app --uid 999 --home /app/ \
	&& adduser app app \
	&& chown -R app:app /app/

USER 999
WORKDIR /app

COPY package.json /app/package.json
RUN yarn install --frozen-lockfile --production --ignore-optional \
	&& chown -R app:app /app/node_modules/puppeteer

COPY . /app

CMD node --unhandled-rejections=strict index.js