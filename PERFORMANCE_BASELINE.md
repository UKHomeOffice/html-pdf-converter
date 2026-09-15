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

Recommended timing points:

- total `/convert` response time
- request validation time
- template rendering time
- browser acquisition or launch time
- page creation time
- `page.setContent()` time
- `page.pdf()` time
- page close time
- queue wait time, if bounded concurrency is added

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

Captured on 2026-09-15 after refactoring `models/converter.js` to reuse a shared Chromium instance and close only the page after each conversion.

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

| Scenario | Before Avg | Before P95 | After Avg | After P95 |
| --- | ---: | ---: | ---: | ---: |
| 10 requests, concurrency 1 | `760.13ms` | `791.55ms` | `150.12ms` | `157.41ms` |
| 10 requests, concurrency 2 | `1188.81ms` | `2065.18ms` | `236.39ms` | `417.66ms` |

The first optimization confirms that repeated Chromium startup was the dominant local bottleneck for the benchmark fixture. Sequential average latency improved by about `80%`, and low-concurrency p95 latency improved by about `80%`.

## Optimization Plan

### 1. Reuse Chromium

Refactor the converter so the service launches Chromium once per process instead of once per request.

Expected behavior:

- lazily launch the browser on first conversion, or launch during app startup
- create a fresh page or isolated browser context per request
- always close the page or context after each request
- keep the browser alive across requests
- close the browser on process shutdown
- detect browser disconnects or crashes and relaunch when needed

This should remove the most expensive repeated startup cost from the hot path.

### 2. Add Bounded Concurrency

PDF generation is CPU and memory intensive. A shared browser should be protected with a configurable concurrency limit.

Proposed setting:

- `PDF_CONCURRENCY`, defaulting to a conservative value such as `2`

This should prevent the service from accepting too many simultaneous browser page renders and causing high latency or container instability.

### 3. Clarify PDF Options Handling

`waitUntil` is currently merged into the options object and passed both to `page.setContent()` and `page.pdf()`. It is a content-loading option, not a PDF option.

Recommended change:

- pass `waitUntil` only to `page.setContent()`
- pass PDF-specific options only to `page.pdf()`

The default is currently `waitUntil: 'load'`. Consider measuring `domcontentloaded` as an alternative, but only change the default if timings and output compatibility support it.

### 4. Consider Blocking External Requests

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
