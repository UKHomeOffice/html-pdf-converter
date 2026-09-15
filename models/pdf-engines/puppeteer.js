'use strict';

const puppeteer = require('puppeteer');

module.exports = {
  launch: options => puppeteer.launch(options),
  newPage: async browser => {
    if (typeof browser.createBrowserContext === 'function') {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      return { context, page };
    }

    if (typeof browser.createIncognitoBrowserContext === 'function') {
      const context = await browser.createIncognitoBrowserContext();
      const page = await context.newPage();
      return { context, page };
    }

    return browser.newPage();
  },
  closePage: async pageState => {
    if (pageState.context) {
      await pageState.page.close();
      await pageState.context.close();
      return;
    }

    await pageState.close();
  }
};
