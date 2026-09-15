'use strict';

const { chromium } = require('playwright-core');
const puppeteer = require('puppeteer');

const executablePath = () => {
  return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    puppeteer.executablePath();
};

module.exports = {
  launch: options => chromium.launch(Object.assign({}, options, {
    executablePath: executablePath()
  })),
  newPage: async browser => {
    const context = await browser.newContext();
    const page = await context.newPage();
    return { context, page };
  },
  closePage: async pageState => {
    await pageState.page.close();
    await pageState.context.close();
  }
};
