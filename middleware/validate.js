'use strict';

const missingData = require('../lib/missing-data');
const debug = require('debug')('pdf:middleware:validate');
const ValidationError = require('../lib/validation-error');

module.exports = (req, res, next) => {
  if (req.body.noRender) {
    return next();
  }
  req.log('debug', 'Validating request');
  const template = req.body.template;
  let missing;

  debug('Validating template: %s', template);

  if (!template) {
    return next(new ValidationError({
      code: 'NoTemplate',
      message: 'Template must be supplied'
    }));
  }

  if (typeof template !== 'string') {
    return next(new ValidationError({
      code: 'InvalidTemplate',
      message: 'Template must be a string'
    }));
  }

  const missing = missingData(template, req.body.data);
  if (missing.length > 0) {
    return next(new ValidationError({
      code: 'MissingData',
      message: `Data missing: ${missing}`
    }));
  }

  next();
};
