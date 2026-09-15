'use strict';

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

    if (browser && typeof browser.close === 'function') {
      return browser.close();
    }

    return Promise.resolve();
  }

  create(html, options) {
    const optionsWithDefaults = Object.assign({}, defaultOptions, options);
    const waitUntil = optionsWithDefaults.waitUntil;
    delete optionsWithDefaults.waitUntil;

    return this.constructor.getBrowser()
      .then(browser => browser.newPage())
      .then(page => {
        return page.setContent(html, { waitUntil })
          .then(() => page.pdf(optionsWithDefaults))
          .then(data => Buffer.from(data, 'base64'))
          .finally(() => page.close());
      });
  }
};
