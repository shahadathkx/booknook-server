import { ObjectId } from 'mongodb';

export type BookCategory = 'Fiction' | 'Science' | 'History' | 'Kids' | 'Others';

export interface AddedBy {
  name: string;
  email: string;
}

/**
 * Book model representing an item in the BookNook library catalog.
 */
export interface Book {
  _id?: ObjectId | string;
  title: string;
  author: string;
  category: BookCategory;
  image: string;
  description: string;
  totalCopies: number;
  availableCopies: number;
  addedBy: AddedBy;
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * Borrow model representing a book checkout transaction.
 */
export interface Borrow {
  _id?: ObjectId | string;
  bookId: ObjectId | string;
  bookTitle: string;
  bookImage: string;
  userEmail: string;
  userName: string;
  borrowDate: Date;
  returnDate: Date | null | string;
}

// Alias for backwards compatibility
export type BorrowRecord = Borrow;

/**
 * Standard API JSON response structure.
 */
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  count?: number;
  error?: string;
  stack?: string;
}
