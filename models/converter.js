'use strict';

const puppeteer = require('puppeteer');

module.exports = class PDFConverterModel {

  create(html, options) {

    const opts = {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--ignore-certificate-errors'
      ]
    };

    const optionsWithFormatAndWaitUntil = Object.assign({
      format: 'A4',
      waitUntil: 'load'
    }, options);

    return puppeteer.launch(opts)
      .then(browser => {
        return browser.newPage()
          .then(page => {
            return page.setContent(html, { waitUntil: optionsWithFormatAndWaitUntil.waitUntil })
              .then(() => page.pdf(optionsWithFormatAndWaitUntil))
              .then(data => Buffer.from(data, 'base64'));
          })
          .then(data => {
            return browser.close()
              .then(() => data);
          });
      });

  }

};
