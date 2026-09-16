# HTML PDF Converter Performance Baseline

## Context

The service has shown response times of around 3 seconds to generate a PDF for a form. This document captures the current baseline understanding and the first optimization plan before implementation work begins.

## Current Request Path

The `/convert` route currently processes a request as follows:

1. Validate the request body in `middleware/validate.js`.
2. Render the supplied Mustache template in `middleware/render.js`, unless `noRender` is set.
3. Create a PDF in `models/converter.js` using Puppeteer.
4. Return the generated PDF buffer with a `201` response.

## Current Performance Hypothesis

The likely dominant cost is Chromium startup per request.

`models/converter.js` currently calls `puppeteer.launch()` inside `PDFConverterModel#create()`. The controller creates a new model for each request, and each call launches a browser, opens a page, renders one PDF, then closes the browser.

This means each request pays the cost of:

- launching Chromium
- creating a page
- setting HTML content
- generating the PDF
- closing Chromium

The cheapest check to confirm or disprove this is to measure cold and warm request timings while separating browser launch time from page rendering and PDF generation time.

## Existing Observability

The service already uses `churchill`, which logs request-level `response_time`. This is useful for external response time, but it does not currently show where time is spent inside the conversion pipeline.

The converter now also emits request-scoped conversion timings through `req.log('debug', ...)` after each successful or failed conversion.

Timing points:

- total `/convert` response time
- request validation time
- template rendering time
- browser acquisition or launch time
- page creation time
- `page.setContent()` time
- `page.pdf()` time
- page/context close time
- error code, if conversion failed

## Baseline Measurement Plan

Before changing behavior, capture a repeatable baseline using representative form HTML.

Measure:

- cold request latency
- warm request latency
- `p50`, `p95`, and `p99` response times
- throughput under realistic concurrency
- error rate under load
- memory and CPU usage during load

Suggested scenarios:

- single request after service startup
- repeated sequential requests
- concurrent requests at expected production concurrency
- concurrent requests above expected production concurrency to find saturation behavior

## Current Local Baseline

Captured on 2026-09-15 from a local macOS run.

The default benchmark target, `http://localhost:8080/convert`, returned `403` for all requests, which suggests another local process or protected listener was bound to that port. The converter service was started on an isolated port instead:

```bash
APP_PORT=18080 LOG_LEVEL=silent yarn start
```

The benchmark used `test/fixtures/benchmark-request.json` against `http://localhost:18080/convert`.

### Smoke Run

```bash
yarn benchmark --url http://localhost:18080/convert --requests 3 --concurrency 1
```

```json
{
  "durationSeconds": 2.92,
  "requestsPerSecond": 1.03,
  "latencyMs": {
    "requests": 3,
    "failures": 0,
    "min": 819.11,
    "max": 1198.15,
    "avg": 973.7,
    "p50": 903.83,
    "p95": 1198.15,
    "p99": 1198.15
  },
  "statuses": {
    "201": 3
  }
}
```

### Sequential Baseline

```bash
yarn benchmark --url http://localhost:18080/convert --requests 10 --concurrency 1
```

```json
{
  "durationSeconds": 7.6,
  "requestsPerSecond": 1.32,
  "latencyMs": {
    "requests": 10,
    "failures": 0,
    "min": 721.06,
    "max": 791.55,
    "avg": 760.13,
    "p50": 762.34,
    "p95": 791.55,
    "p99": 791.55
  },
  "statuses": {
    "201": 10
  }
}
```

### Low Concurrency Baseline

```bash
yarn benchmark --url http://localhost:18080/convert --requests 10 --concurrency 2
```

```json
{
  "durationSeconds": 6.1,
  "requestsPerSecond": 1.64,
  "latencyMs": {
    "requests": 10,
    "failures": 0,
    "min": 908.51,
    "max": 2065.18,
    "avg": 1188.81,
    "p50": 1060.52,
    "p95": 2065.18,
    "p99": 2065.18
  },
  "statuses": {
    "201": 10
  }
}
```

These numbers show that local sequential requests are currently around `760ms` average for the benchmark fixture, while concurrency `2` increases average latency to around `1.19s` and p95 latency to around `2.06s`.

## Post Browser Reuse Baseline

Captured on 2026-09-15 after refactoring `models/converter.js` to reuse a shared Chromium instance and close request-owned page/context resources after each conversion.

The converter service was started with the same command used for the original local baseline:

```bash
APP_PORT=18080 LOG_LEVEL=silent yarn start
```

### Sequential Baseline After Browser Reuse

```bash
yarn benchmark --url http://localhost:18080/convert --requests 10 --concurrency 1
```

```json
{
  "durationSeconds": 1.5,
  "requestsPerSecond": 6.66,
  "latencyMs": {
    "requests": 10,
    "failures": 0,
    "min": 144.3,
    "max": 157.41,
    "avg": 150.12,
    "p50": 149.77,
    "p95": 157.41,
    "p99": 157.41
  },
  "statuses": {
    "201": 10
  }
}
```

### Low Concurrency Baseline After Browser Reuse

