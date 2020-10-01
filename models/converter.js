'use strict';
const express = require('express');
const puppeteer = require('puppeteer');

module.exports = class PDFConverterModel {

  create(html, options) {

    const opts = {
      args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
      ]
    };

    options = Object.assign({
      format: 'A4',
      waitUntil: 'load'
    }, options);

    const listen = () => {
      return new Promise((resolve, reject) => {
        const app = express();
        app.get('/', (req, res) => res.type('html').send(html));
        const server = app.listen(0, err => {
          return err ? reject(err) : resolve(server);
        });
      });
    };

    return listen()
      .then(server => {
        return puppeteer.launch(opts)
          .then(browser => {
            return browser.newPage()
              .then(page => {
                return page.goto(`http://localhost:${server.address().port}`, { waitUntil: options.waitUntil })
                  .then(() => page.pdf(options))
                  .then(data => Buffer.from(data, 'base64'));
              })
              .finally(() => {
                browser.close();
                server.close();
              });
          });
      });

  }

};


