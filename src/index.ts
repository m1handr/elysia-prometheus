import { Elysia, type Context } from 'elysia'
import {
	collectDefaultMetrics,
	Registry,
	Counter,
	Histogram,
	type CounterConfiguration,
	type HistogramConfiguration
} from 'prom-client'

interface PluginOptions {
	/** Path to metrics endpoint (default /metrics) */
	metricsPath: string
	/** Buckets for duration histogram (default [0.003, 0.03, 0.1, 0.3, 1.5, 10]) */
	durationBuckets: number[]
	/** Additional static labels for all metrics */
	staticLabels: Record<string, string>
	/** Dynamic labels for all metrics */
	dynamicLabels: Record<string, (ctx: Context) => string>
	/** Use normalized route path for metrics */
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

	const getStatusCode = (ctx: Context): string => {
		if (
			typeof ctx.response === 'object' &&
			ctx.response !== null &&
			'code' in ctx.response &&
			typeof ctx.response.code === 'number'
		) {
			return ctx.response.code.toString()
		}
		if (ctx.set.status) {
			return ctx.set.status.toString() ?? 'unknown'
		}

		return '500'
	}

	function getLabels(ctx: Context) {
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
			labels[key] = fn(ctx)
		}

		return labels
	}

	function normalizePath(path: string) {
		return path.replace(/\/\d+([\/?]|$)/g, '/:id$1')
	}

	return new Elysia({ name: 'prometheus' })
		.derive({ as: 'global' }, (ctx) => ({
			endTimer: httpRequestDuration.startTimer(getLabels(ctx))
		}))
		.onAfterHandle({ as: 'global' }, (ctx) => {
			if (ctx.path.endsWith(opts.metricsPath)) return
			httpRequestCounter.inc(getLabels(ctx))
			ctx.endTimer(getLabels(ctx))
		})
		.onError({ as: 'global' }, (ctx) => {
			if (!ctx.endTimer) return
			if (ctx.path.endsWith(opts.metricsPath)) return
			// @ts-ignore
			httpRequestCounter.inc(getLabels(ctx))
			// @ts-ignore
			ctx.endTimer(getLabels(ctx))
		})
		.get(opts.metricsPath, async () => {
			return new Response(await register.metrics(), {
				headers: { 'Content-Type': register.contentType }
			})
		})
}
