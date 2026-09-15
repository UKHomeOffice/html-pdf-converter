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
- Active conversions are limited by the configured concurrency.
- New conversions are rejected with `503` when the queue is full.
- Queued conversions are removed when the client aborts.
- Running conversions close their active page when the client aborts.
- Running conversions time out and close their active page.
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

### 6. Added Bounded Concurrency

Added a configurable concurrency limit around PDF conversion work.

The service now reads:

```text
PDF_CONCURRENCY
PDF_QUEUE_SIZE
PDF_TIMEOUT_MS
```

The default is `2` active conversions per service process.

The converter now queues work before entering Puppeteer, so no more than the configured number of conversions can actively create pages and generate PDFs at the same time. Once a conversion succeeds or fails, its slot is released and the next queued conversion starts.

This helps avoid CPU and memory saturation when multiple requests arrive together. Browser reuse improves warm latency, while bounded concurrency makes latency more predictable under burst traffic.

The queue is capped by `PDF_QUEUE_SIZE`, which defaults to `20`. If the queue is full, the converter rejects the request with `PdfQueueFull` and the route returns `503`.

The service-owned timeout is controlled by `PDF_TIMEOUT_MS`, which defaults to `30000`. The timeout covers both queued and running conversions. Timed-out conversions reject with `PdfConversionTimeout` and the route returns `504`.

Client abort handling is now request-aware:

- queued conversions are removed if the client disconnects before they start
- running conversions close their active page if the client disconnects during rendering
- completed responses remove their abort listeners before sending the PDF

The converter also logs conversion timings through the request logger, including queue wait, active count, queued count, browser acquisition, page creation, `setContent`, `page.pdf`, page close, total time, and error code when present.

### 7. Documented Baseline And Results

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
11 passing
```

The route integration tests passed:

```bash
LOG_LEVEL=silent ./node_modules/.bin/mocha test/integration/index.js
```

Result:

```text
12 passing
```

The full test command passed:

```bash
yarn test
```

Result:

```text
32 passing
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

After adding the default `PDF_CONCURRENCY=2` limit, a fresh-process run with 30 requests at client concurrency `5` completed successfully:

| Scenario | Avg Latency | P95 Latency | Status |
| --- | ---: | ---: | --- |
| 30 requests, client concurrency 5, `PDF_CONCURRENCY=2` | `537.97ms` | `656.27ms` | 30 x `201` |

This confirms that queued conversions complete successfully when client concurrency is higher than the active PDF conversion limit.

The overload and timeout paths are covered by integration tests that verify explicit `503` and `504` responses.

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

Benchmark the bounded concurrency behavior under higher request pressure.

Recommended scenarios:

```bash
yarn benchmark --url http://localhost:18080/convert --requests 30 --concurrency 5
yarn benchmark --url http://localhost:18080/convert --requests 30 --concurrency 10
```

Run these with the default `PDF_CONCURRENCY=2`, then compare with a higher value such as `PDF_CONCURRENCY=3` or `PDF_CONCURRENCY=4` to find the best trade-off for the target container size.
