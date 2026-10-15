# -----------------------------
# Stage 1: Builder
# -----------------------------
FROM quay.io/ukhomeofficedigital/hof-nodejs:24.21.0-alpine3.24-v9@sha256:baf6fee695730fcede4a6dd89390b1756ce5b26ce45b39cca3c7cdc63e91a443 AS builder

ENV PUPPETEER_SKIP_DOWNLOAD=true

USER root
WORKDIR /app

COPY package.json yarn.lock /app/
RUN yarn install --frozen-lockfile --production --ignore-optional

COPY . /app

# -----------------------------
# Stage 2: Runtime
# -----------------------------
FROM quay.io/ukhomeofficedigital/hof-nodejs:24.21.0-alpine3.24-v9@sha256:baf6fee695730fcede4a6dd89390b1756ce5b26ce45b39cca3c7cdc63e91a443

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

USER root

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
    && addgroup -S app \
    && adduser -S -u 999 -G app -h /app app \
    && mkdir -p /app \
    && chown -R app:app /app \
    && (test -x /usr/bin/chromium-browser || ln -s /usr/bin/chromium /usr/bin/chromium-browser)

WORKDIR /app

COPY --from=builder --chown=app:app /app /app

USER 999

CMD ["node", "--unhandled-rejections=strict", "index.js"]
