'use strict';

const proxyquire = require('proxyquire');
const supertest = require('supertest');
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '../fixtures');

const renderStub = sinon.stub().yields();

const result = Buffer(1);
const clientStub = {
  close: sinon.stub().resolves(),
  newPage: sinon.stub().resolves({
    goto: sinon.stub().resolves(),
    pdf: sinon.stub().resolves(result)
  })
};
const chromeStub = sinon.stub().resolves(clientStub);
chromeStub.onCall(0).rejects({code: 'ECONNREFUSED'});

proxyquire('../../models/converter', {
  'puppeteer': { launch: chromeStub }
});

proxyquire('../../controllers/convert', {
  '../middleware/render': renderStub
});

describe('POSTing to /convert', () => {

  describe('without a template', () => {

    it('returns a NoTemplate, 400 JSON error', () =>
      supertest(require('../../'))
        .post('/convert')
        .expect('Content-type', /json/)
        .expect(400, {
          code: 'NoTemplate',
          message: 'Template must be supplied'
        })
    );

  });

  describe('with a non-string template', () => {

    it('returns a InvalidTemplate, 400 JSON error', () =>
      supertest(require('../../'))
        .post('/convert')
        .send({template: 1234})
        .expect('Content-type', /json/)
        .expect(400, {
          code: 'InvalidTemplate',
          message: 'Template must be a string'
        })
    );

  });

  describe('with a mustache template and incomplete data', () => {

    it('returns a MissingTemplateData, 400 JSON error', () => {
      const template = fs.readFileSync(`${root}/mustache.html`, 'utf-8');

      return supertest(require('../../'))
        .post('/convert')
        .send({
          template: template,
          data: {title: 'My title'}
        })
        .expect('Content-type', /json/)
        .expect(400, {
          code: 'MissingData',
          message: 'Data missing: header,para'
        });
    });

  });

  describe('if the client can\'t connect to chrome', () => {

    it('returns a 400 error', () => {
      const template = fs.readFileSync(`${root}/template.html`, 'utf-8');

      return supertest(require('../../'))
        .post('/convert')
        .send({template: template})
        .expect('Content-type', /json/)
        .expect(400, {
          code: 'ChromeConnectionRefused',
          message: 'Ensure Chrome Headless is running'
        })
        .expect(res => assert.ok(res.error instanceof Error));
    });

  });

  describe('with a valid html string', () => {

    let template = fs.readFileSync(`${root}/template.html`, 'utf-8');

    it('renders the html', () => {
      return supertest(require('../../'))
        .post('/convert')
        .send({template: template})
        .expect(201)
        .expect('Content-type', /octet-stream/)
        .expect(() => assert(renderStub.called));
    });

    it('returns a 201 and a PDF', () => {
      return supertest(require('../../'))
        .post('/convert')
        .send({template: template})
        .expect(201)
        .expect('Content-type', /octet-stream/)
        .expect(res => assert.equal(res.text, result));
    });

    it('can render a mustache template with a complete data set', () => {
      template = fs.readFileSync(`${root}/mustache.html`, 'utf-8');
      return supertest(require('../../'))
        .post('/convert')
        .send({
          template: template,
          data: {
            title: 'My title',
            header: 'My header',
            para: 'My para'
          }
        })
        .expect(201)
        .expect('Content-type', /octet-stream/)
        .expect(res => assert.equal(res.text, result));
    });

  });

});
