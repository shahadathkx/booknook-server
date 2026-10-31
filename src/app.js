import express from 'express';
import cors from 'cors';
import bookRoutes from './routes/bookRoutes.js';
import borrowRoutes from './routes/borrowRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  // CORS Configuration
  const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman) or matching client
      if (!origin || origin === allowedOrigin || origin.startsWith('http://localhost:')) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive in dev to avoid CORS friction for the frontend
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Body Parsing Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Root & Health check
  app.get('/', (req, res) => {
    res.json({
      name: 'BookNook API Server',
      version: '1.0.0',
      status: 'operational',
      description: 'Online library management system for adding, borrowing, and returning books.',
      endpoints: {
        books: '/api/books',
        borrows: '/api/borrows',
      },
    });
  });

  // API Routes
  app.use('/api/books', bookRoutes);
  app.use('/api/borrows', borrowRoutes);

  // Error Handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
