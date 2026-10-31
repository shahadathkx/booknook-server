import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';

export interface AppError extends Error {
  statusCode?: number;
  status?: number;
}

/**
 * Global error handling middleware returning structured JSON responses.
 */
export function errorHandler(
  err: AppError,
  req: Request,
  res: Response<ApiResponse>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'An unexpected internal error occurred on the server.';

  console.error(`[Error] ${req.method} ${req.url} -> Status ${statusCode}:`, err.message);

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

/**
 * 404 Not Found middleware for undefined routes.
 */
export function notFoundHandler(req: Request, res: Response<ApiResponse>): void {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}. Route not found on BookNook server.`,
  });
}
