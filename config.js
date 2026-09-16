'use strict';
try {
  require('dotenv').config();
} catch (e) {
  // noop
}

const config = {
  port: process.env.APP_PORT || process.env.PORT || 8080,
  host: process.env.APP_HOST || 'localhost',
  env: process.env.NODE_ENV,
  loglevel: process.env.LOG_LEVEL,
  limit: process.env.BODY_SIZE_LIMIT || '2mb',
  pdfEngine: process.env.PDF_ENGINE || 'puppeteer'
};

module.exports = config;
