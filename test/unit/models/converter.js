'use strict';

const assert = require('assert');
const sinon = require('sinon');
const puppeteer = require('puppeteer');
const { chromium } = require('playwright-core');
const Converter = require('../../../models/converter');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => {
    resolve = done;
  });

  return { promise, resolve };
};

const createPage = pdfResult => ({
  close: sinon.stub().resolves(),
  setContent: sinon.stub().resolves(),
  pdf: sinon.stub().returns(pdfResult)
});

const waitForQueue = () => Promise.resolve().then(() => Promise.resolve());

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
    Converter.concurrency = null;
    Converter.engine = null;
    Converter.queueSize = null;
    Converter.timeoutMs = null;
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

  it('limits active conversions to the configured concurrency', async () => {
    Converter.concurrency = 1;
    const firstPdf = deferred();
    const firstPage = createPage(firstPdf.promise);
    const secondPage = createPage(Promise.resolve(result));
    browser.createBrowserContext.onFirstCall().resolves({
      close: sinon.stub().resolves(),
      newPage: sinon.stub().resolves(firstPage)
    });
    browser.createBrowserContext.onSecondCall().resolves({
      close: sinon.stub().resolves(),
      newPage: sinon.stub().resolves(secondPage)
    });

    const converter = new Converter();
    const firstConversion = converter.create(html);
    const secondConversion = converter.create(html);

    await waitForQueue();

    assert.equal(browser.createBrowserContext.callCount, 1);

    firstPdf.resolve(result);
    await firstConversion;
    await secondConversion;

    assert.equal(browser.createBrowserContext.callCount, 2);
    assert(firstPage.close.calledOnce);
    assert(secondPage.close.calledOnce);
  });

  it('rejects new conversions when the queue is full', async () => {
    Converter.concurrency = 1;
    Converter.queueSize = 1;
    const firstPdf = deferred();
    browser.createBrowserContext.onFirstCall().resolves({
      close: sinon.stub().resolves(),
      newPage: sinon.stub().resolves(createPage(firstPdf.promise))
    });

    const converter = new Converter();
    const firstConversion = converter.create(html);
    const queuedConversion = converter.create(html);

    await waitForQueue();

    await assert.rejects(
      () => converter.create(html),
      error => error.code === 'PdfQueueFull' && error.status === 503
    );

    firstPdf.resolve(result);
    await firstConversion;
    await queuedConversion;
  });

  it('removes queued conversions when the client aborts', async () => {
    Converter.concurrency = 1;
    Converter.queueSize = 1;
    const firstPdf = deferred();
    browser.createBrowserContext.onFirstCall().resolves({
      close: sinon.stub().resolves(),
      newPage: sinon.stub().resolves(createPage(firstPdf.promise))
    });
    browser.createBrowserContext.onSecondCall().resolves({
      close: sinon.stub().resolves(),
      newPage: sinon.stub().resolves(createPage(Promise.resolve(result)))
    });
    const abortController = new AbortController();

    const converter = new Converter();
    const firstConversion = converter.create(html);
    const queuedConversion = converter.create(html, null, { signal: abortController.signal });

    await waitForQueue();
    const queuedError = assert.rejects(queuedConversion, error => error.code === 'ClientAborted');
    abortController.abort();
    await queuedError;

    const replacementConversion = converter.create(html);
    firstPdf.resolve(result);
    await firstConversion;
    await replacementConversion;

    assert.equal(browser.createBrowserContext.callCount, 2);
  });

  it('closes the running page when the client aborts', async () => {
    const pdf = deferred();
    const runningPage = createPage(pdf.promise);
    const abortController = new AbortController();
    browser.createBrowserContext.resolves({
      close: sinon.stub().resolves(),
      newPage: sinon.stub().resolves(runningPage)
    });

    const converter = new Converter();
    const conversion = converter.create(html, null, { signal: abortController.signal });

    await waitForQueue();
    const aborted = assert.rejects(conversion, error => error.code === 'ClientAborted');
    abortController.abort();

    await aborted;
    assert(runningPage.close.calledOnce);
  });

  it('times out running conversions and closes the page', async () => {
    Converter.timeoutMs = 1;
    const clock = sinon.useFakeTimers();
    const pdf = deferred();
    const runningPage = createPage(pdf.promise);
    browser.createBrowserContext.resolves({
      close: sinon.stub().resolves(),
      newPage: sinon.stub().resolves(runningPage)
    });

    const converter = new Converter();
    const conversion = converter.create(html);

    await waitForQueue();
    const timedOut = assert.rejects(conversion, error => error.code === 'PdfConversionTimeout' && error.status === 504);
    await clock.tickAsync(1);

    await timedOut;
    assert(runningPage.close.calledOnce);
    clock.restore();
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
