import { ObjectId, Collection, Filter } from 'mongodb';
import { getDb } from '../config/db';
import { Borrow } from '../types';

const COLLECTION_NAME = 'borrows';

export function getBorrowsCollection(): Collection<Borrow> {
  return getDb().collection<Borrow>(COLLECTION_NAME);
}





export async function initializeBorrowsCollection(): Promise<void> {
  const collection = getBorrowsCollection();


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

  }


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

  }

  const indexes = await collection.indexes();
  if (indexes.some((index) => index.name === 'unique_book_user_borrow')) {
    await collection.dropIndex('unique_book_user_borrow');
  }


  await collection.createIndex(
    { bookId: 1, userId: 1 },
    {
      unique: true,
      name: 'unique_active_book_user_borrow',
      partialFilterExpression: {
        userId: { $type: 'string' },
        returnedAt: { $type: 'null' },
      },
    }
  );


  await collection.createIndex({ userId: 1, returnedAt: 1 });
  await collection.createIndex({ userEmail: 1 });
  await collection.createIndex({ borrowedAt: -1 });

}

export interface CreateBorrowInput {
  bookId: string;
  bookTitle: string;
  bookImage: string;
  userId?: string;
  userEmail: string;
  userName: string;
  borrowedAt?: Date;
  returnedAt?: Date | null;
  borrowDate?: Date;
  returnDate?: Date | null;
}

export async function insertBorrowRecord({
  bookId,
  bookTitle,
  bookImage,
  userId,
  userEmail,
  userName,
  borrowedAt,
  returnedAt,
  borrowDate,
  returnDate = null,
}: CreateBorrowInput): Promise<Borrow> {
  const collection = getBorrowsCollection();
  const normalizedEmail = userEmail.trim().toLowerCase();
  const loanDate = borrowedAt || borrowDate || new Date();
  const loanReturnDate = returnedAt !== undefined ? returnedAt : null;

  const newBorrow: Borrow = {
    userId: userId || normalizedEmail,
    bookId: new ObjectId(bookId),
    bookTitle,
    bookImage,
    userEmail: normalizedEmail,
    userName: userName.trim(),
    borrowedAt: loanDate,
    returnedAt: loanReturnDate,
    borrowDate: loanDate,
    returnDate: returnDate || loanReturnDate,
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
  const returnedAt = new Date();
  const result = await collection.findOneAndUpdate(
    {
      _id: new ObjectId(id) as any,
      $or: [
        { returnedAt: null },
        { returnedAt: { $exists: false }, returnDate: null },
      ],
    },
    {
      $set: {
        returnedAt,
        returnDate: returnedAt,
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

export interface BorrowWithBook extends Borrow {
  book: Record<string, unknown> | null;
}

export async function findActiveBorrowsByUser(userId: string, userEmail: string): Promise<BorrowWithBook[]> {
  const collection = getBorrowsCollection();
  return collection.aggregate<BorrowWithBook>([
    {
      $match: {
        $and: [
          { $or: [{ userId }, { userEmail: userEmail.trim().toLowerCase() }] },
          {
            $or: [
              { returnedAt: null, userId: { $exists: true } },
              { returnedAt: { $exists: false }, returnDate: null },
            ],
          },
        ],
      },
    },
    { $sort: { borrowedAt: -1, borrowDate: -1 } },
    {
      $lookup: {
        from: 'books',
        localField: 'bookId',
        foreignField: '_id',
        as: 'bookDetails',
      },
    },
    {
      $set: {
        book: { $ifNull: [{ $arrayElemAt: ['$bookDetails', 0] }, null] },
      },
    },
    { $unset: 'bookDetails' },
  ]).toArray();
}
