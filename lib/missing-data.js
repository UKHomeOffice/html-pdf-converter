'use strict';

const _ = require('lodash');
const mustacheRe = /{{\s*[\w.]+\s*}}/g;

// Compares the data to the template placeholders and
// returns a comma separated string of missing items from the data
module.exports = (template, data) => {
  const keys = _.keys(data);
  const list = _.map(template.match(mustacheRe), x => {
    return x.match(/[\w.]+/)[0];
  });
  return _.difference(list, keys);
};