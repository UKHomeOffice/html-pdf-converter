FROM node:24.18.0-alpine3.24@sha256:4ba75f835bb8802193e4c114572113d4b26f95f6f094f4b5229d2a77773e0afc
ENV PUPPETEER_SKIP_DOWNLOAD=true \
	PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN apk update && apk upgrade \
	&& apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont \
	&& corepack enable \
	&& corepack prepare yarn@1.22.22 --activate \
	&& npm install -g npm@latest \
	&& npm --version \
	&& yarn --version \
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

RUN yarn cache clean --force \
    && yarn upgrade brace-expansion@5.0.8


COPY . /app

CMD ["node", "--unhandled-rejections=strict", "index.js"]