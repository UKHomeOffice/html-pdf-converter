'use strict';

const puppeteer = require('puppeteer');

module.exports = class PDFConverterModel {

  create(html) {

    const opts = {
      args: [
          '--no-sandbox',
          '--disable-setuid-sandbox'
      ]
    };
    return puppeteer.launch(opts)
      .then(browser => {
        return browser.newPage()
          .then(page => {
            return page.goto(`data:text/html,${html}`, {waitUntil: 'networkidle2' })
              .then(() => page.pdf({ format: 'A4' }))
              .then(data => Buffer.from(data, 'base64'));
          })
          .then(data => {
            return browser.close()
              .then(() => data);
          });
      });

  }

};


