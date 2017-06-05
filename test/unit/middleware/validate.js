'use strict';

const validate = require('../../../middleware/validate');
const ValidationError = require('../../../lib/validation-error');

describe('middleware/validate', () => {

  describe('called with no template', () => {

    const req = {
      log: sinon.stub(),
      body: {
        template: undefined
      }
    };
    const res = {};

    it('returns a NoTemplate ValidationError', () =>
      validate(req, res, error => {
        assert.ok(error instanceof Error);
        assert.ok(error instanceof ValidationError);
        assert.equal(error.code, 'NoTemplate');
        assert.equal(error.message, 'Template must be supplied');
      })
    );

  });

  describe('called with a template that is not a string', () => {

    const req = {
      log: sinon.stub(),
      body: {
        template: 1234
      }
    };
    const res = {};

    it('returns a InvalidTemplate ValidationError', () =>
      validate(req, res, error => {
        assert.ok(error instanceof Error);
        assert.ok(error instanceof ValidationError);
        assert.equal(error.code, 'InvalidTemplate');
        assert.equal(error.message, 'Template must be a string');
      })
    );

  });

  describe('called with a mustache template and missing data', () => {

    const req = {
      log: sinon.stub(),
      body: {
        template: '<p>{{content}}</p>',
        data: {}
      }
    };
    const res = {};

    it('returns a MissingData ValidationError and names of missing data', () =>
      validate(req, res, error => {
        assert.ok(error instanceof Error);
        assert.ok(error instanceof ValidationError);
        assert.equal(error.code, 'MissingData');
        assert.equal(error.message, 'Data missing: content');
      })
    );

  });

  describe('called with a HTML template string', () => {

    const req = {
      log: sinon.stub(),
      body: {
        template: '<p>Content</p>'
      }
    };
    const res = {};

    it('Does not return an error', () =>
      validate(req, res, error => {
        assert.ok(error === undefined);
      })
    );

  });

  describe('called with a mustache template with data', () => {

    const req = {
      log: sinon.stub(),
      body: {
        template: '<p>{{content}}</p>',
        data: {
          content: 'My content'
        }
      }
    };
    const res = {};

    it('Does not return an error', () =>
      validate(req, res, error => {
        assert.ok(error === undefined);
      })
    );

  });

});
