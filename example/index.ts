import { sleep } from 'bun'
import { Elysia, error } from 'elysia'
import prometheusPlugin from '../src/index'

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
	.macro({
		errorInMacro: {
			async resolve() {
				return error(418)
			}
		}
	})
	.get('/', () => 'GET /')
	.post('/', () => 'POST /')
	.get('/delay', () => {
		sleep(1000)
		return 'GET /delay'
	})
	.get('/error/:code', ({ params }) => {
		return error(Number.parseInt(params.code))
	})
	.get('/macro-error', () => 'macro error', {
		errorInMacro: true
	})
	.listen(3000)
