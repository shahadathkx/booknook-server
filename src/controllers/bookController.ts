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
  findBorrowByBookAndUser,
  findBorrowById,
  markRecordAsReturned,
} from '../models/borrowModel';
import { ApiResponse, BookCategory } from '../types';

const VALID_CATEGORIES: BookCategory[] = ['Fiction', 'Science', 'History', 'Kids', 'Others'];

function extractParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
}

export async function getBooks(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { search, category, availableOnly } = req.query;
    const books = await findAllBooks({
      search: typeof search === 'string' ? search : undefined,
      category: typeof category === 'string' ? category : undefined,
      availableOnly: availableOnly === 'true',
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
    const { title, author, category, image, coverImage, description, totalCopies, addedBy } = req.body;

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

    const validatedCategory = (category && VALID_CATEGORIES.includes(category as BookCategory))
      ? (category as BookCategory)
      : 'Fiction';

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

    const bookImage = (image && typeof image === 'string')
      ? image
      : (coverImage && typeof coverImage === 'string' ? coverImage : undefined);

    const newBook = await insertBook({
      title,
      author,
      category: validatedCategory,
      description,
      totalCopies: copies,
      image: bookImage,
      addedBy: {
        name: (addedBy?.name && typeof addedBy.name === 'string') ? addedBy.name : 'BookNook Curator',
        email: (addedBy?.email && typeof addedBy.email === 'string') ? addedBy.email : 'curator@booknook.library',
      },
    });

    res.status(201).json({
      success: true,
      message: `"${newBook.title}" has been successfully added to the BookNook catalog.`,
      data: newBook,
    });
  } catch (error) {
    next(error);
  }
}

export async function borrowBook(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const bookId = extractParam(req.params.id);
    const { userEmail, borrowerEmail, userName, borrowerName, returnDate } = req.body;

    const email = (userEmail || borrowerEmail) as string;
    const name = (userName || borrowerName) as string;

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({
        success: false,
        message: 'Borrower user name is required.',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
      res.status(400).json({
        success: false,
        message: 'A valid borrower user email address is required.',
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

    // Proactive check before insert
    const existingBorrow = await findBorrowByBookAndUser(bookId, email);
    if (existingBorrow && (!existingBorrow.returnDate || existingBorrow.returnDate === null)) {
      res.status(409).json({
        success: false,
        message: `You have already borrowed "${book.title}". Please return your current copy before borrowing again.`,
      });
      return;
    }

    // Decrement available copies
    const updatedBook = await decrementCopies(bookId);
    if (!updatedBook) {
      res.status(409).json({
        success: false,
        message: `"${book.title}" is no longer available.`,
      });
      return;
    }

    let borrowRecord;
    try {
      borrowRecord = await insertBorrowRecord({
        bookId,
        bookTitle: book.title,
        bookImage: book.image,
        userEmail: email,
        userName: name,
        returnDate: returnDate ? new Date(returnDate) : null,
      });
    } catch (insertError: any) {
      // Revert decrement if unique index constraint triggers
      await incrementCopies(bookId);

      // Handle MongoDB E11000 duplicate key error on compound unique index { bookId: 1, userEmail: 1 }
      if (insertError.code === 11000) {
        res.status(409).json({
          success: false,
          message: `You have already borrowed "${book.title}". Double borrowing is prevented.`,
        });
        return;
      }
      throw insertError;
    }

    res.status(200).json({
      success: true,
      message: `Successfully borrowed "${book.title}". Enjoy your reading!`,
      data: {
        book: updatedBook,
        borrow: borrowRecord,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function returnBook(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const bookId = extractParam(req.params.id);
    const { userEmail, borrowerEmail, borrowId } = req.body;
    const email = (userEmail || borrowerEmail) as string;

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
    } else if (email && typeof email === 'string' && email.trim()) {
      activeBorrow = await findBorrowByBookAndUser(bookId, email);
    } else {
      res.status(400).json({
        success: false,
        message: 'Please provide either the borrowId or userEmail to complete the return.',
      });
      return;
    }

    if (!activeBorrow) {
      res.status(404).json({
        success: false,
        message: `No active borrow record found for "${book.title}".`,
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
        borrow: returnedBorrow,
      },
    });
  } catch (error) {
    next(error);
  }
}
