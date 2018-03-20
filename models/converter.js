'use strict';

const puppeteer = require('puppeteer');

module.exports = class PDFConverterModel {

  create(html, options) {

    const opts = {
      args: [
          '--no-sandbox',
          '--disable-setuid-sandbox'
      ]
    };

    options = Object.assign({
      format: 'A4',
      waitUntil: 'networkidle2'
    }, options);

    return puppeteer.launch(opts)
      .then(browser => {
        return browser.newPage()
          .then(page => {
            return page.goto(`data:text/html,${html}`, { waitUntil: options.waitUntil })
              .then(() => page.pdf(options))
              .then(data => Buffer.from(data, 'base64'));
          })
          .then(data => {
            return browser.close()
              .then(() => data);
          });
      });

  }

};


