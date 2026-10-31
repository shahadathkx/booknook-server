import {
  findAllBooks,
  findBookById,
  insertBook,
  decrementCopies,
  incrementCopies,
} from '../models/bookModel.js';
import {
  insertBorrowRecord,
  findActiveBorrow,
  findBorrowById,
  markRecordAsReturned,
} from '../models/borrowModel.js';

/**
 * Controller to fetch all books with optional search & filters.
 */
export async function getBooks(req, res, next) {
  try {
    const { search, status, genre } = req.query;
    const books = await findAllBooks({ search, status, genre });
    res.status(200).json({
      success: true,
      message: 'Books retrieved successfully',
      data: books,
      count: books.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to get a single book by ID.
 */
export async function getBookById(req, res, next) {
  try {
    const { id } = req.params;
    const book = await findBookById(id);
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'The requested book could not be found.',
      });
    }
    res.status(200).json({
      success: true,
      message: 'Book details retrieved successfully',
      data: book,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to add a new book to the library catalog.
 */
export async function addBook(req, res, next) {
  try {
    const { title, author, genre, description, totalCopies, coverImage } = req.body;

    // Strict validation
    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Book title is required.',
      });
    }

    if (!author || !author.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Book author is required.',
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A meaningful book description is required.',
      });
    }

    const copies = totalCopies !== undefined ? Number(totalCopies) : 1;
    if (isNaN(copies) || copies < 1 || !Number.isInteger(copies)) {
      return res.status(400).json({
        success: false,
        message: 'Total copies must be a whole positive number (at least 1).',
      });
    }

    const newBook = await insertBook({
      title,
      author,
      genre: genre || 'General',
      description,
      totalCopies: copies,
      coverImage,
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

/**
 * Controller to borrow a book from the library.
 */
export async function borrowBook(req, res, next) {
  try {
    const { id: bookId } = req.params;
    const { borrowerName, borrowerEmail, dueDate } = req.body;

    if (!borrowerName || !borrowerName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Borrower name is required.',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!borrowerEmail || !emailRegex.test(borrowerEmail.trim())) {
      return res.status(400).json({
        success: false,
        message: 'A valid borrower email address is required.',
      });
    }

    const book = await findBookById(bookId);
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'The requested book could not be found.',
      });
    }

    if (book.availableCopies <= 0) {
      return res.status(409).json({
        success: false,
        message: `"${book.title}" is currently out of stock and cannot be borrowed at this time.`,
      });
    }

    // Check if user already borrowed this book and hasn't returned it yet
    const existingLoan = await findActiveBorrow(bookId, borrowerEmail);
    if (existingLoan) {
      return res.status(409).json({
        success: false,
        message: `You currently have an active loan for "${book.title}". Please return your borrowed copy before checking out another.`,
      });
    }

    // Decrement copies atomically
    const updatedBook = await decrementCopies(bookId);
    if (!updatedBook) {
      return res.status(409).json({
        success: false,
        message: `"${book.title}" was just checked out by another patron and is no longer available.`,
      });
    }

    // Create loan transaction
    const borrowRecord = await insertBorrowRecord({
      bookId,
      bookTitle: book.title,
      borrowerName,
      borrowerEmail,
      dueDate,
    });

    const formattedDueDate = new Date(borrowRecord.dueDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    res.status(200).json({
      success: true,
      message: `You have successfully borrowed "${book.title}". Please return it by ${formattedDueDate}.`,
      data: {
        book: updatedBook,
        borrowRecord,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to return a borrowed book.
 */
export async function returnBook(req, res, next) {
  try {
    const { id: bookId } = req.params;
    const { borrowerEmail, borrowId } = req.body;

    const book = await findBookById(bookId);
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'The specified book was not found.',
      });
    }

    let activeBorrow = null;
    if (borrowId) {
      activeBorrow = await findBorrowById(borrowId);
      if (!activeBorrow || activeBorrow.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'No active borrow record was found with this ID.',
        });
      }
    } else if (borrowerEmail && borrowerEmail.trim()) {
      activeBorrow = await findActiveBorrow(bookId, borrowerEmail);
      if (!activeBorrow) {
        return res.status(404).json({
          success: false,
          message: `No active loan found for "${book.title}" associated with ${borrowerEmail}.`,
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide either the borrowId or the borrowerEmail to complete the return.',
      });
    }

    // Mark borrow record returned
    const returnedBorrow = await markRecordAsReturned(activeBorrow._id.toString());
    
    // Increment library copy count
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
