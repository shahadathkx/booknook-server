import { ObjectId } from 'mongodb';

export type BookCategory = 'Fiction' | 'Science' | 'History' | 'Kids' | 'Others';

export interface AddedBy {
  name: string;
  email: string;
}




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




export interface Borrow {
  _id?: ObjectId | string;
  userId: string;
  bookId: ObjectId | string;
  bookTitle: string;
  bookImage: string;
  userEmail: string;
  userName: string;
  borrowedAt: Date;
  returnedAt: Date | null;
  borrowDate?: Date;
  returnDate?: Date | null | string;
}


export type BorrowRecord = Borrow;




export interface ApiResponse<T = any> {
  success?: boolean;
  message: string;
  data?: T;
  count?: number;
  error?: string;
  stack?: string;
}
