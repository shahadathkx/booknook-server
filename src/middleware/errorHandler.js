/**
 * Centralized error handler middleware.
 * Ensures consistent JSON responses for client modals and toast notifications.
 */
export function errorHandler(err, req, res, next) {
  console.error('[BookNook Error]:', err);

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'An unexpected error occurred while processing your library request.';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

/**
 * 404 Route Not Found middleware.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}. Route not found on BookNook server.`,
  });
}
