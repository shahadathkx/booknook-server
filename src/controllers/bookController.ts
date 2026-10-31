import { Request, Response, NextFunction } from 'express';
import {
  findAllBooks,
  findBookById,
  insertBook,
  decrementCopies,
  incrementCopies,
} from '../models/bookModel';
import {
  insertBorrowRecord,
  findActiveBorrow,
  findBorrowById,
  markRecordAsReturned,
} from '../models/borrowModel';
import { ApiResponse } from '../types';

function extractParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
}

export async function getBooks(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { search, status, genre } = req.query;
    const books = await findAllBooks({
      search: typeof search === 'string' ? search : undefined,
      status: typeof status === 'string' ? status : undefined,
      genre: typeof genre === 'string' ? genre : undefined,
    });

    res.status(200).json({
      success: true,
      message: 'Books catalog retrieved successfully.',
      data: books,
      count: books.length,
    });
  } catch (error) {
    next(error);
  }
}

export async function getBookById(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const id = extractParam(req.params.id);
    const book = await findBookById(id);

    if (!book) {
      res.status(404).json({
        success: false,
        message: 'The requested book was not found in the catalog.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Book details retrieved successfully.',
      data: book,
    });
  } catch (error) {
    next(error);
  }
}

export async function addBook(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { title, author, genre, description, totalCopies, coverImage } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      res.status(400).json({
        success: false,
        message: 'Book title is required.',
      });
      return;
    }

    if (!author || typeof author !== 'string' || !author.trim()) {
      res.status(400).json({
        success: false,
        message: 'Author name is required.',
      });
      return;
    }

    if (!description || typeof description !== 'string' || !description.trim()) {
      res.status(400).json({
        success: false,
        message: 'A meaningful synopsis or description is required.',
      });
      return;
    }

    const copies = totalCopies !== undefined ? Number(totalCopies) : 1;
    if (isNaN(copies) || copies < 1 || !Number.isInteger(copies)) {
      res.status(400).json({
        success: false,
        message: 'Total copies must be a positive integer of at least 1.',
      });
      return;
    }

    const newBook = await insertBook({
      title,
      author,
      genre: typeof genre === 'string' ? genre : 'General',
      description,
      totalCopies: copies,
      coverImage: typeof coverImage === 'string' ? coverImage : undefined,
    });

    res.status(201).json({
      success: true,
      message: `"${newBook.title}" has been successfully added to the BookNook library.`,
      data: newBook,
    });
  } catch (error) {
    next(error);
  }
}

export async function borrowBook(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const bookId = extractParam(req.params.id);
    const { borrowerName, borrowerEmail, dueDate } = req.body;

    if (!borrowerName || typeof borrowerName !== 'string' || !borrowerName.trim()) {
      res.status(400).json({
        success: false,
        message: 'Borrower name is required.',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!borrowerEmail || typeof borrowerEmail !== 'string' || !emailRegex.test(borrowerEmail.trim())) {
      res.status(400).json({
        success: false,
        message: 'A valid borrower email address is required.',
      });
      return;
    }

    const book = await findBookById(bookId);
    if (!book) {
      res.status(404).json({
        success: false,
        message: 'The requested book was not found.',
      });
      return;
    }

    if (book.availableCopies <= 0) {
      res.status(409).json({
        success: false,
        message: `"${book.title}" is currently out of stock and unavailable to borrow.`,
      });
      return;
    }

    const existingBorrow = await findActiveBorrow(bookId, borrowerEmail);
    if (existingBorrow) {
      res.status(409).json({
        success: false,
        message: `You currently have an active borrowed copy of "${book.title}". Please return it before borrowing again.`,
      });
      return;
    }

    const updatedBook = await decrementCopies(bookId);
    if (!updatedBook) {
      res.status(409).json({
        success: false,
        message: `"${book.title}" is no longer available.`,
      });
      return;
    }

    const borrowRecord = await insertBorrowRecord({
      bookId,
      bookTitle: book.title,
      borrowerName,
      borrowerEmail,
      dueDate,
    });

    const formattedDue = new Date(borrowRecord.dueDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    res.status(200).json({
      success: true,
      message: `Successfully borrowed "${book.title}". Please return it by ${formattedDue}.`,
      data: {
        book: updatedBook,
        borrowRecord,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function returnBook(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const bookId = extractParam(req.params.id);
    const { borrowerEmail, borrowId } = req.body;

    const book = await findBookById(bookId);
    if (!book) {
      res.status(404).json({
        success: false,
        message: 'Book not found in library records.',
      });
      return;
    }

    let activeBorrow = null;
    if (borrowId && typeof borrowId === 'string') {
      activeBorrow = await findBorrowById(borrowId);
      if (!activeBorrow || activeBorrow.status !== 'active') {
        res.status(400).json({
          success: false,
          message: 'No active borrow transaction found with this ID.',
        });
        return;
      }
    } else if (borrowerEmail && typeof borrowerEmail === 'string' && borrowerEmail.trim()) {
      activeBorrow = await findActiveBorrow(bookId, borrowerEmail);
      if (!activeBorrow) {
        res.status(404).json({
          success: false,
          message: `No active borrow record found for "${book.title}" under ${borrowerEmail}.`,
        });
        return;
      }
    } else {
      res.status(400).json({
        success: false,
        message: 'Provide either the borrowId or borrowerEmail to return this book.',
      });
      return;
    }

    const returnedBorrow = await markRecordAsReturned(activeBorrow._id!.toString());
    const updatedBook = await incrementCopies(bookId);

    res.status(200).json({
      success: true,
      message: `"${book.title}" has been successfully returned to BookNook. Thank you!`,
      data: {
        book: updatedBook,
        borrowRecord: returnedBorrow,
      },
    });
  } catch (error) {
    next(error);
  }
}
