import { httpRequestDuration, httpRequestsTotal } from '../config/metrics.js';

/**
 * Express middleware to track HTTP request durations and request counts for Prometheus.
 */
export function metricsMiddleware(req, res, next) {
  const start = process.hrtime();

  res.on('finish', () => {
    // Ignore /metrics endpoint from tracking itself
    if (req.originalUrl === '/metrics') return;

    const diff = process.hrtime(start);
    const durationInSeconds = diff[0] + diff[1] / 1e9;

    // Use route path pattern if available (e.g. /api/expenses/:id) or baseUrl/path
    const route = req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : (req.baseUrl || req.path || 'unknown');
    const method = req.method;
    const statusCode = res.statusCode ? res.statusCode.toString() : 'unknown';

    httpRequestDuration.observe({ method, route, status_code: statusCode }, durationInSeconds);
    httpRequestsTotal.inc({ method, route, status_code: statusCode });
  });

  next();
}
