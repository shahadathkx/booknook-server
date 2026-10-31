import { Router, Response, NextFunction } from 'express';
import { ObjectId, Filter } from 'mongodb';
import { getBooksCollection, decrementCopies, incrementCopies } from '../models/bookModel';
import { getBorrowsCollection, insertBorrowRecord, findBorrowByBookAndUser, markRecordAsReturned } from '../models/borrowModel';
import { verifyJWT, AuthRequest } from '../middleware/verifyJWT';
import { Book, BookCategory, ApiResponse } from '../types';

const router = Router();
const VALID_CATEGORIES: BookCategory[] = ['Fiction', 'Science', 'History', 'Kids', 'Others'];

function extractParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
}

/**
 * GET /books (public)
 * Supports query params:
 * - ?limit=6
 * - ?sort=newest (sorts by createdAt desc)
 * - ?category=
 * - ?search= (case-insensitive across title and author)
 * - ?email= (only that user's books; requires JWT and must match token email)
 */
router.get('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { limit, sort, category, search, email } = req.query;

    const query: Filter<Book> = {};

    // 1. If ?email is supplied, require JWT authentication and ensure email matches token
    if (email) {
      if (typeof email !== 'string' || !email.trim()) {
        res.status(400).json({
          success: false,
          message: 'Invalid email query parameter provided.',
        });
        return;
      }

      // Check and verify JWT token
      await new Promise<void>((resolve, reject) => {
        verifyJWT(req, res, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      // If response already ended (e.g. 401 from verifyJWT), stop execution
      if (res.headersSent) {
        return;
      }

      const tokenEmail = req.user?.email?.toLowerCase();
      const requestedEmail = email.trim().toLowerCase();

      if (!tokenEmail || tokenEmail !== requestedEmail) {
        res.status(403).json({
          success: false,
          message: 'Forbidden: You can only view books added by your own authenticated account.',
        });
        return;
      }

      query['addedBy.email'] = requestedEmail;
    }

    // 2. Filter by category
    if (category && typeof category === 'string' && category.trim() && category.toLowerCase() !== 'all') {
      query.category = { $regex: new RegExp(`^${category.trim()}$`, 'i') } as any;
    }

    // 3. Search by title or author (case-insensitive)
    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      query.$or = [
        { title: { $regex: term, $options: 'i' } } as any,
        { author: { $regex: term, $options: 'i' } } as any,
      ];
    }

    // 4. Sorting: ?sort=newest or default
    const sortOption: any = {};
    if (sort === 'newest' || !sort) {
      sortOption.createdAt = -1;
    }

    // 5. Query execution & limit
    let cursor = getBooksCollection().find(query).sort(sortOption);

    if (limit) {
      const parsedLimit = parseInt(limit as string, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        cursor = cursor.limit(parsedLimit);
      }
    }

    const books = await cursor.toArray();

    res.status(200).json({
      success: true,
      message: 'Books retrieved successfully.',
      data: books,
      count: books.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /books/:id (protected)
 * Validates ObjectId, returns 404 if missing or not found.
 */
router.get('/:id', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const id = extractParam(req.params.id);

    if (!ObjectId.isValid(id)) {
      res.status(404).json({
        success: false,
        message: 'Book not found (invalid ID format).',
      });
      return;
    }

    const book = await getBooksCollection().findOne({ _id: new ObjectId(id) as any });

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
});

/**
 * POST /books (protected)
 * Validates fields, sets availableCopies = totalCopies, sets createdAt = new Date(),
 * takes addedBy from the token (not from the request body).
 */
router.post('/', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { title, author, category, image, description, totalCopies } = req.body;

    // Validate title
    if (!title || typeof title !== 'string' || !title.trim()) {
      res.status(400).json({
        success: false,
        message: 'Book title is required.',
      });
      return;
    }

    // Validate author
    if (!author || typeof author !== 'string' || !author.trim()) {
      res.status(400).json({
        success: false,
        message: 'Author name is required.',
      });
      return;
    }

    // Validate category
    if (!category || !VALID_CATEGORIES.includes(category as BookCategory)) {
      res.status(400).json({
        success: false,
        message: `Category is required and must be one of: ${VALID_CATEGORIES.join(', ')}.`,
      });
      return;
    }

    // Validate description
    if (!description || typeof description !== 'string' || !description.trim()) {
      res.status(400).json({
        success: false,
        message: 'A meaningful description is required.',
      });
      return;
    }

    // Validate totalCopies
    const copies = Number(totalCopies);
    if (isNaN(copies) || copies < 1 || !Number.isInteger(copies)) {
      res.status(400).json({
        success: false,
        message: 'totalCopies must be a positive integer of at least 1.',
      });
      return;
    }

    // Set addedBy strictly from the authenticated token
    const tokenUser = req.user!;
    const addedBy = {
      name: tokenUser.name || tokenUser.email.split('@')[0],
      email: tokenUser.email.toLowerCase(),
    };

    const newBook: Book = {
      title: title.trim(),
      author: author.trim(),
      category: category as BookCategory,
      image: (image && typeof image === 'string' && image.trim())
        ? image.trim()
        : 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
      description: description.trim(),
      totalCopies: copies,
      availableCopies: copies,
      addedBy,
      createdAt: new Date(),
    };

    const result = await getBooksCollection().insertOne(newBook as any);
    newBook._id = result.insertedId;

    res.status(201).json({
      success: true,
      message: `"${newBook.title}" has been successfully added to the BookNook catalog.`,
      data: newBook,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /books/:id (protected)
 * Only the owner (addedBy.email === token email) can update.
 * Allows title, author, category, image, description, totalCopies
 * (adjusts availableCopies by the difference, never below 0).
 */
router.patch('/:id', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const id = extractParam(req.params.id);

    if (!ObjectId.isValid(id)) {
      res.status(404).json({
        success: false,
        message: 'Book not found (invalid ID format).',
      });
      return;
    }

    const book = await getBooksCollection().findOne({ _id: new ObjectId(id) as any });

    if (!book) {
      res.status(404).json({
        success: false,
        message: 'The book you are attempting to update was not found.',
      });
      return;
    }

    // Ownership verification
    const tokenEmail = req.user?.email?.toLowerCase();
    const ownerEmail = book.addedBy?.email?.toLowerCase();

    if (!tokenEmail || tokenEmail !== ownerEmail) {
      res.status(403).json({
        success: false,
        message: 'Forbidden: Only the user who added this book can update it.',
      });
      return;
    }

    const { title, author, category, image, description, totalCopies } = req.body;
    const updates: Partial<Book> & Record<string, any> = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ success: false, message: 'Title cannot be empty.' });
        return;
      }
      updates.title = title.trim();
    }

    if (author !== undefined) {
      if (typeof author !== 'string' || !author.trim()) {
        res.status(400).json({ success: false, message: 'Author cannot be empty.' });
        return;
      }
      updates.author = author.trim();
    }

    if (category !== undefined) {
      if (!VALID_CATEGORIES.includes(category as BookCategory)) {
        res.status(400).json({
          success: false,
          message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}.`,
        });
        return;
      }
      updates.category = category as BookCategory;
    }

    if (image !== undefined) {
      if (typeof image !== 'string' || !image.trim()) {
        res.status(400).json({ success: false, message: 'Image URL cannot be empty.' });
        return;
      }
      updates.image = image.trim();
    }

    if (description !== undefined) {
      if (typeof description !== 'string' || !description.trim()) {
        res.status(400).json({ success: false, message: 'Description cannot be empty.' });
        return;
      }
      updates.description = description.trim();
    }

    // Adjust totalCopies and availableCopies by the difference, never below 0
    if (totalCopies !== undefined) {
      const newTotal = Number(totalCopies);
      if (isNaN(newTotal) || newTotal < 0 || !Number.isInteger(newTotal)) {
        res.status(400).json({
          success: false,
          message: 'totalCopies must be a non-negative integer.',
        });
        return;
      }

      const difference = newTotal - book.totalCopies;
      const newAvailable = Math.max(0, book.availableCopies + difference);

      updates.totalCopies = newTotal;
      updates.availableCopies = newAvailable;
    }

    updates.updatedAt = new Date();

    const updatedBook = await getBooksCollection().findOneAndUpdate(
      { _id: new ObjectId(id) as any },
      { $set: updates },
      { returnDocument: 'after' }
    );

    res.status(200).json({
      success: true,
      message: 'Book updated successfully.',
      data: updatedBook as Book,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /books/:id (protected)
 * Only the owner can delete; also removes related borrows.
 */
router.delete('/:id', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const id = extractParam(req.params.id);

    if (!ObjectId.isValid(id)) {
      res.status(404).json({
        success: false,
        message: 'Book not found (invalid ID format).',
      });
      return;
    }

    const book = await getBooksCollection().findOne({ _id: new ObjectId(id) as any });

    if (!book) {
      res.status(404).json({
        success: false,
        message: 'The book you are attempting to delete was not found.',
      });
      return;
    }

    // Ownership verification
    const tokenEmail = req.user?.email?.toLowerCase();
    const ownerEmail = book.addedBy?.email?.toLowerCase();

    if (!tokenEmail || tokenEmail !== ownerEmail) {
      res.status(403).json({
        success: false,
        message: 'Forbidden: Only the user who added this book can delete it.',
      });
      return;
    }

    const bookObjectId = new ObjectId(id);

    // Delete the book
    await getBooksCollection().deleteOne({ _id: bookObjectId as any });

    // Remove all related borrow records (handles both ObjectId and string bookId)
    const deleteBorrowsResult = await getBorrowsCollection().deleteMany({
      $or: [
        { bookId: bookObjectId as any },
        { bookId: id as any },
      ],
    });

    res.status(200).json({
      success: true,
      message: `"${book.title}" and ${deleteBorrowsResult.deletedCount} related borrow record(s) were successfully deleted.`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /books/:id/borrow (protected)
 * Loan checkout action
 */
router.post('/:id/borrow', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const bookId = extractParam(req.params.id);
    const userEmail = req.body.userEmail || req.user?.email;
    const userName = req.body.userName || req.user?.name;
    const { returnDate } = req.body;

    if (!ObjectId.isValid(bookId)) {
      res.status(404).json({ success: false, message: 'Book not found.' });
      return;
    }

    const book = await getBooksCollection().findOne({ _id: new ObjectId(bookId) as any });
    if (!book) {
      res.status(404).json({ success: false, message: 'Book not found.' });
      return;
    }

    if (book.availableCopies <= 0) {
      res.status(409).json({ success: false, message: `"${book.title}" is currently out of stock.` });
      return;
    }

    // Check duplicate
    const existingBorrow = await findBorrowByBookAndUser(bookId, userEmail);
    if (existingBorrow && !existingBorrow.returnDate) {
      res.status(409).json({ success: false, message: `You have already borrowed "${book.title}".` });
      return;
    }

    const updatedBook = await decrementCopies(bookId);
    if (!updatedBook) {
      res.status(409).json({ success: false, message: `"${book.title}" is no longer available.` });
      return;
    }

    let borrowRecord;
    try {
      borrowRecord = await insertBorrowRecord({
        bookId,
        bookTitle: book.title,
        bookImage: book.image,
        userEmail,
        userName,
        returnDate: returnDate ? new Date(returnDate) : null,
      });
    } catch (insertErr: any) {
      await incrementCopies(bookId);
      if (insertErr.code === 11000) {
        res.status(409).json({ success: false, message: `You have already borrowed "${book.title}".` });
        return;
      }
      throw insertErr;
    }

    res.status(200).json({
      success: true,
      message: `Successfully borrowed "${book.title}".`,
      data: { book: updatedBook, borrow: borrowRecord },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /books/:id/return (protected)
 * Return book action
 */
router.post('/:id/return', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const bookId = extractParam(req.params.id);
    const email = req.user?.email || req.body.userEmail;
    const { borrowId } = req.body;

    if (!ObjectId.isValid(bookId)) {
      res.status(404).json({ success: false, message: 'Book not found.' });
      return;
    }

    const book = await getBooksCollection().findOne({ _id: new ObjectId(bookId) as any });
    if (!book) {
      res.status(404).json({ success: false, message: 'Book not found.' });
      return;
    }

    let activeBorrow = null;
    if (borrowId) {
      const borrows = getBorrowsCollection();
      activeBorrow = await borrows.findOne({ _id: new ObjectId(borrowId) as any });
    } else if (email) {
      activeBorrow = await findBorrowByBookAndUser(bookId, email);
    }

    if (!activeBorrow) {
      res.status(404).json({ success: false, message: 'No active borrow record found for this book.' });
      return;
    }

    const returnedBorrow = await markRecordAsReturned(activeBorrow._id!.toString());
    const updatedBook = await incrementCopies(bookId);

    res.status(200).json({
      success: true,
      message: `"${book.title}" has been successfully returned.`,
      data: { book: updatedBook, borrow: returnedBorrow },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
