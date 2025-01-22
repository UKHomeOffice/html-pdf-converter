'use strict';
/* eslint-disable consistent-return */
module.exports = class ValidationError extends Error {
  constructor(options) {
    const error = super();
    error.code = options.code;
    error.message = options.message;
  }
};
