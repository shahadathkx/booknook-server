import { ObjectId } from 'mongodb';
import { getDb } from '../config/db.js';
import { initialBooks } from '../seed/seedData.js';

const COLLECTION_NAME = 'books';

/**
 * Gets the books collection.
 * @returns {import('mongodb').Collection}
 */
export function getBooksCollection() {
  return getDb().collection(COLLECTION_NAME);
}

/**
 * Initializes indexes and populates initial books if empty.
 */
export async function initializeBooksCollection() {
  const collection = getBooksCollection();
  
  // Create search and sort indexes
  await collection.createIndex({ title: 'text', author: 'text', genre: 'text' });
  await collection.createIndex({ status: 1 });
  await collection.createIndex({ createdAt: -1 });

  const count = await collection.countDocuments();
  if (count === 0) {
    const timestampedSeed = initialBooks.map((book) => ({
      ...book,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    await collection.insertMany(timestampedSeed);
    console.log(`Initialized database with ${timestampedSeed.length} curated books.`);
  }
}

/**
 * Fetches books matching optional search filter.
 * @param {Object} [filter]
 * @param {string} [filter.search]
 * @param {string} [filter.status]
 * @param {string} [filter.genre]
 * @returns {Promise<Array<Object>>}
 */
export async function findAllBooks({ search, status, genre } = {}) {
  const collection = getBooksCollection();
  const query = {};

  if (status && (status === 'available' || status === 'borrowed')) {
    query.status = status;
  }

  if (genre && genre !== 'all') {
    query.genre = { $regex: new RegExp(`^${genre}$`, 'i') };
  }

  if (search && search.trim()) {
    const term = search.trim();
    query.$or = [
      { title: { $regex: term, $options: 'i' } },
      { author: { $regex: term, $options: 'i' } },
      { genre: { $regex: term, $options: 'i' } },
    ];
  }

  return collection.find(query).sort({ createdAt: -1 }).toArray();
}

/**
 * Finds a book by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function findBookById(id) {
  if (!ObjectId.isValid(id)) {
    return null;
  }
  const collection = getBooksCollection();
  return collection.findOne({ _id: new ObjectId(id) });
}

/**
 * Adds a new book to the library catalog.
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function insertBook(data) {
  const collection = getBooksCollection();
  const total = Number(data.totalCopies) || 1;
  const now = new Date();

  const newBook = {
    title: data.title.trim(),
    author: data.author.trim(),
    genre: (data.genre || 'General').trim(),
    description: data.description.trim(),
    coverImage: data.coverImage && data.coverImage.trim() 
      ? data.coverImage.trim() 
      : 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
    totalCopies: total,
    availableCopies: total,
    status: 'available',
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(newBook);
  return { ...newBook, _id: result.insertedId };
}

/**
 * Decrements available copies when a book is borrowed.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function decrementCopies(id) {
  if (!ObjectId.isValid(id)) return null;
  const collection = getBooksCollection();
  const objectId = new ObjectId(id);

  // Find book first to ensure availableCopies > 0
  const book = await collection.findOne({ _id: objectId });
  if (!book || book.availableCopies <= 0) {
    return null;
  }

  const updatedAvailable = book.availableCopies - 1;
  const newStatus = updatedAvailable === 0 ? 'borrowed' : 'available';

  const result = await collection.findOneAndUpdate(
    { _id: objectId, availableCopies: { $gt: 0 } },
    {
      $set: {
        availableCopies: updatedAvailable,
        status: newStatus,
        updatedAt: new Date()
      }
    },
    { returnDocument: 'after' }
  );

  return result;
}

/**
 * Increments available copies when a book is returned.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function incrementCopies(id) {
  if (!ObjectId.isValid(id)) return null;
  const collection = getBooksCollection();
  const objectId = new ObjectId(id);

  const book = await collection.findOne({ _id: objectId });
  if (!book) return null;

  const updatedAvailable = Math.min(book.totalCopies, book.availableCopies + 1);

  const result = await collection.findOneAndUpdate(
    { _id: objectId },
    {
      $set: {
        availableCopies: updatedAvailable,
        status: 'available',
        updatedAt: new Date()
      }
    },
    { returnDocument: 'after' }
  );

  return result;
}
