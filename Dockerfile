FROM node:24-slim


# Update package index and upgrade all installed packages
RUN apt-get update && apt-get upgrade -y

# Upgrade bundled npm deps so Trivy does not report vulnerable tar/undici from base image toolchain
RUN npm install -g npm@12.0.1 && npm --version

# Install latest chrome dev package, which installs the necessary libs to
# make the bundled version of Chromium that Puppeteer installs work.
RUN apt-get install -y curl gnupg --no-install-recommends
RUN curl -k https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
RUN sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
RUN apt-get update
RUN apt-get install -y google-chrome-unstable --no-install-recommends

RUN addgroup --system app
RUN adduser --system app --uid 999 --home /app/
RUN adduser app app
RUN chown -R app:app /app/

WORKDIR /app

COPY package.json /app/package.json
RUN yarn install --frozen-lockfile --production --ignore-optional

COPY . /app

# Runtime image does not need npm/npx; removing them drops npm's vulnerable transitive packages.
RUN rm -rf /usr/local/lib/node_modules/npm \
	&& rm -f /usr/local/bin/npm /usr/local/bin/npx \
	&& chown -R app:app /app

USER 999

CMD node --unhandled-rejections=strict index.js
