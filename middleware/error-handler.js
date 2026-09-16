'use strict';

const debug = require('debug')('pdf:middleware:errorhandler');

// eslint-disable-next-line no-unused-vars
module.exports = (error, req, res, next) => {
  debug('Handling %o', error);
  if (error.code === 'ECONNREFUSED') {
    error.code = 'ChromeConnectionRefused';
    error.message = 'Ensure Chrome Headless is running';
  }
  let status;
  if (error.status) {
    status = error.status;
  } else if (error.code) {
    status = 400;
  } else {
    status = 500;
  }
  res.status(status);
  req.log('error', 'html-pdf-converter: Handling error', error);
  res.json({
    code: error.code || 'InternalServerError',
    message: status < 500 || error.status ? error.message : 'Internal Server Error',
    ...(error.status && { status: error.status })
  });
};
