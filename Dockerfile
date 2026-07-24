FROM node:24.18.0-alpine3.24

ENV PUPPETEER_SKIP_DOWNLOAD=true \
	PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN apk update && apk upgrade \
	&& apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont \
	&& corepack enable \
	&& npm install -g npm@12.0.1 yarn@1.22.22 \
	&& npm --version \
	&& yarn --version \
	&& addgroup -S app \
	&& adduser -S -u 999 -G app -h /app app \
	&& mkdir -p /app \
	&& chown -R app:app /app \
	&& test -x /usr/bin/chromium-browser || ln -s /usr/bin/chromium /usr/bin/chromium-browser

USER app
WORKDIR /app

COPY package.json yarn.lock /app/
RUN yarn install --frozen-lockfile --production --ignore-optional \
	&& chown -R app:app /app/node_modules/puppeteer

COPY . /app

CMD ["node", "--unhandled-rejections=strict", "index.js"]