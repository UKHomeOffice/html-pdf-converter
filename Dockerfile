FROM node:10-alpine

RUN apk upgrade --no-cache

# install dependencies for chrome

RUN apk add pango.x86_64 libXcomposite.x86_64 libXcursor.x86_64 \
  libXdamage.x86_64 libXext.x86_64 libXi.x86_64 libXtst.x86_64 cups-libs.x86_64 \
  libXScrnSaver.x86_64 libXrandr.x86_64 GConf2.x86_64 alsa-lib.x86_64 atk.x86_64 \
  gtk3.x86_64 ipa-gothic-fonts xorg-x11-fonts-100dpi xorg-x11-fonts-75dpi \
  xorg-x11-utils xorg-x11-fonts-cyrillic xorg-x11-fonts-Type1 xorg-x11-fonts-misc

RUN addgroup -S app
RUN adduser -S app -G app -u 999 -h /app/
RUN chown -R app:app /app/

USER 999
WORKDIR /app

COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
RUN npm ci --production --no-optional --ignore-scripts

# ensure user can exec the chrome binaries installed into the puppeteer directory
RUN chown -R nodejs:nodejs /app/node_modules/puppeteer

COPY . /app

CMD node index.js
