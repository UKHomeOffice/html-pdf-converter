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
- A new browser context and page are created per conversion where the selected engine supports contexts.
- The page closes after successful PDF generation.
- The page closes when PDF generation fails.
- Puppeteer remains the default PDF engine.
- Playwright can be selected with `PDF_ENGINE=playwright` for comparison benchmarking.
- `waitUntil` is passed only to `page.setContent()`.
- PDF options are passed only to `page.pdf()`.
- Chromium is relaunched after a browser disconnect.

These tests protect the performance-sensitive behavior directly instead of relying only on route-level integration tests.

### 3. Reused The Chromium Browser

Refactored `models/converter.js` so Chromium is launched once and reused across conversions.

The request path now looks like this:

```text
process -> shared Chromium
request -> new context -> new page -> set HTML -> generate PDF -> close page/context
```

The implementation now:

- lazily launches Chromium on the first conversion
- stores the launch promise so concurrent requests do not trigger duplicate launches
- reuses the same browser for later conversions
- creates a fresh browser context and page for each conversion where the selected engine supports contexts
- closes the request-owned page/context after each conversion using `finally()`
- keeps the browser open between requests
- exposes `PDFConverterModel.close()` for tests and future graceful shutdown handling
- clears the cached browser when Puppeteer emits `disconnected`, allowing a later request to relaunch Chromium
- normalizes unclassified browser launch failures to `PdfEngineUnavailable` with a `503` response

This removes repeated Chromium startup and shutdown from the per-request hot path.

The application also registers `SIGTERM` and `SIGINT` handlers in `index.js` so the HTTP server stops accepting new connections and the shared browser is closed before the process exits.

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

### 6. Added A Configurable PDF Engine

Added `playwright-core` as an alternative Chromium automation library while keeping Puppeteer as the default production path.

The service now reads:

```text
PDF_ENGINE
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
```

Supported values are:

- `PDF_ENGINE=puppeteer`
- `PDF_ENGINE=playwright`

Both engines preserve the existing `/convert` API behavior and use Chromium to generate PDFs. The converter selects the engine through a small adapter layer, so browser launch, page creation, PDF generation, and cleanup flow through the same timing log path.

Puppeteer remains the default because it is the existing behavior and has already shown a significant improvement after browser reuse. Playwright is introduced for controlled benchmarking rather than as an immediate replacement.

When the Playwright engine is selected, it uses `playwright-core` and an existing Chromium executable. The executable path resolution order is:

1. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
2. `PUPPETEER_EXECUTABLE_PATH`
3. Puppeteer's installed executable path

This avoids downloading a second browser while allowing local and container benchmarks to compare Playwright against Puppeteer with the same browser family.

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
13 passing
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
34 passing
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

Bounded concurrency, queueing, and service-owned conversion timeouts were investigated but backed out. They changed runtime behavior and introduced extra operational tuning requirements for little benefit compared with browser reuse.

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

The service still creates request-owned browser resources, so conversions remain isolated while avoiding the largest repeated cost.

## Docker Runtime Cleanup

The Dockerfile now avoids `apk update && apk upgrade` package churn and installs the required Chromium/browser dependencies directly with `apk add --no-cache`. The build also runs `/usr/bin/chromium-browser --version` after creating the expected executable path, so the image records and validates the system Chromium binary during build.

## Remaining Recommended Next Step

Benchmark Puppeteer and Playwright with the same representative fixtures.

Recommended scenarios:

```bash
APP_PORT=18080 PDF_ENGINE=puppeteer LOG_LEVEL=silent yarn start
yarn benchmark --url http://localhost:18080/convert --requests 30 --concurrency 5

APP_PORT=18080 PDF_ENGINE=playwright LOG_LEVEL=silent yarn start
yarn benchmark --url http://localhost:18080/convert --requests 30 --concurrency 5
```

Compare latency, throughput, memory, error rate, and generated PDF output. Only switch the default engine if Playwright shows a measurable benefit while preserving output compatibility for real form templates.

The remaining unimplemented measurement task is to run the production container with realistic CPU/memory limits and compare `/dev/shm` behavior before changing `--disable-dev-shm-usage`.
