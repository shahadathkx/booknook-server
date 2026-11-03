import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { connectToDatabase, closeDatabaseConnection } from './config/db';
import { initializeBooksCollection } from './models/bookModel';
import { initializeBorrowsCollection } from './models/borrowModel';
import booksRouter from './routes/books';
import borrowsRouter from './routes/borrows';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';


const PORT = Number(process.env.PORT) || 7000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'booknook';

const app = express();


const allowedOrigins = [CLIENT_URL, 'http://localhost:3000'];


app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, !origin || allowedOrigins.includes(origin) ? origin : false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (process.env.MONGODB_URI) {
      await connectToDatabase();
    }
    next();
  } catch (error) {
    next(error);
  }
});


app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    message: 'BookNook Express + TypeScript API server is running smoothly.',
    service: 'BookNook Server',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: 'GET /health',
      books: 'GET, POST /api/books',
      bookDetails: 'GET /api/books/:id',
      borrowBook: 'POST /api/books/:id/borrow',
      returnBook: 'POST /api/books/:id/return',
      borrows: 'GET /api/borrows',
    },
  });
});

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy', message: 'BookNook server is running.' });
});


app.use('/books', booksRouter);
app.use('/api/books', booksRouter);
app.use('/borrows', borrowsRouter);
app.use('/api/borrows', borrowsRouter);


app.use(notFoundHandler);
app.use(errorHandler);


async function startServer() {
  try {
    if (!MONGODB_URI) {
      console.warn('[Warning] MONGODB_URI is not defined in environment variables.');
    }

    await connectToDatabase();
    await initializeBooksCollection();
    await initializeBorrowsCollection();

    const server = app.listen(PORT, '0.0.0.0');

    const handleShutdown = async () => {
      server.close(async () => {
        await closeDatabaseConnection();
        process.exit(0);
      });
    };

    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);

    return server;
  } catch (error) {
    console.error('[BookNook Server] Startup failure:', error);
    process.exit(1);
  }
}


if (typeof require !== 'undefined' && require.main === module) {
  startServer();
}

export { app, startServer };
export default app;
