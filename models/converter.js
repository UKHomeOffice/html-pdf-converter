'use strict';

const puppeteer = require('puppeteer');
const debug = require('debug')('pdf:models:converter');
const config = require('../config');

const getLaunchArgs = () => {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage'
  ];

  if (config.ignoreCertificateErrors) {
    args.push('--ignore-certificate-errors');
  }

  return args;
};

module.exports = class PDFConverterModel {
  constructor(options) {
    this.log = (options && options.log) || (() => {});
  }

  blockNetworkRequests(page) {
    return page.setRequestInterception(true)
      .then(() => {
        page.on('request', request => {
          if (request.isInterceptResolutionHandled()) {
            return;
          }
          // data: URLs are inlined content, so allowing them does not reach the network
          if (request.url().startsWith('data:')) {
            request.continue();
            return;
          }
          this.log('warn', `Blocked request from PDF template: ${request.url()}`);
          request.abort('blockedbyclient');
        });
      });
  }

  preparePage(page) {
    return Promise.resolve()
      .then(() => config.disableJavaScript && page.setJavaScriptEnabled(false))
      .then(() => config.blockNetworkRequests && this.blockNetworkRequests(page))
      .then(() => page);
  }

  render(browser, html, options, contentOptions) {
    return browser.newPage()
      .then(page => this.preparePage(page))
      .then(page => {
        return page.setContent(html, contentOptions)
          .then(() => page.pdf(options))
          .then(data => Buffer.from(data, 'base64'));
      });
  }

  create(html, options) {
    const optionsWithFormatAndWaitUntil = Object.assign({
      format: 'A4',
      waitUntil: 'load'
    }, options);

    const contentOptions = { waitUntil: optionsWithFormatAndWaitUntil.waitUntil };

    if (config.renderTimeout) {
      optionsWithFormatAndWaitUntil.timeout = config.renderTimeout;
      contentOptions.timeout = config.renderTimeout;
    }

    return puppeteer.launch({ args: getLaunchArgs() })
      .then(browser => {
        return this.render(browser, html, optionsWithFormatAndWaitUntil, contentOptions)
          .finally(() => browser.close().catch(err => debug('Failed to close browser %o', err)));
      });
  }
};
