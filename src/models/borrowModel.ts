import { ObjectId, Collection, Filter } from 'mongodb';
import { getDb } from '../config/db';
import { BorrowRecord, BorrowStatus } from '../types';

const COLLECTION_NAME = 'borrows';

export function getBorrowsCollection(): Collection<BorrowRecord> {
  return getDb().collection<BorrowRecord>(COLLECTION_NAME);
}

export async function initializeBorrowsCollection(): Promise<void> {
  const collection = getBorrowsCollection();
  await collection.createIndex({ bookId: 1 });
  await collection.createIndex({ borrowerEmail: 1 });
  await collection.createIndex({ status: 1 });
  await collection.createIndex({ borrowDate: -1 });
}

export interface CreateBorrowInput {
  bookId: string;
  bookTitle: string;
  borrowerName: string;
  borrowerEmail: string;
  dueDate?: Date | string;
}

export async function insertBorrowRecord({
  bookId,
  bookTitle,
  borrowerName,
  borrowerEmail,
  dueDate,
}: CreateBorrowInput): Promise<BorrowRecord> {
  const collection = getBorrowsCollection();
  const borrowDate = new Date();
  const calculatedDueDate = dueDate
    ? new Date(dueDate)
    : new Date(borrowDate.getTime() + 14 * 24 * 60 * 60 * 1000);

  const newRecord: BorrowRecord = {
    bookId: new ObjectId(bookId),
    bookTitle,
    borrowerName: borrowerName.trim(),
    borrowerEmail: borrowerEmail.trim().toLowerCase(),
    borrowDate,
    dueDate: calculatedDueDate,
    returnDate: null,
    status: 'active',
  };

  const result = await collection.insertOne(newRecord as any);
  return { ...newRecord, _id: result.insertedId };
}

export async function findActiveBorrow(bookId: string, borrowerEmail: string): Promise<BorrowRecord | null> {
  if (!ObjectId.isValid(bookId)) return null;
  const collection = getBorrowsCollection();
  return collection.findOne({
    bookId: new ObjectId(bookId) as any,
    borrowerEmail: borrowerEmail.trim().toLowerCase(),
    status: 'active',
  });
}

export async function findBorrowById(id: string): Promise<BorrowRecord | null> {
  if (!ObjectId.isValid(id)) return null;
  const collection = getBorrowsCollection();
  return collection.findOne({ _id: new ObjectId(id) as any });
}

export async function markRecordAsReturned(id: string): Promise<BorrowRecord | null> {
  if (!ObjectId.isValid(id)) return null;
  const collection = getBorrowsCollection();
  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(id) as any, status: 'active' },
    {
      $set: {
        status: 'returned',
        returnDate: new Date(),
      }
    },
    { returnDocument: 'after' }
  );
  return result as BorrowRecord | null;
}

export interface BorrowFilterOptions {
  status?: BorrowStatus;
  borrowerEmail?: string;
  bookId?: string;
}

export async function findAllBorrows({ status, borrowerEmail, bookId }: BorrowFilterOptions = {}): Promise<BorrowRecord[]> {
  const collection = getBorrowsCollection();
  const query: Filter<BorrowRecord> = {};

  if (status) {
    query.status = status;
  }
  if (borrowerEmail && borrowerEmail.trim()) {
    query.borrowerEmail = borrowerEmail.trim().toLowerCase();
  }
  if (bookId && ObjectId.isValid(bookId)) {
    query.bookId = new ObjectId(bookId) as any;
  }

  return collection.find(query).sort({ borrowDate: -1 }).toArray();
}
