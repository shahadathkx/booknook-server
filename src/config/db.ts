import { MongoClient, Db, MongoClientOptions } from 'mongodb';

interface MongoCache {
  client: MongoClient | null;
  promise: Promise<MongoClient> | null;
  db: Db | null;
}

// Global cache declaration to prevent multiple MongoClient connections across hot-reloads and serverless/Render container reuse
declare global {
  // eslint-disable-next-line no-var
  var mongoCache: MongoCache | undefined;
}

const cached: MongoCache = global.mongoCache || {
  client: null,
  promise: null,
  db: null,
};

if (!global.mongoCache) {
  global.mongoCache = cached;
}

/**
 * Initializes and returns the MongoDB database instance using a cached MongoClient.
 * Crucial for serverless environments and container platforms like Render to reuse connection pools.
 */
export async function connectToDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment variables.');
  }

  const dbName = process.env.DB_NAME || 'booknook';

  // Return existing cached db instance if already connected
  if (cached.db) {
    return cached.db;
  }

  // Reuse existing connection promise or initialize a new one
  if (!cached.promise) {
    const options: MongoClientOptions = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    };

    const client = new MongoClient(uri, options);
    cached.promise = client.connect().then((connectedClient) => {
      cached.client = connectedClient;
      return connectedClient;
    });
  }

  try {
    cached.client = await cached.promise;
    cached.db = cached.client.db(dbName);
    console.log(`[Database] Connected successfully to MongoDB: "${dbName}" (cached client)`);
    return cached.db;
  } catch (error) {
    cached.promise = null;
    cached.client = null;
    cached.db = null;
    console.error('[Database] MongoDB connection failure:', error);
    throw error;
  }
}

/**
 * Returns the currently active MongoDB database instance.
 */
export function getDb(): Db {
  if (!cached.db) {
    throw new Error('Database has not been initialized. Call connectToDatabase() first.');
  }
  return cached.db;
}

/**
 * Returns the cached MongoClient instance.
 */
export function getClient(): MongoClient {
  if (!cached.client) {
    throw new Error('MongoClient has not been initialized. Call connectToDatabase() first.');
  }
  return cached.client;
}

/**
 * Gracefully disconnects and clears cached client references.
 */
export async function closeDatabaseConnection(): Promise<void> {
  if (cached.client) {
    await cached.client.close();
    cached.client = null;
    cached.promise = null;
    cached.db = null;
    if (global.mongoCache) {
      global.mongoCache = { client: null, promise: null, db: null };
    }
    console.log('[Database] MongoDB connection closed and cache cleared.');
  }
}
