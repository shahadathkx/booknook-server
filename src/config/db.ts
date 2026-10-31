import { MongoClient, Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Initializes and returns the MongoDB database instance.
 */
export async function connectToDatabase(): Promise<Db> {
  if (db) {
    return db;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment variables.');
  }

  const dbName = process.env.DB_NAME || 'booknook';

  try {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
    console.log(`[Database] Connected successfully to MongoDB: "${dbName}"`);
    return db;
  } catch (error) {
    console.error('[Database] MongoDB connection failure:', error);
    throw error;
  }
}

/**
 * Returns the currently active MongoDB database instance.
 */
export function getDb(): Db {
  if (!db) {
    throw new Error('Database has not been initialized. Call connectToDatabase() first.');
  }
  return db;
}

/**
 * Gracefully disconnects from MongoDB.
 */
export async function closeDatabaseConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('[Database] MongoDB connection closed.');
  }
}
