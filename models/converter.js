'use strict';

const config = require('../config');
const pdfEngines = {
  playwright: require('./pdf-engines/playwright'),
  puppeteer: require('./pdf-engines/puppeteer')
};

const launchOptions = {
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--ignore-certificate-errors'
  ]
};

const defaultOptions = {
  format: 'A4',
  waitUntil: 'load'
};

const createError = (code, message, status) => {
  const error = new Error();
  error.code = code;
  error.message = message;
  error.status = status;
  return error;
};

const browserUnavailable = error => {
  if (error.code) {
    return error;
  }

  return createError('PdfEngineUnavailable', 'PDF engine is unavailable', 503);
};

const isPdfEngineRuntimeError = error => {
  const text = [error.name, error.code, error.message].filter(Boolean).join(' ');
  return [
    /ProtocolError/i,
    /TargetCloseError/i,
    /TimeoutError/i,
    /Target closed/i,
    /Protocol error/i,
    /browser has disconnected/i,
    /Session closed/i,
    /Connection closed/i
  ].some(pattern => pattern.test(text));
};

const pdfEngineFailed = error => {
  if (error.status || error.code === 'ECONNREFUSED') {
    return error;
  }

  if (isPdfEngineRuntimeError(error)) {
    return createError('PdfEngineFailed', 'PDF engine failed during conversion', 503);
  }

  return error;
};

const now = () => Date.now();

module.exports = class PDFConverterModel {
  static getEngineName() {
    return this.engine || config.pdfEngine;
  }

  static getEngine() {
    const engine = pdfEngines[this.getEngineName()];
    if (!engine) {
      throw createError('InvalidPdfEngine', 'Unsupported PDF engine configured', 500);
    }
    return engine;
  }

  static getBrowser() {
    if (!this.browserPromise) {
      this.engineAdapter = this.getEngine();
      this.browserPromise = this.engineAdapter.launch(launchOptions)
        .then(browser => {
          this.browser = browser;
          if (typeof browser.on === 'function') {
            browser.on('disconnected', () => {
              if (this.browser === browser) {
                this.browser = null;
                this.browserPromise = null;
              }
            });
          }
          return browser;
        })
        .catch(error => {
          this.browser = null;
          this.browserPromise = null;
          throw browserUnavailable(error);
        });
    }

    return this.browserPromise;
  }

  static close() {
    const browser = this.browser;
    this.browser = null;
    this.browserPromise = null;
    this.engineAdapter = null;

    if (browser && typeof browser.close === 'function') {
      return browser.close();
    }

    return Promise.resolve();
  }

  create(html, options, context) {
    const optionsWithDefaults = Object.assign({}, defaultOptions, options);
    const waitUntil = optionsWithDefaults.waitUntil;
    delete optionsWithDefaults.waitUntil;
    const opts = context || {};
    const timings = {};
    const logTimings = error => {
      if (opts.log) {
        opts.log('PDF conversion timings', Object.assign({}, timings, error && { errorCode: error.code }));
      }
    };

    const conversionStarted = now();

    return Promise.resolve().then(async () => {
      let engine;
      let page;
      let pageClosed = false;
      const closePage = async () => {
        if (page && !pageClosed) {
          pageClosed = true;
          const closeStarted = now();
          await engine.closePage(page);
          timings.pageCloseMs = now() - closeStarted;
        }
      };

      try {
        engine = this.constructor.engineAdapter || this.constructor.getEngine();
        const browserStarted = now();
        const browser = await this.constructor.getBrowser();
        timings.browserAcquireMs = now() - browserStarted;

        const pageStarted = now();
        page = await engine.newPage(browser);
        timings.pageCreateMs = now() - pageStarted;

        const contentStarted = now();
        await (page.page || page).setContent(html, { waitUntil });
        timings.setContentMs = now() - contentStarted;

        const pdfStarted = now();
        const data = await (page.page || page).pdf(optionsWithDefaults);
        timings.pdfMs = now() - pdfStarted;
        return Buffer.from(data, 'base64');
      } catch (error) {
        throw pdfEngineFailed(error);
      } finally {
        await closePage().catch(error => {
          timings.pageCloseError = error.code || error.name || 'PageCloseError';
        });
      }
    }).then(data => {
      timings.totalMs = now() - conversionStarted;
      logTimings();
      return data;
    }, error => {
      timings.totalMs = now() - conversionStarted;
      logTimings(error);
      throw error;
    });
  }
};
