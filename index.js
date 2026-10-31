import 'dotenv/config';
import { createApp } from './src/app.js';
import { connectToDatabase, closeDatabaseConnection } from './src/config/db.js';
import { initializeBooksCollection } from './src/models/bookModel.js';
import { initializeBorrowsCollection } from './src/models/borrowModel.js';

const PORT = process.env.PORT || 7000;

async function bootstrap() {
  try {
    // Connect to MongoDB
    await connectToDatabase();

    // Initialize collections, schema indexes, and initial books
    await initializeBooksCollection();
    await initializeBorrowsCollection();

    const app = createApp();

    const server = app.listen(PORT, () => {
      console.log(`[BookNook Server] Running smoothly at http://localhost:${PORT}`);
    });

    // Graceful shutdown handling
    const handleShutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Gracefully terminating BookNook server...`);
      server.close(async () => {
        await closeDatabaseConnection();
        process.exit(0);
      });
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    return { app, server };
  } catch (error) {
    console.error('Failed to start BookNook server:', error);
    process.exit(1);
  }
}

bootstrap();