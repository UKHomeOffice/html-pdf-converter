'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const defaults = {
  url: process.env.PDF_CONVERTER_URL || `http://localhost:${process.env.APP_PORT || process.env.PORT || 8080}/convert`,
  requests: 20,
  concurrency: 1,
  warmup: 1,
  fixture: path.resolve(root, 'test/fixtures/benchmark-request.json')
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

const percentile = (values, target) => {
  if (values.length === 0) {
    return 0;
  }
  const index = Math.ceil((target / 100) * values.length) - 1;
  return values[Math.min(Math.max(index, 0), values.length - 1)];
};

const round = value => Math.round(value * 100) / 100;

const summarize = results => {
  const timings = results.map(result => result.ms).sort((a, b) => a - b);
  const total = timings.reduce((sum, value) => sum + value, 0);
  const failures = results.filter(result => !result.ok);

  return {
    requests: results.length,
    failures: failures.length,
    min: round(timings[0] || 0),
    max: round(timings[timings.length - 1] || 0),
    avg: round(total / (timings.length || 1)),
    p50: round(percentile(timings, 50)),
    p95: round(percentile(timings, 95)),
    p99: round(percentile(timings, 99)),
    bytes: results.reduce((sum, result) => sum + result.bytes, 0)
  };
};

const sendRequest = async (url, payload) => {
  // Measure the same client-observed latency users feel at the /convert boundary.
  const start = process.hrtime.bigint();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await response.arrayBuffer();
  const elapsed = Number(process.hrtime.bigint() - start) / 1e6;

  return {
    ok: response.ok,
    status: response.status,
    ms: elapsed,
    bytes: body.byteLength
  };
};

const runBatch = async (options, payload, count) => {
  const results = [];
  let next = 0;

  const worker = async () => {
    while (next < count) {
      next += 1;
      results.push(await sendRequest(options.url, payload));
    }
  };

  await Promise.all(Array.from({ length: options.concurrency }, worker));
  return results;
};

const printUsage = () => {
  console.log(`Usage: yarn benchmark [options]

Options:
  --url <url>             Converter endpoint. Default: ${defaults.url}
  --requests <number>     Measured requests. Default: ${defaults.requests}
  --concurrency <number>  Concurrent workers. Default: ${defaults.concurrency}
  --warmup <number>       Warmup requests before measuring. Default: ${defaults.warmup}
  --fixture <path>        JSON request payload. Default: test/fixtures/benchmark-request.json

Examples:
  yarn benchmark --requests 30 --concurrency 1
  yarn benchmark --requests 50 --concurrency 5
`);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const options = Object.assign({}, defaults, args, {
    requests: Number(args.requests || defaults.requests),
    concurrency: Number(args.concurrency || defaults.concurrency),
    warmup: Number(args.warmup || defaults.warmup),
    fixture: path.resolve(root, args.fixture || defaults.fixture)
  });

  const payload = JSON.parse(fs.readFileSync(options.fixture, 'utf8'));

  if (options.warmup > 0) {
    await runBatch(Object.assign({}, options, { concurrency: 1 }), payload, options.warmup);
  }

  const started = process.hrtime.bigint();
  const results = await runBatch(options, payload, options.requests);
  const elapsed = Number(process.hrtime.bigint() - started) / 1e9;
  const summary = summarize(results);

  console.log(JSON.stringify({
    url: options.url,
    fixture: path.relative(root, options.fixture),
    concurrency: options.concurrency,
    durationSeconds: round(elapsed),
    requestsPerSecond: round(summary.requests / elapsed),
    latencyMs: summary,
    statuses: results.reduce((statuses, result) => {
      statuses[result.status] = (statuses[result.status] || 0) + 1;
      return statuses;
    }, {})
  }, null, 2));

  if (summary.failures > 0) {
    process.exitCode = 1;
  }
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
