# Performance Optimisation Steps

## Goal

Improve the latency of the HTML to PDF conversion service while keeping the existing `/convert` API behavior intact and adding focused test coverage around the performance-sensitive path.

## Original Problem

The service was observed taking around 3 seconds to generate a PDF for a form in some usage. Local baseline testing also showed that the existing implementation had high per-request overhead:

| Scenario | Avg Latency | P95 Latency |
| --- | ---: | ---: |
| 10 requests, concurrency 1 | `760.13ms` | `791.55ms` |
| 10 requests, concurrency 2 | `1188.81ms` | `2065.18ms` |

The main performance hypothesis was that Chromium startup was being paid on every request.

## Investigation

The critical path was found in `models/converter.js`.

Before the change, every call to `PDFConverterModel#create()` did the following:

1. Launch Puppeteer and start a new Chromium process.
2. Create a browser page.
3. Set the HTML content.
4. Generate the PDF.
5. Close the browser.

That meant the hot path looked like this:

```text
request -> launch Chromium -> new page -> set HTML -> generate PDF -> close Chromium
```

Launching Chromium is expensive because it starts a separate browser process and initializes the rendering engine before any PDF-specific work can begin. Paying this startup cost for every request was the likely dominant source of latency.

## Changes Made

### 1. Added A Local Benchmark Harness

Added a benchmark script and representative request fixture:

- `scripts/benchmark.js`
- `test/fixtures/benchmark-request.json`
- `benchmark` script in `package.json`

This allows repeatable local measurement against a running service:

```bash
yarn benchmark --url http://localhost:18080/convert --requests 10 --concurrency 1
yarn benchmark --url http://localhost:18080/convert --requests 10 --concurrency 2
```

The benchmark reports request count, failures, status codes, throughput, average latency, and percentile latency.

### 2. Added Converter Unit Tests

Added focused tests in `test/unit/models/converter.js` for the PDF converter lifecycle.

The tests cover:

- Chromium launches once across multiple conversions.
- A new page is created per conversion.
- The page closes after successful PDF generation.
- The page closes when PDF generation fails.
- `waitUntil` is passed only to `page.setContent()`.
- PDF options are passed only to `page.pdf()`.
- Chromium is relaunched after a browser disconnect.

These tests protect the performance-sensitive behavior directly instead of relying only on route-level integration tests.

### 3. Reused The Chromium Browser

Refactored `models/converter.js` so Chromium is launched once and reused across conversions.

The request path now looks like this:

```text
process -> shared Chromium
request -> new page -> set HTML -> generate PDF -> close page
```

The implementation now:

- lazily launches Chromium on the first conversion
- stores the launch promise so concurrent requests do not trigger duplicate launches
- reuses the same browser for later conversions
- creates a fresh page for each conversion
- closes the page after each conversion using `finally()`
- keeps the browser open between requests
- exposes `PDFConverterModel.close()` for tests and future graceful shutdown handling
- clears the cached browser when Puppeteer emits `disconnected`, allowing a later request to relaunch Chromium

This removes repeated Chromium startup and shutdown from the per-request hot path.

### 4. Clarified Option Handling

The converter now separates content-loading options from PDF options.

Before the change, `waitUntil` was included in the object passed to `page.pdf()`, even though `waitUntil` belongs to `page.setContent()`.

The converter now:

- applies default `format: 'A4'`
- applies default `waitUntil: 'load'`
- passes `waitUntil` to `page.setContent()`
- removes `waitUntil` before calling `page.pdf()`

This makes the Puppeteer API usage clearer and avoids passing irrelevant options to PDF generation.

### 5. Updated Integration Test Isolation

Updated `test/integration/index.js` so the shared browser lifecycle does not leak between test cases.

The integration tests now:

- stub `page.close()` because the converter closes pages per request
- call `Converter.close()` in `afterEach()` to reset shared browser state

This keeps route-level tests deterministic while the production code reuses Chromium.

### 6. Documented Baseline And Results

Updated `PERFORMANCE_BASELINE.md` with:

- local baseline measurements before browser reuse
- post-change benchmark measurements
- before and after comparison table
- interpretation of the latency improvement

## Validation

The focused converter tests passed:

```bash
LOG_LEVEL=silent ./node_modules/.bin/mocha test/unit/models/converter.js
```

Result:

```text
6 passing
```

The route integration tests passed:

```bash
LOG_LEVEL=silent ./node_modules/.bin/mocha test/integration/index.js
```

Result:

```text
10 passing
```

The full test command passed:

```bash
yarn test
```

Result:

```text
25 passing
lint passed with 0 errors
```

The lint run still reports `no-console` warnings in `scripts/benchmark.js`, which are acceptable for a CLI benchmark script and do not fail the test command.

## Performance Result

Using the same local benchmark fixture, browser reuse produced the following improvement:

| Scenario | Before Avg | Before P95 | After Avg | After P95 |
| --- | ---: | ---: | ---: | ---: |
| 10 requests, concurrency 1 | `760.13ms` | `791.55ms` | `150.12ms` | `157.41ms` |
| 10 requests, concurrency 2 | `1188.81ms` | `2065.18ms` | `236.39ms` | `417.66ms` |

This confirms that repeated Chromium startup was the dominant local bottleneck for the benchmark fixture.

The improvement is roughly:

- `80%` lower average latency for sequential requests
- `80%` lower p95 latency at concurrency `2`
- higher local throughput because the service no longer repeatedly starts and stops Chromium

## Why This Improves Performance

The old implementation performed expensive browser process work for every request. The new implementation pays that cost once per service process and keeps only lightweight per-request work in the hot path.

The main latency savings come from removing repeated:

- Chromium process startup
- browser initialization
- Puppeteer browser connection setup
- Chromium shutdown

The service still creates a fresh page per request, so conversions remain isolated at the page level while avoiding the largest repeated cost.

## Remaining Recommended Next Step

Add bounded concurrency around PDF generation.

Browser reuse improves warm latency, but `page.pdf()` is still CPU and memory intensive. Without a concurrency limit, a burst of requests can still overload the single service process or shared browser.

Recommended next implementation:

- add a configurable `PDF_CONCURRENCY` setting
- default to a conservative value, such as `2`
- queue additional conversions when the limit is reached
- test that queued requests release their slot after success or failure
- benchmark higher concurrency again, for example concurrency `5` or `10`

This should make p95 and p99 latency more predictable under production-like bursts.
