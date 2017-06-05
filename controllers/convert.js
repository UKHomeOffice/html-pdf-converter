'use strict';

const router = require('express').Router();
const debug = require('debug')('controllers:index');
const render = require('../middleware/render');
const validate = require('../middleware/validate');
const Model = require('../models/converter');

module.exports = router.post('/',
  validate,
  render,
  (req, res, next) => {

    debug('Validated and rendered %s', res.locals.html);

    const model = new Model();

    req.log('debug', 'Creating PDF');

    model.create(res.locals.html).then(data => {
      req.log('debug', 'Created PDF');
      res.setHeader('Content-Type', 'octet-stream');
      res.status(201).send(data);
    }).catch(err => {
      req.log('error', 'Failed creating PDF', err);
      next(err);
    });
  });