```bash
yarn benchmark --url http://localhost:18080/convert --requests 10 --concurrency 2
```

```json
{
  "durationSeconds": 1.22,
  "requestsPerSecond": 8.17,
  "latencyMs": {
    "requests": 10,
    "failures": 0,
    "min": 150.73,
    "max": 417.66,
    "avg": 236.39,
    "p50": 217.18,
    "p95": 417.66,
    "p99": 417.66
  },
  "statuses": {
    "201": 10
  }
}
```

### Before And After Comparison

| Scenario | Before Avg | After Avg | Avg Difference | Avg Improvement | Before P95 | After P95 | P95 Difference | P95 Improvement | Throughput Change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 requests, concurrency 1 | `760.13ms` | `150.12ms` | `610.01ms faster` | `80.25%` | `791.55ms` | `157.41ms` | `634.14ms faster` | `80.11%` | `1.32 -> 6.66 req/s` |
| 10 requests, concurrency 2 | `1188.81ms` | `236.39ms` | `952.42ms faster` | `80.12%` | `2065.18ms` | `417.66ms` | `1647.52ms faster` | `79.77%` | `1.64 -> 8.17 req/s` |

The first optimization confirms that repeated Chromium startup was the dominant local bottleneck for the benchmark fixture. Sequential average latency improved by about `610ms` per request, and low-concurrency p95 latency improved by about `1.65s`.

In practical terms, the local benchmark moved from roughly `760ms` average sequential conversion time to roughly `150ms`, with throughput increasing from `1.32` requests per second to `6.66` requests per second.

## LMR Payload Image Memory Check

Captured on 2026-09-15 against the reported image digest:

```bash
quay.io/ukhomeofficedigital/html-pdf-converter@sha256:b0db962a7306c5166b6d7dcfb25f1aa7dc3e158450ee42299de86663521181ab
```

The LMR consumer sends only `{ "template": html }`. The captured HTML payload was `267023` bytes; serialized as a `/convert` JSON request it was `280629` bytes.

Direct in-image render using the captured LMR HTML:

| Container memory | Result | Notes |
| ---: | --- | --- |
| unlimited local Docker | success | `53814` PDF bytes, about `4600ms` |
| `256m` | failed | Puppeteer connection closed during conversion/page cleanup |
| `384m` | failed | `ProtocolError: Protocol error (Page.printToPDF): Printing failed` |
| `512m` | success | `53814` PDF bytes, about `6999ms` |

HTTP `/convert` using the same image and `{ "template": html }`:

| Container memory | Client concurrency | Result | Notes |
| ---: | ---: | --- | --- |
| unlimited local Docker | `1` | `201` | `53814` PDF bytes, about `4753ms` |
| unlimited local Docker | `5` | `201` | 10/10 succeeded, p95 `5574.16ms` |
| `256m` | `1` | `500` | `TargetCloseError` caused by `ProtocolError`; response time `3689ms` |
| `512m` | `2` | `201` | 4/4 succeeded, p95 `12625.9ms` |

This reproduces the image-level failure shape under constrained memory. For this payload, `256m` and `384m` are not enough for reliable Chromium PDF rendering. `512m` can succeed, but concurrent renders are slow; production-like tests should try higher memory limits where memory is constrained.

## PDF Engine Comparison Plan

Puppeteer remains the default PDF engine. Playwright is available as an optional engine for comparison benchmarking:

```bash
PDF_ENGINE=puppeteer
PDF_ENGINE=playwright
```

Both engines use Chromium and preserve the same `/convert` API behavior. The benchmark comparison should use the same service settings, fixture, and request counts for both engines.

Suggested local comparison:

```bash
APP_PORT=18080 PDF_ENGINE=puppeteer LOG_LEVEL=silent yarn start
yarn benchmark --url http://localhost:18080/convert --requests 30 --concurrency 5

APP_PORT=18080 PDF_ENGINE=playwright LOG_LEVEL=silent yarn start
yarn benchmark --url http://localhost:18080/convert --requests 30 --concurrency 5
```

Record the results here before changing the default engine. Compare average latency, p95, p99, throughput, memory usage, error rate, and generated PDF compatibility for representative forms.

### Initial Playwright Smoke Run

Captured on 2026-09-15 with `PDF_ENGINE=playwright` to verify the alternative engine can render successful PDFs locally.

```bash
APP_PORT=18080 PDF_ENGINE=playwright LOG_LEVEL=silent yarn start
yarn benchmark --url http://localhost:18080/convert --requests 3 --concurrency 1
```

```json
{
  "durationSeconds": 0.69,
  "requestsPerSecond": 4.35,
  "latencyMs": {
    "requests": 3,
    "failures": 0,
    "min": 223.29,
    "max": 240.29,
    "avg": 229.74,
    "p50": 225.63,
    "p95": 240.29,
    "p99": 240.29
  },
  "statuses": {
    "201": 3
  }
}
```

This smoke run confirms the Playwright path is functional. It is not yet a full performance comparison against Puppeteer because the request count is intentionally small.

