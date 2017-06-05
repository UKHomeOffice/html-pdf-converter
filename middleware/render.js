'use strict';

const debug = require('debug')('middleware:render');
const mustache = require('mustache');

module.exports = (req, res, next) => {
  req.log('debug', 'Rendering HTML');
  const template = req.body.template;
  const data = req.body.data;
  try {
    debug('Rendering %s', template);
    const rendered = mustache.render(template, data);
    res.locals.html = rendered;
    next();
  } catch (error) {
    debug('Error when rendering: %s', error);
    next(error);
  }
};
