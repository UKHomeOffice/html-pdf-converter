'use strict';

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const defaults = {
  url: process.env.PDF_CONVERTER_URL || `http://localhost:${process.env.APP_PORT || process.env.PORT || 8080}/convert`,
  fixture: path.resolve(root, 'test/fixtures/benchmark-request.json'),
  output: path.resolve(root, 'tmp/replay.pdf')
};

const parseArgs = argv => {
  return argv.reduce((options, arg, index) => {
    if (!arg.startsWith('--')) {
      return options;
    }

    const [rawKey, rawValue] = arg.slice(2).split('=');
    const nextValue = argv[index + 1];
    const value = rawValue || (nextValue && !nextValue.startsWith('--') ? nextValue : true);
    return Object.assign(options, { [rawKey]: value });
  }, {});
};

const round = value => Math.round(value * 100) / 100;

const printUsage = () => {
  console.log(`Usage: yarn replay [options]

Options:
  --url <url>       Converter endpoint. Default: ${defaults.url}
  --fixture <path>  JSON request payload. Default: test/fixtures/benchmark-request.json
  --output <path>   PDF output path. Default: tmp/replay.pdf

Examples:
  yarn replay --fixture ./consumer-payload.json --url http://localhost:8082/convert
  PDF_CONVERTER_URL=http://localhost:8082/convert yarn replay --fixture ./consumer-payload.json
`);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const options = Object.assign({}, defaults, args, {
    fixture: path.resolve(root, args.fixture || defaults.fixture),
    output: path.resolve(root, args.output || defaults.output)
  });

  const payload = JSON.parse(fs.readFileSync(options.fixture, 'utf8'));
  const started = process.hrtime.bigint();
  const response = await fetch(options.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = Buffer.from(await response.arrayBuffer());
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  const contentType = response.headers.get('content-type');

  if (response.ok) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, body);
  }

  console.log(JSON.stringify({
    ok: response.ok,
    status: response.status,
    contentType,
    elapsedMs: round(elapsedMs),
    bytes: body.length,
    fixture: path.relative(root, options.fixture),
    ...(response.ok ? { output: path.relative(root, options.output) } : { body: body.toString('utf8') })
  }, null, 2));

  if (!response.ok) {
    process.exitCode = 1;
  }
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
