import { MongoClient } from 'mongodb';

let client = null;
let db = null;

/**
 * Initializes and returns the MongoDB database connection singleton.
 * @returns {Promise<import('mongodb').Db>}
 */
export async function connectToDatabase() {
  if (db) {
    return db;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not defined');
  }

  const dbName = process.env.DB_NAME || 'booknook';

  try {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
    console.log(`Connected to MongoDB database: ${dbName}`);
    return db;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

/**
 * Returns the active MongoDB database instance.
 * @returns {import('mongodb').Db}
 */
export function getDb() {
  if (!db) {
    throw new Error('Database is not initialized. Call connectToDatabase first.');
  }
  return db;
}

/**
 * Gracefully closes the MongoDB client connection.
 * @returns {Promise<void>}
 */
export async function closeDatabaseConnection() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('MongoDB connection closed.');
  }
}
