import { ObjectId, Collection, Filter } from 'mongodb';
import { getDb } from '../config/db';
import { initialBooks } from '../seed/seedData';
import { Book, BookCategory } from '../types';

const COLLECTION_NAME = 'books';

export function getBooksCollection(): Collection<Book> {
  return getDb().collection<Book>(COLLECTION_NAME);
}

export async function initializeBooksCollection(): Promise<void> {
  const collection = getBooksCollection();

  try {
    await collection.createIndex({ category: 1 });
    await collection.createIndex({ availableCopies: 1 });
    await collection.createIndex({ createdAt: -1 });


    const indexes = await collection.indexes();
    const hasTextIndex = indexes.some((idx) => idx.key && (idx.key as any)._fts === 'text');
    if (!hasTextIndex) {
      await collection.createIndex({ title: 'text', author: 'text', description: 'text' });
    }
  } catch (err: any) {
    console.warn('[Books] Index creation notice:', err.message);
  }


  try {
    await collection.updateMany(
      { category: { $exists: false } } as any,
      [
        {
          $set: {
            category: { $ifNull: ['$genre', 'Fiction'] },
            image: { $ifNull: ['$coverImage', 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80'] },
            addedBy: {
              name: { $ifNull: ['$addedBy.name', 'BookNook Curator'] },
              email: { $ifNull: ['$addedBy.email', 'curator@booknook.library'] },
            },
          },
        },
      ]
    );
  } catch {

  }

  const count = await collection.countDocuments();
  if (count === 0) {
    const timestampedSeed = initialBooks.map((book) => ({
      ...book,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await collection.insertMany(timestampedSeed as any);
  }
}

export interface BookFilterOptions {
  search?: string;
  category?: string;
  availableOnly?: boolean;
}

export async function findAllBooks({ search, category, availableOnly }: BookFilterOptions = {}): Promise<Book[]> {
  const collection = getBooksCollection();
  const query: Filter<Book> = {};

  if (category && category !== 'all') {
    query.category = { $regex: new RegExp(`^${category}$`, 'i') } as any;
  }

  if (availableOnly) {
    query.availableCopies = { $gt: 0 } as any;
  }

  if (search && search.trim()) {
    const term = search.trim();
    query.$or = [
      { title: { $regex: term, $options: 'i' } } as any,
      { author: { $regex: term, $options: 'i' } } as any,
      { category: { $regex: term, $options: 'i' } } as any,
      { description: { $regex: term, $options: 'i' } } as any,
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
  category: BookCategory;
  image?: string;
  description: string;
  totalCopies?: number;
  addedBy?: { name: string; email: string };
}

export async function insertBook(data: CreateBookInput): Promise<Book> {
  const collection = getBooksCollection();
  const total = Number(data.totalCopies) || 1;
  const now = new Date();

  const newBook: Book = {
    title: data.title.trim(),
    author: data.author.trim(),
    category: data.category,
    image: data.image && data.image.trim()
      ? data.image.trim()
      : 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
    description: data.description.trim(),
    totalCopies: total,
    availableCopies: total,
    addedBy: {
      name: (data.addedBy?.name || 'BookNook Curator').trim(),
      email: (data.addedBy?.email || 'curator@booknook.library').trim().toLowerCase(),
    },
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(newBook as any);
  return { ...newBook, _id: result.insertedId };
}

export async function decrementCopies(id: string): Promise<Book | null> {
  if (!/^[a-f\d]{24}$/i.test(id) || !ObjectId.isValid(id)) return null;
  const collection = getBooksCollection();
  const objectId = new ObjectId(id);
  return collection.findOneAndUpdate(
    { _id: objectId as any, availableCopies: { $gt: 0 } as any },
    {
      $inc: { availableCopies: -1 },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after' }
  ) as Promise<Book | null>;
}

export async function incrementCopies(id: string): Promise<Book | null> {
  if (!/^[a-f\d]{24}$/i.test(id) || !ObjectId.isValid(id)) return null;
  const collection = getBooksCollection();
  const objectId = new ObjectId(id);
  return collection.findOneAndUpdate(
    {
      _id: objectId as any,
      $expr: { $lt: ['$availableCopies', '$totalCopies'] },
    },
    {
      $inc: { availableCopies: 1 },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after' }
  ) as Promise<Book | null>;
}
