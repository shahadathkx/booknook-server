import { ObjectId } from 'mongodb';
import { getDb } from '../config/db.js';

const COLLECTION_NAME = 'borrows';

/**
 * Gets the borrows collection.
 * @returns {import('mongodb').Collection}
 */
export function getBorrowsCollection() {
  return getDb().collection(COLLECTION_NAME);
}

/**
 * Initializes indexes for the borrows collection.
 */
export async function initializeBorrowsCollection() {
  const collection = getBorrowsCollection();
  await collection.createIndex({ bookId: 1 });
  await collection.createIndex({ borrowerEmail: 1 });
  await collection.createIndex({ status: 1 });
  await collection.createIndex({ borrowDate: -1 });
}

/**
 * Inserts a new borrow transaction record.
 * @param {Object} params
 * @param {string} params.bookId
 * @param {string} params.bookTitle
 * @param {string} params.borrowerName
 * @param {string} params.borrowerEmail
 * @param {Date|string} [params.dueDate]
 * @returns {Promise<Object>}
 */
export async function insertBorrowRecord({ bookId, bookTitle, borrowerName, borrowerEmail, dueDate }) {
  const collection = getBorrowsCollection();
  const borrowDate = new Date();
  
  // Default loan period: 14 days if not specified
  const calculatedDueDate = dueDate ? new Date(dueDate) : new Date(borrowDate.getTime() + 14 * 24 * 60 * 60 * 1000);

  const newRecord = {
    bookId: new ObjectId(bookId),
    bookTitle,
    borrowerName: borrowerName.trim(),
    borrowerEmail: borrowerEmail.trim().toLowerCase(),
    borrowDate,
    dueDate: calculatedDueDate,
    returnDate: null,
    status: 'active',
  };

  const result = await collection.insertOne(newRecord);
  return { ...newRecord, _id: result.insertedId };
}

/**
 * Finds an active borrow record for a specific book and borrower email.
 * @param {string} bookId
 * @param {string} borrowerEmail
 * @returns {Promise<Object|null>}
 */
export async function findActiveBorrow(bookId, borrowerEmail) {
  if (!ObjectId.isValid(bookId)) return null;
  const collection = getBorrowsCollection();
  return collection.findOne({
    bookId: new ObjectId(bookId),
    borrowerEmail: borrowerEmail.trim().toLowerCase(),
    status: 'active'
  });
}

/**
 * Finds a borrow record by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function findBorrowById(id) {
  if (!ObjectId.isValid(id)) return null;
  const collection = getBorrowsCollection();
  return collection.findOne({ _id: new ObjectId(id) });
}

/**
 * Marks a borrow record as returned.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function markRecordAsReturned(id) {
  if (!ObjectId.isValid(id)) return null;
  const collection = getBorrowsCollection();
  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(id), status: 'active' },
    {
      $set: {
        status: 'returned',
        returnDate: new Date()
      }
    },
    { returnDocument: 'after' }
  );
  return result;
}

/**
 * Lists borrow records with optional filters.
 * @param {Object} [filter]
 * @param {'active'|'returned'} [filter.status]
 * @param {string} [filter.borrowerEmail]
 * @param {string} [filter.bookId]
 * @returns {Promise<Array<Object>>}
 */
export async function findAllBorrows({ status, borrowerEmail, bookId } = {}) {
  const collection = getBorrowsCollection();
  const query = {};

  if (status) {
    query.status = status;
  }
  if (borrowerEmail && borrowerEmail.trim()) {
    query.borrowerEmail = borrowerEmail.trim().toLowerCase();
  }
  if (bookId && ObjectId.isValid(bookId)) {
    query.bookId = new ObjectId(bookId);
  }

  return collection.find(query).sort({ borrowDate: -1 }).toArray();
}
