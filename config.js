'use strict';
try {
  require('dotenv').config();
} catch (e) {
  // noop
}

/* eslint-disable no-process-env */
const positiveInteger = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return parsed > 0 ? parsed : fallback;
};

const config = {
  port: process.env.APP_PORT || process.env.PORT || 8080,
  host: process.env.APP_HOST || 'localhost',
  env: process.env.NODE_ENV,
  loglevel: process.env.LOG_LEVEL,
  limit: process.env.BODY_SIZE_LIMIT || '2mb',
  pdfEngine: process.env.PDF_ENGINE || 'puppeteer',
  pdfConcurrency: positiveInteger(process.env.PDF_CONCURRENCY, 2),
  pdfQueueSize: positiveInteger(process.env.PDF_QUEUE_SIZE, 20),
  pdfTimeoutMs: positiveInteger(process.env.PDF_TIMEOUT_MS, 30000)
};

module.exports = config;
