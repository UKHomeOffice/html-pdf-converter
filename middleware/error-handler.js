'use strict';

const debug = require('debug')('pdf:middleware:errorhandler');

// eslint-disable-next-line no-unused-vars
module.exports = (error, req, res, next) => {
  debug('Handling %o', error);
  if (error.code === 'ECONNREFUSED') {
    error.code = 'ChromeConnectionRefused';
    error.message = 'Ensure Chrome Headless is running';
  }
  if (error.code) {
    res.status(400);
  } else {
    res.status(500);
  }
  req.log('error', 'html-pdf-converter: Handling error', error);
  res.json(error);
};