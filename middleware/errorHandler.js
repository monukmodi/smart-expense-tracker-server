// 404 handler
export function notFound(req, res, next) {
  res.status(404).json({ message: 'Route not found' });
}

// Global error handler
export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Minimal structured error response
  res.status(status).json({
    message,
  });
}
