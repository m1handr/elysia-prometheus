import { Elysia, type Context } from 'elysia'
import {
	collectDefaultMetrics,
	Counter,
	Histogram,
	Registry,
	type CounterConfiguration,
	type HistogramConfiguration
} from 'prom-client'

interface PluginOptions {
	metricsPath: string
	durationBuckets: number[]
	staticLabels: Record<string, string>
	dynamicLabels: Record<string, (ctx: Context) => string>
	useRoutePath: boolean
}

interface UserPluginOptions extends Partial<PluginOptions> {}

const DEFAULT_OPTIONS: PluginOptions = {
	metricsPath: '/metrics',
	durationBuckets: [0.003, 0.03, 0.1, 0.3, 1.5, 10],
	staticLabels: {},
	dynamicLabels: {},
	useRoutePath: true
}

export default (userOptions: UserPluginOptions = {}) => {
	const opts: PluginOptions = { ...DEFAULT_OPTIONS, ...userOptions }

	const register = new Registry()
	collectDefaultMetrics({ register })

	const reservedLabels = new Set(['method', 'path', 'status'])
	const allLabels = { ...opts.staticLabels, ...opts.dynamicLabels }

	for (const label of Object.keys(allLabels)) {
		if (reservedLabels.has(label)) {
			throw new Error(`Label '${label}' is reserved`)
		}
	}

	const labelNames = [
		'method',
		'path',
		'status',
		...Object.keys(opts.staticLabels),
		...Object.keys(opts.dynamicLabels)
	]

	const httpRequestCounter = new Counter({
		name: 'http_requests_total',
		help: 'Total HTTP requests count',
		labelNames,
		registers: [register]
	} satisfies CounterConfiguration<string>)

	const httpRequestDuration = new Histogram({
		name: 'http_request_duration_seconds',
		help: 'HTTP request duration in seconds',
		labelNames,
		buckets: opts.durationBuckets,
		registers: [register]
	} satisfies HistogramConfiguration<string>)

	const getStatusCode = (ctx: any): string => {
		if (
			typeof ctx.response === 'object' &&
			ctx.response !== null &&
			'code' in ctx.response &&
			typeof ctx.response.code === 'number'
		) {
			return ctx.response.code.toString()
		}
		if (ctx.set?.status) {
			return ctx.set.status.toString() ?? 'unknown'
		}
		return '500'
	}

	function getLabels(ctx: any) {
		const path = opts.useRoutePath
			? (ctx.route as string) || ctx.path
			: ctx.path

		const labels: Record<string, string> = {
			method: ctx.request.method,
			path: normalizePath(path),
			status: getStatusCode(ctx),
			...opts.staticLabels
		}

		for (const [key, fn] of Object.entries(opts.dynamicLabels)) {
			labels[key] = fn(ctx as Context)
		}

		return labels
	}

	function normalizePath(path: string) {
		return path.replace(/\/\d+([\/?]|$)/g, '/:id$1')
	}

	const requestTimers = new WeakMap<Request, (labels?: any) => void>()

	return new Elysia({ name: 'prometheus' })
		.onRequest((ctx) => {
			requestTimers.set(ctx.request, httpRequestDuration.startTimer())
		})
		.onAfterResponse({ as: 'global' }, (ctx) => {
			if (ctx.path.endsWith(opts.metricsPath)) return

			const endTimer = requestTimers.get(ctx.request)
			if (!endTimer) return

			const labels = getLabels(ctx)
			httpRequestCounter.inc(labels)
			endTimer(labels)
		})
		.onError({ as: 'global' }, (ctx) => {
			if (ctx.path.endsWith(opts.metricsPath)) return

			const endTimer = requestTimers.get(ctx.request)
			if (!endTimer) return

			const labels = getLabels(ctx)
			httpRequestCounter.inc(labels)
			endTimer(labels)
		})
		.get(opts.metricsPath, async () => {
			return new Response(await register.metrics(), {
				headers: { 'Content-Type': register.contentType }
			})
		})
}
