'use strict';

const assert = require('assert');
const http = require('http');
const puppeteer = require('puppeteer');
const config = require('../../config');
const Model = require('../../models/converter');

// Renders with a real Chromium, so it is skipped where no browser can be launched.
describe('network access from a real browser', function () {
  this.timeout(60000);

  let server;
  let requests;
  let html;
  let original;

  before(function () {
    return puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] })
      .then(browser => browser.close())
      .catch(() => this.skip());
  });

  before(done => {
    requests = [];
    server = http.createServer((req, res) => {
      requests.push(req.url);
      res.end();
    }).listen(0, '127.0.0.1', () => {
      const origin = `http://127.0.0.1:${server.address().port}`;
      html = `<html>
        <head><link rel="stylesheet" href="${origin}/style.css"></head>
        <body>
          <img src="${origin}/image.png">
          <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
          <iframe src="${origin}/frame"></iframe>
          <script>fetch('${origin}/script')</script>
        </body>
      </html>`;
      done();
    });
  });

  after(() => server && server.close());

  beforeEach(() => {
    requests.length = 0;
    original = { blockNetworkRequests: config.blockNetworkRequests, disableJavaScript: config.disableJavaScript };
  });

  afterEach(() => Object.assign(config, original));

  it('fetches resources in the template by default', () => {
    config.blockNetworkRequests = false;
    config.disableJavaScript = false;
    return new Model().create(html).then(data => {
      assert.equal(data.subarray(0, 4).toString(), '%PDF');
      assert(requests.length > 0);
    });
  });

  it('makes no requests when BLOCK_NETWORK_REQUESTS and DISABLE_JAVASCRIPT are enabled', () => {
    config.blockNetworkRequests = true;
    config.disableJavaScript = true;
    return new Model().create(html).then(data => {
      assert.equal(data.subarray(0, 4).toString(), '%PDF');
      assert.deepEqual(requests, []);
    });
  });

  it('makes no requests when only BLOCK_NETWORK_REQUESTS is enabled', () => {
    config.blockNetworkRequests = true;
    config.disableJavaScript = false;
    return new Model().create(html).then(() => assert.deepEqual(requests, []));
  });
});
