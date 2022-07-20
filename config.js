'use strict';
try {
  // eslint-disable-next-line implicit-dependencies/no-implicit
  require('dotenv').config();
} catch (e) {
  // noop
}

/* eslint-disable no-process-env */
const config = {
  port: process.env.APP_PORT || process.env.PORT || 8080,
  host: process.env.APP_HOST || 'localhost',
  env: process.env.NODE_ENV,
  loglevel: process.env.LOG_LEVEL,
  limit: process.env.BODY_SIZE_LIMIT || '2mb'
};

module.exports = config;
