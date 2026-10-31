import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { connectToDatabase, closeDatabaseConnection } from './config/db';
import { initializeBooksCollection } from './models/bookModel';
import { initializeBorrowsCollection } from './models/borrowModel';
import booksRouter from './routes/books';
import borrowsRouter from './routes/borrows';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Read configuration from environment variables
const PORT = process.env.PORT || 7000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'booknook';
const AUTH_JWKS_URL = process.env.AUTH_JWKS_URL;

const app = express();

// Allowed origins: CLIENT_URL, http://localhost:3000, and localhost ports
const allowedOrigins = [CLIENT_URL, 'http://localhost:3000'];

// Enable CORS for CLIENT_URL (and http://localhost:3000) with credentials
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// GET / health route returning a JSON message
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    message: 'BookNook Express + TypeScript API server is running smoothly.',
    service: 'BookNook Server',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: 'GET /',
      books: 'GET, POST /api/books',
      bookDetails: 'GET /api/books/:id',
      borrowBook: 'POST /api/books/:id/borrow',
      returnBook: 'POST /api/books/:id/return',
      borrows: 'GET /api/borrows',
    },
  });
});

// Application Routes
app.use('/books', booksRouter);
app.use('/api/books', booksRouter);
app.use('/borrows', borrowsRouter);
app.use('/api/borrows', borrowsRouter);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Bootstrap database and start HTTP server
async function startServer() {
  try {
    if (!MONGODB_URI) {
      console.warn('[Warning] MONGODB_URI is not defined in environment variables.');
    }

    await connectToDatabase();
    await initializeBooksCollection();
    await initializeBorrowsCollection();

    const server = app.listen(PORT, () => {
      console.log(`[BookNook Server] Running at http://localhost:${PORT}`);
      console.log(`[CORS] Configured for CLIENT_URL: ${CLIENT_URL} and http://localhost:3000`);
      if (AUTH_JWKS_URL) {
        console.log(`[Auth] JWKS verification endpoint: ${AUTH_JWKS_URL}`);
      }
    });

    const handleShutdown = async (signal: string) => {
      console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        await closeDatabaseConnection();
        process.exit(0);
      });
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    return server;
  } catch (error) {
    console.error('[BookNook Server] Startup failure:', error);
    process.exit(1);
  }
}

// Start server when executed directly
if (typeof require !== 'undefined' && require.main === module) {
  startServer();
}

export { app, startServer };
export default app;
