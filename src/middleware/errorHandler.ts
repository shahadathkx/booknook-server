import { Request, Response, NextFunction } from 'express';
export interface AppError extends Error {
  statusCode?: number;
  status?: number;
}




export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'An unexpected internal error occurred on the server.';

  console.error(`[Error] ${req.method} ${req.url} -> Status ${statusCode}:`, err.message);

  res.status(statusCode).json({ message });
}




export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    message: `Cannot ${req.method} ${req.originalUrl}. Route not found on BookNook server.`,
  });
}
