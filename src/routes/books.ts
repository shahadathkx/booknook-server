import { Router, Response, NextFunction } from 'express';
import { ObjectId, Filter } from 'mongodb';
import { getBooksCollection, incrementCopies } from '../models/bookModel';
import { getBorrowsCollection, insertBorrowRecord, findBorrowByBookAndUser, markRecordAsReturned } from '../models/borrowModel';
import { verifyJWT, AuthRequest } from '../middleware/verifyJWT';
import { Book, BookCategory, ApiResponse } from '../types';

const router = Router();
const VALID_CATEGORIES: BookCategory[] = ['Fiction', 'Science', 'History', 'Kids', 'Others'];

function extractParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
}









router.get('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { limit, sort, category, search } = req.query;

    const query: Filter<Book> = {};


    if (category && typeof category === 'string' && category.trim() && category.toLowerCase() !== 'all') {
      query.category = { $regex: new RegExp(`^${category.trim()}$`, 'i') } as any;
    }


    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      query.$or = [
        { title: { $regex: term, $options: 'i' } } as any,
        { author: { $regex: term, $options: 'i' } } as any,
      ];
    }


    const sortOption: any = {};
    if (sort === 'newest' || !sort) {
      sortOption.createdAt = -1;
    }


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





router.get('/my', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const email = req.user!.email.trim().toLowerCase();
    const books = await getBooksCollection()
      .find({ 'addedBy.email': email })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      message: 'Your books retrieved successfully.',
      data: books,
      count: books.length,
    });
  } catch (error) {
    next(error);
  }
});






