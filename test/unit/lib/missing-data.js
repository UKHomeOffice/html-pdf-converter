'use strict';

const path = require('path');
const fs = require('fs');
const missingData = require('../../../lib/missing-data');
const root = path.resolve(__dirname, '../../fixtures');

describe('lib/missing-data', () => {

  describe('called with a HTML string and no data', () => {

    const template = fs.readFileSync(`${root}/template.html`, 'utf-8');
    let missing;

    beforeEach(() => {
      missing = missingData(template);
    });

    it('returns an empty array', () => {
      assert.deepEqual(missing, []);
    });

  });

  describe('called with a HTML string and data', () => {

    const template = fs.readFileSync(`${root}/template.html`, 'utf-8');
    const data = {foo: 'bar'};
    let missing;

    beforeEach(() => {
      missing = missingData(template, data);
    });

    it('returns an empty array', () => {
      assert.deepEqual(missing, []);
    });

  });

  describe('called with a Mustache string and no data', () => {

    const template = fs.readFileSync(`${root}/mustache.html`, 'utf-8');
    let missing;

    beforeEach(() => {
      missing = missingData(template);
    });

    it('returns an array of placeholder items not present in the data', () => {
      assert.deepEqual(missing, ['title', 'header', 'para']);
    });

  });

  describe('called with a Mustache string and some data', () => {

    const template = fs.readFileSync(`${root}/mustache.html`, 'utf-8');
    const data = {title: 'My title', para: 'My paragraph'};
    let missing;

    beforeEach(() => {
      missing = missingData(template, data);
    });

    it('returns an array of placeholder items not present in the data', () => {
      assert.deepEqual(missing, ['header']);
    });

  });

});
