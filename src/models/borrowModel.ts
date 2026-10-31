import { ObjectId, Collection, Filter } from 'mongodb';
import { getDb } from '../config/db';
import { Borrow } from '../types';

const COLLECTION_NAME = 'borrows';

export function getBorrowsCollection(): Collection<Borrow> {
  return getDb().collection<Borrow>(COLLECTION_NAME);
}

/**
 * Initializes borrows collection schema indexes on startup:
 * Creates a UNIQUE compound index on borrows { bookId: 1, userEmail: 1 } to prevent double borrowing.
 */
export async function initializeBorrowsCollection(): Promise<void> {
  const collection = getBorrowsCollection();

  // Migrate any legacy document fields from earlier test iterations if present
  try {
    await collection.updateMany(
      { userEmail: { $exists: false }, borrowerEmail: { $exists: true } } as any,
      [
        {
          $set: {
            userEmail: '$borrowerEmail',
            userName: { $ifNull: ['$borrowerName', 'Patron'] },
            bookImage: { $ifNull: ['$bookImage', 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80'] },
          },
        },
      ]
    );
  } catch {
    // Non-fatal migration check
  }

  // Deduplicate any existing identical active loans before applying unique index
  try {
    const duplicates = await collection.aggregate([
      { $group: { _id: { bookId: '$bookId', userEmail: '$userEmail' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    for (const dup of duplicates) {
      const idsToDelete = dup.ids.slice(1);
      await collection.deleteMany({ _id: { $in: idsToDelete } });
    }
  } catch {
    // Ignore aggregation error if empty
  }

  // Create UNIQUE compound index on borrows { bookId: 1, userEmail: 1 } to prevent double borrowing
  await collection.createIndex(
    { bookId: 1, userEmail: 1 },
    { unique: true, name: 'unique_book_user_borrow' }
  );

  // Additional lookup indexes
  await collection.createIndex({ userEmail: 1 });
  await collection.createIndex({ borrowDate: -1 });

  console.log('[Borrows] Compound UNIQUE index on { bookId: 1, userEmail: 1 } initialized successfully.');
}

export interface CreateBorrowInput {
  bookId: string;
  bookTitle: string;
  bookImage: string;
  userEmail: string;
  userName: string;
  borrowDate?: Date;
  returnDate?: Date | null;
}

export async function insertBorrowRecord({
  bookId,
  bookTitle,
  bookImage,
  userEmail,
  userName,
  borrowDate,
  returnDate = null,
}: CreateBorrowInput): Promise<Borrow> {
  const collection = getBorrowsCollection();
  const normalizedEmail = userEmail.trim().toLowerCase();

  const newBorrow: Borrow = {
    bookId: new ObjectId(bookId),
    bookTitle,
    bookImage,
    userEmail: normalizedEmail,
    userName: userName.trim(),
    borrowDate: borrowDate || new Date(),
    returnDate: returnDate || null,
  };

  const result = await collection.insertOne(newBorrow as any);
  return { ...newBorrow, _id: result.insertedId };
}

export async function findBorrowById(id: string): Promise<Borrow | null> {
  if (!ObjectId.isValid(id)) return null;
  const collection = getBorrowsCollection();
  return collection.findOne({ _id: new ObjectId(id) as any });
}

export async function findBorrowByBookAndUser(bookId: string, userEmail: string): Promise<Borrow | null> {
  if (!ObjectId.isValid(bookId)) return null;
  const collection = getBorrowsCollection();
  return collection.findOne({
    bookId: new ObjectId(bookId) as any,
    userEmail: userEmail.trim().toLowerCase(),
  });
}

export async function markRecordAsReturned(id: string): Promise<Borrow | null> {
  if (!ObjectId.isValid(id)) return null;
  const collection = getBorrowsCollection();
  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(id) as any },
    {
      $set: {
        returnDate: new Date(),
      },
    },
    { returnDocument: 'after' }
  );
  return result as Borrow | null;
}

export async function deleteBorrowRecord(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const collection = getBorrowsCollection();
  const res = await collection.deleteOne({ _id: new ObjectId(id) as any });
  return res.deletedCount === 1;
}

export interface BorrowFilterOptions {
  userEmail?: string;
  bookId?: string;
  status?: 'active' | 'returned';
}

export async function findAllBorrows({ userEmail, bookId, status }: BorrowFilterOptions = {}): Promise<Borrow[]> {
  const collection = getBorrowsCollection();
  const query: Filter<Borrow> = {};

  if (userEmail && userEmail.trim()) {
    query.userEmail = userEmail.trim().toLowerCase();
  }

  if (bookId && ObjectId.isValid(bookId)) {
    query.bookId = new ObjectId(bookId) as any;
  }

  if (status === 'active') {
    query.returnDate = null;
  } else if (status === 'returned') {
    query.returnDate = { $ne: null } as any;
  }

  return collection.find(query).sort({ borrowDate: -1 }).toArray();
}