router.get('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const id = extractParam(req.params.id);

    if (!/^[a-f\d]{24}$/i.test(id) || !ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid book ID.' });
      return;
    }

    const book = await getBooksCollection().findOne({ _id: new ObjectId(id) as any });

    if (!book) {
      res.status(404).json({ message: 'Book not found.' });
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






router.post('/', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { title, author, category, image, description, totalCopies } = req.body;


    if (!title || typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ message: 'Book title is required.' });
      return;
    }


    if (!author || typeof author !== 'string' || !author.trim()) {
      res.status(400).json({ message: 'Author name is required.' });
      return;
    }


    if (!category || !VALID_CATEGORIES.includes(category as BookCategory)) {
      res.status(400).json({ message: `Category is required and must be one of: ${VALID_CATEGORIES.join(', ')}.` });
      return;
    }


    if (!description || typeof description !== 'string' || !description.trim()) {
      res.status(400).json({ message: 'A meaningful description is required.' });
      return;
    }


    const copies = Number(totalCopies);
    if (isNaN(copies) || copies < 1 || !Number.isInteger(copies)) {
      res.status(400).json({ message: 'totalCopies must be a positive integer of at least 1.' });
      return;
    }


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







router.patch('/:id', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const id = extractParam(req.params.id);

    if (!/^[a-f\d]{24}$/i.test(id) || !ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid book ID.' });
      return;
    }

    const book = await getBooksCollection().findOne({ _id: new ObjectId(id) as any });

    if (!book) {
      res.status(404).json({ message: 'Book not found.' });
      return;
    }


    const tokenEmail = req.user?.email?.toLowerCase();
    const ownerEmail = book.addedBy?.email?.toLowerCase();

    if (!tokenEmail || tokenEmail !== ownerEmail) {
      res.status(403).json({ message: 'Forbidden: Only the user who added this book can update it.' });
      return;
    }

    const { title, author, category, image, description, totalCopies } = req.body;
    const updates: Partial<Book> & Record<string, any> = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ message: 'Title cannot be empty.' });
        return;
      }
      updates.title = title.trim();
    }

    if (author !== undefined) {
      if (typeof author !== 'string' || !author.trim()) {
        res.status(400).json({ message: 'Author cannot be empty.' });
        return;
      }
      updates.author = author.trim();
    }

    if (category !== undefined) {
      if (!VALID_CATEGORIES.includes(category as BookCategory)) {
        res.status(400).json({ message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}.` });
        return;
      }
      updates.category = category as BookCategory;
    }

    if (image !== undefined) {
      if (typeof image !== 'string' || !image.trim()) {
        res.status(400).json({ message: 'Image URL cannot be empty.' });
        return;
      }
      updates.image = image.trim();
    }

    if (description !== undefined) {
      if (typeof description !== 'string' || !description.trim()) {
        res.status(400).json({ message: 'Description cannot be empty.' });
        return;
      }
      updates.description = description.trim();
    }


    if (totalCopies !== undefined) {
      const newTotal = Number(totalCopies);
      if (isNaN(newTotal) || newTotal < 0 || !Number.isInteger(newTotal)) {
        res.status(400).json({ message: 'totalCopies must be a non-negative integer.' });
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





router.delete('/:id', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const id = extractParam(req.params.id);

    if (!/^[a-f\d]{24}$/i.test(id) || !ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid book ID.' });
      return;
    }

    const book = await getBooksCollection().findOne({ _id: new ObjectId(id) as any });

    if (!book) {
      res.status(404).json({ message: 'Book not found.' });
      return;
    }


    const tokenEmail = req.user?.email?.toLowerCase();
    const ownerEmail = book.addedBy?.email?.toLowerCase();

    if (!tokenEmail || tokenEmail !== ownerEmail) {
      res.status(403).json({ message: 'Forbidden: Only the user who added this book can delete it.' });
      return;
    }

    const bookObjectId = new ObjectId(id);


    await getBooksCollection().deleteOne({ _id: bookObjectId as any });


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





router.post('/:id/borrow', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const bookId = extractParam(req.params.id);
    if (!/^[a-f\d]{24}$/i.test(bookId) || !ObjectId.isValid(bookId)) {
      res.status(400).json({ message: 'Invalid book ID.' });
      return;
    }

    const bookObjectId = new ObjectId(bookId);
    const userId = req.user!.userId;
    const userEmail = req.user!.email.trim().toLowerCase();
    const userName = req.user!.name || userEmail.split('@')[0];
    const books = getBooksCollection();
    const borrows = getBorrowsCollection();
    const book = await books.findOne({ _id: bookObjectId as any });
    if (!book) {
      res.status(404).json({ message: 'Book not found.' });
      return;
    }

    const existingBorrow = await borrows.findOne({
      bookId: bookObjectId,
      $and: [
        { $or: [{ userId }, { userEmail }] },
        {
          $or: [
            { returnedAt: null, userId: { $exists: true } },
            { returnedAt: { $exists: false }, returnDate: null },
          ],
        },
      ],
    });
    if (existingBorrow) {
      res.status(409).json({ message: 'You have already borrowed this book' });
      return;
    }

    const updatedBook = await books.findOneAndUpdate(
      { _id: bookObjectId, availableCopies: { $gt: 0 } },
      { $inc: { availableCopies: -1 } },
      { returnDocument: 'after' }
    );
    if (!updatedBook) {
      res.status(400).json({ message: 'Not available' });
      return;
    }

    const borrowedAt = new Date();
    const dueDate = new Date(borrowedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    try {
      const borrowRecord = await insertBorrowRecord({
        bookId,
        bookTitle: book.title,
        bookImage: book.image,
        userId,
        userEmail,
        userName,
        borrowedAt,
        returnedAt: null,
        returnDate: dueDate,
      });

      res.status(200).json({
        success: true,
        message: `Successfully borrowed "${book.title}".`,
        data: { book: updatedBook, borrow: borrowRecord },
      });
    } catch (insertErr: any) {
      await books.updateOne({ _id: bookObjectId }, { $inc: { availableCopies: 1 } });
      if (insertErr.code === 11000) {
        res.status(409).json({ message: 'You have already borrowed this book' });
        return;
      }
      throw insertErr;
    }
  } catch (error) {
    next(error);
  }
});





router.post('/:id/return', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const bookId = extractParam(req.params.id);
    const email = req.user!.email.trim().toLowerCase();
    const { borrowId } = req.body;

    if (!/^[a-f\d]{24}$/i.test(bookId) || !ObjectId.isValid(bookId)) {
      res.status(400).json({ message: 'Invalid book ID.' });
      return;
    }

    const book = await getBooksCollection().findOne({ _id: new ObjectId(bookId) as any });
    if (!book) {
      res.status(404).json({ message: 'Book not found.' });
      return;
    }

    let activeBorrow = null;
    if (borrowId) {
      if (typeof borrowId !== 'string' || !/^[a-f\d]{24}$/i.test(borrowId) || !ObjectId.isValid(borrowId)) {
        res.status(400).json({ message: 'Invalid borrow ID.' });
        return;
      }
      const borrows = getBorrowsCollection();
      activeBorrow = await borrows.findOne({ _id: new ObjectId(borrowId) as any });
    } else if (email) {
      activeBorrow = await findBorrowByBookAndUser(bookId, email);
    }

    if (!activeBorrow || activeBorrow.bookId.toString() !== bookId) {
      res.status(404).json({ message: 'No active borrow record found for this book.' });
      return;
    }

    if (activeBorrow.userId !== req.user!.userId && activeBorrow.userEmail.trim().toLowerCase() !== email) {
      res.status(403).json({ message: 'You can only return your own borrow records.' });
      return;
    }

    if (activeBorrow.returnedAt || (!activeBorrow.userId && activeBorrow.returnDate)) {
      res.status(400).json({ message: 'This borrow has already been returned.' });
      return;
    }

    const returnedBorrow = await markRecordAsReturned(activeBorrow._id!.toString());
    if (!returnedBorrow) {
      res.status(400).json({ message: 'This borrow has already been returned.' });
      return;
    }

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
