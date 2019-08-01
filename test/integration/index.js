'use strict';

const supertest = require('supertest');
const puppeteer = require('puppeteer');
const mustache = require('mustache');
const path = require('path');
const fs = require('fs');
const fixtures = path.resolve(__dirname, '../fixtures');

const template = fs.readFileSync(`${fixtures}/template.html`, 'utf-8');
const mustacheTemplate = fs.readFileSync(`${fixtures}/mustache.html`, 'utf-8');

const App = require('../../');
const result = Buffer(1);

describe('POSTing to /convert', () => {

  let pdfStub;
  let setContentStub;

  beforeEach(() => {
    pdfStub = sinon.stub().resolves(result);
    setContentStub = sinon.stub().resolves();
    const clientStub = {
      close: sinon.stub().resolves(),
      newPage: sinon.stub().resolves({
        setContent: setContentStub,
        pdf: pdfStub
      })
    };
    sinon.stub(puppeteer, 'launch').resolves(clientStub);
    sinon.spy(mustache, 'render');
  });

  afterEach(() => {
    puppeteer.launch.restore();
    mustache.render.restore();
  });

  describe('without a template', () => {

    it('returns a NoTemplate, 400 JSON error', () =>
      supertest(App)
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
      supertest(App)
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
      return supertest(App)
        .post('/convert')
        .send({
          template: mustacheTemplate,
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

    beforeEach(() => {
      puppeteer.launch.rejects({ code: 'ECONNREFUSED' });
    });

    it('returns a 400 error', () => {
      return supertest(App)
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

    it('renders the html', () => {
      return supertest(App)
        .post('/convert')
        .send({template: template})
        .expect(201)
        .expect('Content-type', /octet-stream/)
        .expect(() => assert(mustache.render.calledOnce));
    });

    it('returns a 201 and a PDF', () => {
      return supertest(App)
        .post('/convert')
        .send({template: template})
        .expect(201)
        .expect('Content-type', /octet-stream/)
        .expect(res => assert.equal(res.text, result));
    });

    it('can render a mustache template with a complete data set', () => {
      return supertest(App)
        .post('/convert')
        .send({
          template: mustacheTemplate,
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

    it('passes pdf render options to pdf method if defined', () => {
      return supertest(require('../../'))
        .post('/convert')
        .send({ template: template, pdfOptions: { printBackgrounds: true } })
        .expect(201)
        .expect('Content-type', /octet-stream/)
        .expect(() => {
          assert(pdfStub.calledOnce);
          assert(pdfStub.calledWith(sinon.match({ format: 'A4', printBackgrounds: true })));
        });
    });

    it('respects custom waitUntil option if defined', () => {
      return supertest(require('../../'))
        .post('/convert')
        .send({ template: template, pdfOptions: { waitUntil: 'networkidle0' } })
        .expect(201)
        .expect('Content-type', /octet-stream/)
        .expect(() => {
          assert(setContentStub.calledOnce);
          assert(setContentStub.calledWith(sinon.match.string, { waitUntil: 'networkidle0' }));
        });
    });

    it('waits for load event by default', () => {
      return supertest(require('../../'))
        .post('/convert')
        .send({ template: template })
        .expect(201)
        .expect('Content-type', /octet-stream/)
        .expect(() => {
          assert(setContentStub.calledOnce);
          assert(setContentStub.calledWith(sinon.match.string, { waitUntil: 'load' }));
        });
    });

  });

});
