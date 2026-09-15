'use strict';

const config = require('../config');
const puppeteer = require('puppeteer');

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

const now = () => Date.now();

module.exports = class PDFConverterModel {
  static getBrowser() {
    if (!this.browserPromise) {
      this.browserPromise = puppeteer.launch(launchOptions)
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
          throw error;
        });
    }

    return this.browserPromise;
  }

  static close() {
    const browser = this.browser;
    this.browser = null;
    this.browserPromise = null;
    this.activeCount = 0;
    this.queue = [];

    if (browser && typeof browser.close === 'function') {
      return browser.close();
    }

    return Promise.resolve();
  }

  static getConcurrency() {
    return this.concurrency || config.pdfConcurrency;
  }

  static getQueueSize() {
    return this.queueSize || config.pdfQueueSize;
  }

  static getTimeoutMs() {
    return this.timeoutMs || config.pdfTimeoutMs;
  }

  static getStats() {
    return {
      active: this.activeCount || 0,
      queued: this.queue ? this.queue.length : 0
    };
  }

  static runNext() {
    const next = this.queue && this.queue.shift();
    if (next) {
      next.run();
    }
  }

  static queueConversion(task, options) {
    const opts = options || {};
    const timings = opts.timings || {};
    const queuedAt = now();
    const timeoutMs = opts.timeoutMs || this.getTimeoutMs();
    if (!this.queue) {
      this.queue = [];
    }
    if (!this.activeCount) {
      this.activeCount = 0;
    }
    const Model = this;

    return new Promise((resolve, reject) => {
      let settled = false;
      const state = {
        onAbort: null,
        timeout: null
      };
      const entry = {
        abort: null,
        abortError: null,
        abortHandler: null,
        run: null,
        started: false
      };

      const cleanup = () => {
        clearTimeout(state.timeout);
        if (state.onAbort && opts.signal && typeof opts.signal.removeEventListener === 'function') {
          opts.signal.removeEventListener('abort', state.onAbort);
        }
      };

      const settle = (callback, value) => {
        if (!settled) {
          settled = true;
          timings.totalMs = now() - queuedAt;
          cleanup();
          callback(value);
        }
      };

      const removeFromQueue = () => {
        const index = Model.queue.indexOf(entry);
        if (index !== -1) {
          Model.queue.splice(index, 1);
        }
      };

      const rejectConversion = error => {
        timings.errorCode = error.code;
        settle(reject, error);
      };

      const abortQueuedOrRunning = error => {
        entry.abortError = error;
        if (entry.started) {
          entry.abort(error);
        } else {
          removeFromQueue();
          rejectConversion(error);
        }
      };

      state.onAbort = () => {
        abortQueuedOrRunning(createError('ClientAborted', 'Client aborted PDF conversion', 499));
      };

      const run = () => {
        let abortTask;
        const abortPromise = new Promise((unused, rejectAbort) => {
          abortTask = rejectAbort;
        });
        entry.started = true;
        Model.activeCount++;

        timings.queueMs = now() - queuedAt;
        timings.activeCount = Model.activeCount;
        timings.queuedCount = Model.queue.length;

        entry.abort = error => {
          Promise.resolve(entry.abortHandler && entry.abortHandler(error))
            .then(() => abortTask(error), () => abortTask(error));
        };

        Promise.race([
          Promise.resolve().then(() => task({
            setAbortHandler: handler => {
              entry.abortHandler = handler;
            },
            throwIfAborted: () => {
              if (entry.abortError) {
                throw entry.abortError;
              }
            }
          })),
          abortPromise
        ])
          .then(data => settle(resolve, data), rejectConversion)
          .finally(() => {
            Model.activeCount--;
            Model.runNext();
          });
      };

      entry.abort = error => rejectConversion(error);
      entry.run = run;
      state.timeout = setTimeout(() => abortQueuedOrRunning(createError(
        'PdfConversionTimeout',
        'PDF conversion timed out',
        504
      )), timeoutMs);

      if (opts.signal && opts.signal.aborted) {
        rejectConversion(createError('ClientAborted', 'Client aborted PDF conversion', 499));
        return;
      }

      if (opts.signal && typeof opts.signal.addEventListener === 'function') {
        opts.signal.addEventListener('abort', state.onAbort, { once: true });
      }

      if (this.activeCount < this.getConcurrency()) {
        run();
      } else if (this.queue.length >= this.getQueueSize()) {
        rejectConversion(createError('PdfQueueFull', 'PDF conversion queue is full', 503));
      } else {
        this.queue.push(entry);
      }
    });
  }

  create(html, options, context) {
    const optionsWithDefaults = Object.assign({}, defaultOptions, options);
    const waitUntil = optionsWithDefaults.waitUntil;
    delete optionsWithDefaults.waitUntil;
    const opts = context || {};
    const timings = {};
    const logTimings = error => {
      if (opts.log) {
        opts.log('PDF conversion timings', Object.assign({
          activeCount: this.constructor.getStats().active,
          queuedCount: this.constructor.getStats().queued
        }, timings, error && { errorCode: error.code }));
      }
    };

    return this.constructor.queueConversion(async task => {
      let page;
      let pageClosed = false;
      const closePage = async () => {
        if (page && !pageClosed) {
          pageClosed = true;
          const closeStarted = now();
          await page.close();
          timings.pageCloseMs = now() - closeStarted;
        }
      };

      task.setAbortHandler(closePage);
      task.throwIfAborted();

      try {
        const browserStarted = now();
        const browser = await this.constructor.getBrowser();
        timings.browserAcquireMs = now() - browserStarted;
        task.throwIfAborted();

        const pageStarted = now();
        page = await browser.newPage();
        timings.pageCreateMs = now() - pageStarted;
        task.throwIfAborted();

        const contentStarted = now();
        await page.setContent(html, { waitUntil });
        timings.setContentMs = now() - contentStarted;
        task.throwIfAborted();

        const pdfStarted = now();
        const data = await page.pdf(optionsWithDefaults);
        timings.pdfMs = now() - pdfStarted;
        return Buffer.from(data, 'base64');
      } finally {
        await closePage();
      }
    }, {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs || this.constructor.getTimeoutMs(),
      timings
    }).then(data => {
      logTimings();
      return data;
    }, error => {
      logTimings(error);
      throw error;
    });
  }
};
