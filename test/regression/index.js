'use strict';

const supertest = require('supertest');
const path = require('path');
const fs = require('fs');

const files = fs.readdirSync(path.resolve(__dirname, './inputs'));

const cleanMetadata = str => {
  return str
    .replace(/CreationDate \(.+\)/, 'CreationDate ()')
    .replace(/ModDate \(.+\)/, 'ModDate ()');
};

describe('regression tests', () => {

  files.forEach(file => {

    it(file, () => {
      const target = path.resolve(__dirname, './outputs', file.replace('.json', '.pdf'));
      const expected = fs.readFileSync(target).toString('utf8');
      return supertest(require('../../'))
        .post('/convert')
        .send(require(path.resolve(__dirname, './inputs', file)))
        .expect(201)
        .then(res => {
          assert.equal(cleanMetadata(expected), cleanMetadata(res.text));
        });
    });

  });

});
