'use strict';

module.exports = class ValidationError extends Error {

  constructor(options) {
    const error = super();
    error.code = options.code;
    error.message = options.message;
  }

};
