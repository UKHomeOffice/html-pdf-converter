'use strict';

const chrome = require('chrome-remote-interface');
const config = require('../config');

module.exports = class PDFConverterModel {

  _connect() {
    return chrome({
      host: config.chrome.host,
      port: config.chrome.port
    });
  }

  create(html) {
    return this._connect()
      .then(client => client.Page.navigate({url: 'about:blank'})
        .then(frame => frame.frameId)
        .then(frameId => client.Page.setDocumentContent({frameId, html}))
        .then(() => client.Page.printToPDF())
        .then(result => {
          client.close();
          return this._parse(result.data);
        })
      );
  }

  _parse(data) {
    return Buffer.from(data, 'base64');
  }

};


