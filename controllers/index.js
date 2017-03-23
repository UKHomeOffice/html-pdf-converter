'use strict';

const router = require('express').Router();
const debug = require('debug')('controllers:index');
const render = require('../middleware/render');
const validate = require('../middleware/validate');
const Model = require('../models');

module.exports = router.post('/',
  validate,
  render,
  (req, res, next) => {

    debug('Validated and rendered %s', res.locals.html);

    const model = new Model();
    model.create(res.locals.html).then(data => {
      res.setHeader('Content-Type', 'octet-stream');
      res.status(201).send(data);
    }).catch(err => {
      next(err);
    });
  });

