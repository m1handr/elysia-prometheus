# Elysia Prometheus Plugin

A lightweight plugin for [Elysia](https://elysiajs.com/) that exposes HTTP metrics for Prometheus using [`prom-client`](https://github.com/siimon/prom-client). Automatically tracks request count, duration, method, status code, and more — with support for custom labels.

## Features

- ✅ Exposes `/metrics` endpoint (configurable)
- 📊 Collects request duration and total request count
- 🏷 Supports static and dynamic labels
- 🧠 Route normalization for consistent metric names
- 🪝 Integrates with `derive` and `onAfterHandle` lifecycle hooks

## Installation

```bash
bun install elysia-prometheus prom-client
```

## Usage

```ts
import { sleep } from 'bun'
import { Elysia, error } from 'elysia'
import prometheusPlugin from 'elysia-prometheus'

const app = new Elysia()
	.use(
		prometheusPlugin({
			metricsPath: '/metrics',
			staticLabels: { service: 'my-app' },
			dynamicLabels: {
				userAgent: (ctx) =>
					ctx.request.headers.get('user-agent') ?? 'unknown'
			}
		})
	)
	.get('/', () => 'GET /')
	.post('/', () => 'POST /')
	.get('/delay', () => {
		sleep(1000)
		return 'GET /delay'
	})
	.get('/error/:code', ({ params }) => {
		return error(Number.parseInt(params.code))
	})
	.listen(3000)
```

## Metrics Exposed

- `http_requests_total` — Counter of total HTTP requests

- `http_request_duration_seconds` — Histogram of request durations

### Default Labels

- `method` – HTTP method (`GET`, `POST`, etc.)

- `path` – Normalized route path (e.g., `/users/:id`)

- `status` – HTTP status code (`200`, `404`, etc.)

### Custom Labels

- `staticLabels`: Adds the same label value for every request

- `dynamicLabels`: Functions that extract values from each request context

## Plugin Options

| Option            | Type                                       | Default                            | Description                                                                      |
| ----------------- | ------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------- |
| `metricsPath`     | `string`                                   | `"/metrics"`                       | URL path to expose metrics                                                       |
| `durationBuckets` | `number[]`                                 | `[0.003, 0.03, 0.1, 0.3, 1.5, 10]` | Histogram buckets for request duration                                           |
| `staticLabels`    | `Record<string, string>`                   | `{}`                               | Static labels added to all metrics                                               |
| `dynamicLabels`   | `Record<string, (ctx: Context) => string>` | `{}`                               | Dynamic labels based on request context                                          |
| `useRoutePath`    | `boolean`                                  | `true`                             | Use route pattern instead of raw URL (e.g. `/users/:id` instead of `/users/123`) |

> ⚠️ Label names `method`, `path`, and `status` are reserved and cannot be overridden.

## Route Normalization

The plugin automatically normalizes paths like:

```
/users/123/orders/456 → /users/:id/orders/:id
```

This prevents metric explosion from unique IDs in URLs.

## License

MIT
