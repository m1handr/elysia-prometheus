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