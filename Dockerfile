FROM quay.io/ukhomeofficedigital/hof-nodejs:24.19.0-alpine3.24@sha256:a70b2f29d55a9aebcf89690e7f64f4889725dab87a3b22663d102ca17c5f888e

ENV PUPPETEER_SKIP_DOWNLOAD=true \
	PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN apk update && apk upgrade \
	&& apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont \
	&& rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
	&& addgroup -S app \
	&& adduser -S -u 999 -G app -h /app app \
	&& mkdir -p /app \
	&& chown -R app:app /app \
	&& test -x /usr/bin/chromium-browser || ln -s /usr/bin/chromium /usr/bin/chromium-browser

USER 999
WORKDIR /app

COPY package.json yarn.lock /app/
RUN yarn install --frozen-lockfile --production --ignore-optional \
	&& chown -R app:app /app/node_modules/puppeteer

COPY . /app

CMD ["node", "--unhandled-rejections=strict", "index.js"]