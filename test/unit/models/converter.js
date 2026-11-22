'use strict';

const sinon = require('sinon');
const assert = require('assert');
const puppeteer = require('puppeteer');
const config = require('../../../config');
const Model = require('../../../models/converter');

const settings = ['blockNetworkRequests', 'disableJavaScript', 'ignoreCertificateErrors', 'renderTimeout'];

describe('models/converter', () => {
  let original;
  let page;
  let browser;

  const createRequest = url => ({
    url: sinon.stub().returns(url),
    isInterceptResolutionHandled: sinon.stub().returns(false),
    continue: sinon.stub(),
    abort: sinon.stub()
  });

  beforeEach(() => {
    original = settings.reduce((values, key) => Object.assign(values, { [key]: config[key] }), {});
    config.blockNetworkRequests = false;
    config.disableJavaScript = false;
    config.ignoreCertificateErrors = true;
    config.renderTimeout = undefined;

    page = {
      setContent: sinon.stub().resolves(),
      pdf: sinon.stub().resolves(Buffer.from('pdf')),
      setRequestInterception: sinon.stub().resolves(),
      setJavaScriptEnabled: sinon.stub().resolves(),
      on: sinon.stub()
    };
    browser = {
      newPage: sinon.stub().resolves(page),
      close: sinon.stub().resolves()
    };
    sinon.stub(puppeteer, 'launch').resolves(browser);
  });

  afterEach(() => {
    Object.assign(config, original);
    puppeteer.launch.restore();
  });

  describe('with default settings', () => {
    it('keeps the existing browser behaviour', () =>
      new Model().create('<p>Hello</p>').then(() => {
        const args = puppeteer.launch.firstCall.args[0].args;
        assert(args.includes('--ignore-certificate-errors'));
        assert(page.setRequestInterception.notCalled);
        assert(page.setJavaScriptEnabled.notCalled);
        assert(page.setContent.calledWithExactly('<p>Hello</p>', { waitUntil: 'load' }));
        assert(page.pdf.calledWithExactly({ format: 'A4', waitUntil: 'load' }));
        assert(browser.close.calledOnce);
      })
    );
  });

  describe('when IGNORE_CERTIFICATE_ERRORS is false', () => {
    it('does not launch the browser with --ignore-certificate-errors', () => {
      config.ignoreCertificateErrors = false;
      return new Model().create('<p>Hello</p>').then(() => {
        const args = puppeteer.launch.firstCall.args[0].args;
        assert(!args.includes('--ignore-certificate-errors'));
      });
    });
  });

  describe('when DISABLE_JAVASCRIPT is true', () => {
    it('disables JavaScript before setting the content', () => {
      config.disableJavaScript = true;
      return new Model().create('<p>Hello</p>').then(() => {
        assert(page.setJavaScriptEnabled.calledOnceWithExactly(false));
        assert(page.setJavaScriptEnabled.calledBefore(page.setContent));
      });
    });
  });

  describe('when BLOCK_NETWORK_REQUESTS is true', () => {
    let log;
    let onRequest;

    beforeEach(() => {
      config.blockNetworkRequests = true;
      log = sinon.stub();
      return new Model({ log }).create('<p>Hello</p>').then(() => {
        onRequest = page.on.withArgs('request').firstCall.args[1];
      });
    });

    it('enables request interception before setting the content', () => {
      assert(page.setRequestInterception.calledOnceWithExactly(true));
      assert(page.setRequestInterception.calledBefore(page.setContent));
    });

    it('allows data: URLs', () => {
      const request = createRequest('data:image/png;base64,AAAA');
      onRequest(request);
      assert(request.continue.calledOnce);
      assert(request.abort.notCalled);
    });

    ['http://169.254.169.254/latest/meta-data/', 'https://example.com/image.png', 'file:///etc/passwd'].forEach(url => {
      it(`blocks and logs ${url.split(':')[0]} requests`, () => {
        const request = createRequest(url);
        onRequest(request);
        assert(request.abort.calledOnceWithExactly('blockedbyclient'));
        assert(request.continue.notCalled);
        assert(log.calledWith('warn', sinon.match(url)));
      });
    });

    it('ignores requests that have already been handled', () => {
      const request = createRequest('https://example.com/image.png');
      request.isInterceptResolutionHandled.returns(true);
      onRequest(request);
      assert(request.abort.notCalled);
      assert(request.continue.notCalled);
    });
  });

  describe('when RENDER_TIMEOUT is set', () => {
    it('applies the timeout to setting the content and creating the PDF', () => {
      config.renderTimeout = 10000;
      return new Model().create('<p>Hello</p>', { timeout: 60000 }).then(() => {
        assert(page.setContent.calledWith(sinon.match.string, { waitUntil: 'load', timeout: 10000 }));
        assert(page.pdf.calledWith(sinon.match({ timeout: 10000 })));
      });
    });
  });

  describe('when rendering fails', () => {
    it('closes the browser and rejects with the rendering error', () => {
      const error = new Error('Navigation timeout');
      page.setContent.rejects(error);
      return new Model().create('<p>Hello</p>').then(
        () => assert.fail('Expected create to reject'),
        err => {
          assert.equal(err, error);
          assert(browser.close.calledOnce);
        }
      );
    });

    it('rejects with the rendering error if closing the browser also fails', () => {
      const error = new Error('Navigation timeout');
      page.setContent.rejects(error);
      browser.close.rejects(new Error('Close failed'));
      return new Model().create('<p>Hello</p>').then(
        () => assert.fail('Expected create to reject'),
        err => assert.equal(err, error)
      );
    });
  });
});
