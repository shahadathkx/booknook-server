import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { connectToDatabase, closeDatabaseConnection } from './config/db';
import { initializeBooksCollection } from './models/bookModel';
import { initializeBorrowsCollection } from './models/borrowModel';
import booksRouter from './routes/books';
import borrowsRouter from './routes/borrows';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';


const app = express();

declare global {
  var bookNookDatabaseInitialization: Promise<void> | undefined;
}

async function ensureDatabaseReady(): Promise<void> {
  if (!global.bookNookDatabaseInitialization) {
    global.bookNookDatabaseInitialization = (async () => {
      await connectToDatabase();
      await initializeBooksCollection();
      await initializeBorrowsCollection();
    })().catch((error: unknown) => {
      global.bookNookDatabaseInitialization = undefined;
      throw error;
    });
  }

  await global.bookNookDatabaseInitialization;
}

app.use(
  cors({
    origin: (origin, callback) => {
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      const allowedOrigins = [clientUrl, 'http://localhost:3000'];
      callback(null, !origin || allowedOrigins.includes(origin) ? origin : false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


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

app.use(async (_req: Request, _res: Response, next: NextFunction) => {
  try {
    await ensureDatabaseReady();
    next();
  } catch (error) {
    next(error);
  }
});

app.use('/books', booksRouter);
app.use('/api/books', booksRouter);
app.use('/borrows', borrowsRouter);
app.use('/api/borrows', borrowsRouter);


app.use(notFoundHandler);
app.use(errorHandler);


async function startServer() {
  if (process.env.VERCEL) {
    return;
  }

  try {
    const port = Number(process.env.PORT) || 7000;
    if (!process.env.MONGODB_URI) {
      console.warn('[Warning] MONGODB_URI is not defined in environment variables.');
    }

    await ensureDatabaseReady();

    const server = app.listen(port, '0.0.0.0');

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


if (!process.env.VERCEL && typeof require !== 'undefined' && require.main === module) {
  startServer();
}

export { app, startServer };
export default app;
