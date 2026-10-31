import { ObjectId, Collection, Filter } from 'mongodb';
import { getDb } from '../config/db';
import { initialBooks } from '../seed/seedData';
import { Book } from '../types';

const COLLECTION_NAME = 'books';

export function getBooksCollection(): Collection<Book> {
  return getDb().collection<Book>(COLLECTION_NAME);
}

export async function initializeBooksCollection(): Promise<void> {
  const collection = getBooksCollection();
  
  await collection.createIndex({ title: 'text', author: 'text', genre: 'text' });
  await collection.createIndex({ status: 1 });
  await collection.createIndex({ createdAt: -1 });

  const count = await collection.countDocuments();
  if (count === 0) {
    const timestampedSeed = initialBooks.map((book) => ({
      ...book,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await collection.insertMany(timestampedSeed as any);
    console.log(`[Seed] Initialized ${timestampedSeed.length} curated books.`);
  }
}

export interface BookFilterOptions {
  search?: string;
  status?: string;
  genre?: string;
}

export async function findAllBooks({ search, status, genre }: BookFilterOptions = {}): Promise<Book[]> {
  const collection = getBooksCollection();
  const query: Filter<Book> = {};

  if (status && (status === 'available' || status === 'borrowed')) {
    query.status = status;
  }

  if (genre && genre !== 'all') {
    query.genre = { $regex: new RegExp(`^${genre}$`, 'i') } as any;
  }

  if (search && search.trim()) {
    const term = search.trim();
    query.$or = [
      { title: { $regex: term, $options: 'i' } } as any,
      { author: { $regex: term, $options: 'i' } } as any,
      { genre: { $regex: term, $options: 'i' } } as any,
    ];
  }

  return collection.find(query).sort({ createdAt: -1 }).toArray();
}

export async function findBookById(id: string): Promise<Book | null> {
  if (!ObjectId.isValid(id)) return null;
  const collection = getBooksCollection();
  return collection.findOne({ _id: new ObjectId(id) as any });
}

export interface CreateBookInput {
  title: string;
  author: string;
  genre?: string;
  description: string;
  totalCopies?: number;
  coverImage?: string;
}

export async function insertBook(data: CreateBookInput): Promise<Book> {
  const collection = getBooksCollection();
  const total = Number(data.totalCopies) || 1;
  const now = new Date();

  const newBook: Book = {
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

  const result = await collection.insertOne(newBook as any);
  return { ...newBook, _id: result.insertedId };
}

export async function decrementCopies(id: string): Promise<Book | null> {
  if (!ObjectId.isValid(id)) return null;
  const collection = getBooksCollection();
  const objectId = new ObjectId(id);

  const book = await collection.findOne({ _id: objectId as any });
  if (!book || book.availableCopies <= 0) {
    return null;
  }

  const updatedAvailable = book.availableCopies - 1;
  const newStatus = updatedAvailable === 0 ? 'borrowed' : 'available';

  const result = await collection.findOneAndUpdate(
    { _id: objectId as any, availableCopies: { $gt: 0 } as any },
    {
      $set: {
        availableCopies: updatedAvailable,
        status: newStatus,
        updatedAt: new Date(),
      }
    },
    { returnDocument: 'after' }
  );

  return result as Book | null;
}

export async function incrementCopies(id: string): Promise<Book | null> {
  if (!ObjectId.isValid(id)) return null;
  const collection = getBooksCollection();
  const objectId = new ObjectId(id);

  const book = await collection.findOne({ _id: objectId as any });
  if (!book) return null;

  const updatedAvailable = Math.min(book.totalCopies, book.availableCopies + 1);

  const result = await collection.findOneAndUpdate(
    { _id: objectId as any },
    {
      $set: {
        availableCopies: updatedAvailable,
        status: 'available',
        updatedAt: new Date(),
      }
    },
    { returnDocument: 'after' }
  );

  return result as Book | null;
}
