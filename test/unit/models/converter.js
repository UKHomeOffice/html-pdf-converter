'use strict';

const assert = require('assert');
const sinon = require('sinon');
const puppeteer = require('puppeteer');
const { chromium } = require('playwright-core');
const Converter = require('../../../models/converter');

describe('models/converter', () => {
  const html = '<p>Hello</p>';
  const result = Buffer.from('pdf');
  let browser;
  let context;
  let page;

  beforeEach(() => {
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = '/usr/bin/chromium-browser';
    Converter.engine = 'puppeteer';
    page = {
      close: sinon.stub().resolves(),
      setContent: sinon.stub().resolves(),
      pdf: sinon.stub().resolves(result)
    };
    context = {
      close: sinon.stub().resolves(),
      newPage: sinon.stub().resolves(page)
    };
    browser = {
      close: sinon.stub().resolves(),
      createBrowserContext: sinon.stub().resolves(context),
      newPage: sinon.stub().resolves(page),
      on: sinon.stub()
    };
    sinon.stub(puppeteer, 'launch').resolves(browser);
  });

  afterEach(async () => {
    await Converter.close();
    Converter.engine = null;
    delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    puppeteer.launch.restore();
    if (chromium.launch.restore) {
      chromium.launch.restore();
    }
  });

  it('launches Chromium once across multiple conversions', async () => {
    const converter = new Converter();

    await converter.create(html);
    await converter.create(html);

    assert.equal(puppeteer.launch.callCount, 1);
    assert.equal(browser.createBrowserContext.callCount, 2);
    assert.equal(context.newPage.callCount, 2);
  });

  it('closes the page and context after a successful conversion without closing the browser', async () => {
    const converter = new Converter();

    const data = await converter.create(html);

    assert.deepEqual(data, result);
    assert(page.close.calledOnce);
    assert(context.close.calledOnce);
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
    assert(context.close.calledOnce);
  });

  it('does not mask PDF failures when page cleanup also fails', async () => {
    const converter = new Converter();
    const error = new Error('PDF failed');
    page.pdf.rejects(error);
    page.close.rejects(new Error('close failed'));

    await assert.rejects(() => converter.create(html), error);

    assert(page.close.calledOnce);
  });

  it('returns a safe error when Chromium fails during conversion', async () => {
    const converter = new Converter();
    const error = new Error('Protocol error (Page.printToPDF): Printing failed');
    error.name = 'ProtocolError';
    page.pdf.rejects(error);

    await assert.rejects(
      () => converter.create(html),
      err => err.code === 'PdfEngineFailed' && err.status === 503
    );
  });

  it('returns a safe error when the PDF engine is unavailable', async () => {
    const converter = new Converter();
    puppeteer.launch.rejects(new Error('spawn failed'));

    await assert.rejects(
      () => converter.create(html),
      error => error.code === 'PdfEngineUnavailable' && error.status === 503
    );
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

  it('can use Playwright as a configured PDF engine', async () => {
    Converter.engine = 'playwright';
    const playwrightContext = {
      close: sinon.stub().resolves(),
      newPage: sinon.stub().resolves(page)
    };
    const playwrightBrowser = {
      close: sinon.stub().resolves(),
      newContext: sinon.stub().resolves(playwrightContext),
      on: sinon.stub()
    };
    sinon.stub(chromium, 'launch').resolves(playwrightBrowser);

    const converter = new Converter();
    const data = await converter.create(html);

    assert.deepEqual(data, result);
    assert(puppeteer.launch.notCalled);
    assert(chromium.launch.calledOnce);
    assert(playwrightContext.newPage.calledOnce);
    assert(page.setContent.calledWith(html, { waitUntil: 'load' }));
    assert(page.pdf.calledWith({ format: 'A4' }));
    assert(page.close.calledOnce);
    assert(playwrightContext.close.calledOnce);
  });
});
