'use strict';

/* eslint-disable no-console */

const Converter = require('../models/converter');

const round = value => Math.round(value * 100) / 100;

const main = async () => {
  const converter = new Converter();
  const started = process.hrtime.bigint();
  const data = await converter.create(`
    <!doctype html>
    <html>
      <head><title>PDF smoke test</title></head>
      <body><h1>PDF smoke test</h1><p>Chromium rendered this document.</p></body>
    </html>
  `, { printBackground: true }, {
    log: (message, details) => console.error(JSON.stringify({ message, data: details }))
  });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  console.log(JSON.stringify({
    ok: true,
    engine: Converter.getEngineName(),
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    elapsedMs: round(elapsedMs),
    bytes: data.length
  }, null, 2));
};

const run = async () => {
  try {
    await main();
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: error.code,
      message: error.message,
      status: error.status,
      name: error.name,
      stack: error.stack
    }, null, 2));
    process.exitCode = 1;
  } finally {
    await Converter.close();
  }
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
