// 404 handler
export function notFound(req, res, next) {
  res.status(404).json({ message: 'Route not found' });
}

// Global error handler with structured logging
export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Structured server-side log
  try {
    const log = {
      time: new Date().toISOString(),
      level: 'error',
      method: req.method,
      url: req.originalUrl,
      status,
      message,
      userId: req.user?.userId || null,
    };
    if (process.env.NODE_ENV !== 'production' && err?.stack) {
      log.stack = err.stack;
    }
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(log));
  } catch (_) {
    // ignore logging failures
  }

  // Attach a short message for clients; avoid leaking stack traces
  res.status(status).json({ message });
}
