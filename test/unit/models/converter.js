'use strict';

const assert = require('assert');
const sinon = require('sinon');
const puppeteer = require('puppeteer');
const Converter = require('../../../models/converter');

describe('models/converter', () => {
  const html = '<p>Hello</p>';
  const result = Buffer.from('pdf');
  let browser;
  let page;

  beforeEach(() => {
    page = {
      close: sinon.stub().resolves(),
      setContent: sinon.stub().resolves(),
      pdf: sinon.stub().resolves(result)
    };
    browser = {
      close: sinon.stub().resolves(),
      newPage: sinon.stub().resolves(page),
      on: sinon.stub()
    };
    sinon.stub(puppeteer, 'launch').resolves(browser);
  });

  afterEach(async () => {
    await Converter.close();
    puppeteer.launch.restore();
  });

  it('launches Chromium once across multiple conversions', async () => {
    const converter = new Converter();

    await converter.create(html);
    await converter.create(html);

    assert.equal(puppeteer.launch.callCount, 1);
    assert.equal(browser.newPage.callCount, 2);
  });

  it('closes the page after a successful conversion without closing the browser', async () => {
    const converter = new Converter();

    const data = await converter.create(html);

    assert.deepEqual(data, result);
    assert(page.close.calledOnce);
    assert(browser.close.notCalled);
  });

  it('passes waitUntil only to setContent and PDF options only to pdf', async () => {
    const converter = new Converter();

    await converter.create(html, {
      format: 'Letter',
      printBackground: true,
      waitUntil: 'networkidle0'
    });

    assert(page.setContent.calledWith(html, { waitUntil: 'networkidle0' }));
    assert(page.pdf.calledWith({ format: 'Letter', printBackground: true }));
  });

  it('uses default format and waitUntil options', async () => {
    const converter = new Converter();

    await converter.create(html);

    assert(page.setContent.calledWith(html, { waitUntil: 'load' }));
    assert(page.pdf.calledWith({ format: 'A4' }));
  });

  it('closes the page when PDF generation fails', async () => {
    const converter = new Converter();
    const error = new Error('PDF failed');
    page.pdf.rejects(error);

    await assert.rejects(() => converter.create(html), error);

    assert(page.close.calledOnce);
  });

  it('relaunches Chromium after the browser disconnects', async () => {
    let disconnected;
    browser.on.withArgs('disconnected').callsFake((event, callback) => {
      disconnected = callback;
    });

    const converter = new Converter();
    await converter.create(html);
    disconnected();
    await converter.create(html);

    assert.equal(puppeteer.launch.callCount, 2);
  });
});