### Puppeteer Vs Playwright Comparison

Captured on 2026-09-15 using the same benchmark fixture, port, request counts, and client concurrency settings for both engines.

The benchmark port `18081` was checked before the run. An older listener was cleared before starting the Playwright service so each engine was measured against a fresh process.

#### Puppeteer

```bash
APP_PORT=18081 PDF_ENGINE=puppeteer LOG_LEVEL=silent yarn start
yarn benchmark --url http://localhost:18081/convert --requests 30 --concurrency 1
yarn benchmark --url http://localhost:18081/convert --requests 30 --concurrency 5
```

| Scenario | Avg | P50 | P95 | P99 | Throughput | Status |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 30 requests, concurrency 1 | `161.16ms` | `146.44ms` | `295.11ms` | `352.69ms` | `6.2 req/s` | 30 x `201` |
| 30 requests, concurrency 5 | `508.37ms` | `498.09ms` | `640ms` | `657.96ms` | `9.37 req/s` | 30 x `201` |

#### Playwright

```bash
APP_PORT=18081 PDF_ENGINE=playwright LOG_LEVEL=silent yarn start
yarn benchmark --url http://localhost:18081/convert --requests 30 --concurrency 1
yarn benchmark --url http://localhost:18081/convert --requests 30 --concurrency 5
```

| Scenario | Avg | P50 | P95 | P99 | Throughput | Status |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 30 requests, concurrency 1 | `234.42ms` | `232.01ms` | `247.28ms` | `249.33ms` | `4.27 req/s` | 30 x `201` |
| 30 requests, concurrency 5 | `773.1ms` | `779.27ms` | `884.27ms` | `946.89ms` | `6.12 req/s` | 30 x `201` |

#### Comparison Summary

| Scenario | Faster Engine | Avg Difference | P95 Difference | Throughput Difference |
| --- | --- | ---: | ---: | ---: |
| 30 requests, concurrency 1 | Puppeteer | `73.26ms faster` | Playwright was `47.83ms faster` at p95 | Puppeteer `6.2 req/s` vs Playwright `4.27 req/s` |
| 30 requests, concurrency 5 | Puppeteer | `264.73ms faster` | `244.27ms faster` | Puppeteer `9.37 req/s` vs Playwright `6.12 req/s` |

For this fixture, Puppeteer is more efficient overall. Playwright produced successful PDFs, but it had lower throughput and higher average latency in both measured scenarios. The only Playwright advantage in this run was lower p95 latency in the sequential scenario, while its average and throughput were still worse.

The total response byte count differed between engines for the same request count, so Playwright should not become the default without visual or content compatibility checks against representative real forms.

## Optimization Plan

### 1. Reuse Chromium

Refactor the converter so the service launches Chromium once per process instead of once per request.

Implemented behavior:

- lazily launch the browser on first conversion
- create a fresh page or isolated browser context per request, depending on engine support
- always close the page or context after each request
- keep the browser alive across requests
- close the browser on process shutdown
- detect browser disconnects or crashes and relaunch when needed

This should remove the most expensive repeated startup cost from the hot path.

### 2. Clarify PDF Options Handling

`waitUntil` is currently merged into the options object and passed both to `page.setContent()` and `page.pdf()`. It is a content-loading option, not a PDF option.

Recommended change:

- pass `waitUntil` only to `page.setContent()`
- pass PDF-specific options only to `page.pdf()`

The default is currently `waitUntil: 'load'`. Consider measuring `domcontentloaded` as an alternative, but only change the default if timings and output compatibility support it.

### 3. Consider Blocking External Requests

The README states that the service cannot resolve external resources such as linked CSS, JavaScript, or images. If templates accidentally include external resources, rendering may become slower or less predictable.

Potential optimization:

- intercept and block external network requests during page rendering

This should be validated carefully because it can change output for templates that currently rely on reachable resources despite the documented guidance.

## Test Coverage Plan

Add direct unit tests for the converter model:

- launches Chromium once across multiple conversions
- creates and closes a page per conversion
- closes the page when `setContent()` fails
- closes the page when `pdf()` fails
- relaunches Chromium after browser disconnect or crash
- passes `waitUntil` only to `setContent()`
- passes PDF options only to `page.pdf()`

Update integration tests for `/convert`:

- valid raw HTML returns a PDF
- valid Mustache template with data returns a PDF
- validation errors remain unchanged
- Chrome launch or browser errors still map to the expected error response
- multiple requests can reuse the same browser instance

Add or improve middleware unit tests:

- `middleware/render.js` renders Mustache data correctly
- `middleware/render.js` skips rendering when `noRender` is set
- `middleware/validate.js` covers the `noRender` bypass

## Success Criteria

The optimization work should be considered successful when:

- representative warm PDF generation is materially faster than the current baseline
- cold start behavior is measured separately and understood
- concurrency behavior is bounded and predictable
- PDF output compatibility is preserved for existing fixtures
- unit and integration tests cover the browser lifecycle and error paths
- the service can recover from a dead or disconnected browser without requiring a process restart
