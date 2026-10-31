import { ObjectId } from 'mongodb';

export type BookStatus = 'available' | 'borrowed';

export interface Book {
  _id?: ObjectId | string;
  title: string;
  author: string;
  genre: string;
  description: string;
  coverImage?: string;
  totalCopies: number;
  availableCopies: number;
  status: BookStatus;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export type BorrowStatus = 'active' | 'returned';

export interface BorrowRecord {
  _id?: ObjectId | string;
  bookId: ObjectId | string;
  bookTitle: string;
  borrowerName: string;
  borrowerEmail: string;
  borrowDate: Date | string;
  dueDate: Date | string;
  returnDate: Date | string | null;
  status: BorrowStatus;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  count?: number;
  error?: string;
  stack?: string;
}
