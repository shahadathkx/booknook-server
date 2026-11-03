import { Router, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import { getBooksCollection } from '../models/bookModel';
import {
  findActiveBorrowsByUser,
  getBorrowsCollection,
  insertBorrowRecord,
} from '../models/borrowModel';
import { verifyJWT, AuthRequest } from '../middleware/verifyJWT';
import { ApiResponse, Borrow } from '../types';

const router = Router();

function extractParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
}

function isObjectId(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value) && ObjectId.isValid(value);
}

function ownsBorrow(borrow: Borrow, userId: string, userEmail: string): boolean {
  return borrow.userId === userId || borrow.userEmail?.trim().toLowerCase() === userEmail;
}

router.post('/', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  const { bookId } = req.body;

  if (typeof bookId !== 'string' || !isObjectId(bookId)) {
    res.status(400).json({ message: 'A valid bookId is required in the request body.' });
    return;
  }

  const bookObjectId = new ObjectId(bookId);
  const userId = req.user!.userId;
  const userEmail = req.user!.email.trim().toLowerCase();
  const userName = req.user!.name || userEmail.split('@')[0];

  try {
    const books = getBooksCollection();
    const borrows = getBorrowsCollection();
    const book = await books.findOne({ _id: bookObjectId });

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

    const decrement = await books.updateOne(
      { _id: bookObjectId, availableCopies: { $gt: 0 } },
      { $inc: { availableCopies: -1 } }
    );

    if (decrement.matchedCount === 0) {
      res.status(400).json({ message: 'Not available' });
      return;
    }

    const borrowedAt = new Date();
    const dueDate = new Date(borrowedAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    try {
      const borrow = await insertBorrowRecord({
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

      res.status(201).json({
        success: true,
        message: `"${book.title}" borrowed successfully.`,
        data: borrow,
      });
    } catch (error) {
      await books.updateOne({ _id: bookObjectId }, { $inc: { availableCopies: 1 } });

      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        res.status(409).json({ message: 'You have already borrowed this book' });
        return;
      }

      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.get('/', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const borrows = await findActiveBorrowsByUser(req.user!.userId, req.user!.email);

    res.status(200).json({
      success: true,
      message: 'Active borrows retrieved successfully.',
      data: borrows,
      count: borrows.length,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/return', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  const id = extractParam(req.params.id);
  if (!isObjectId(id)) {
    res.status(400).json({ message: 'Invalid borrow ID.' });
    return;
  }

  try {
    const borrows = getBorrowsCollection();
    const books = getBooksCollection();
    const userId = req.user!.userId;
    const userEmail = req.user!.email.trim().toLowerCase();
    const borrowObjectId = new ObjectId(id);
    const borrow = await borrows.findOne({ _id: borrowObjectId });

    if (!borrow) {
      res.status(404).json({ message: 'Borrow record not found.' });
      return;
    }

    if (!ownsBorrow(borrow, userId, userEmail)) {
      res.status(403).json({ message: 'You can only return your own borrow records.' });
      return;
    }

    if (borrow.returnedAt || (!borrow.userId && borrow.returnDate)) {
      res.status(400).json({ message: 'This borrow has already been returned.' });
      return;
    }

    const returnedAt = new Date();
    const updatedBorrow = await borrows.findOneAndUpdate(
      {
        _id: borrowObjectId,
        $and: [
          { $or: [{ userId }, { userEmail }] },
          {
            $or: [
              { returnedAt: null, userId: { $exists: true } },
              { returnedAt: { $exists: false }, returnDate: null },
            ],
          },
        ],
      },
      { $set: { returnedAt, returnDate: returnedAt } },
      { returnDocument: 'after' }
    );

    if (!updatedBorrow) {
      res.status(400).json({ message: 'This borrow has already been returned.' });
      return;
    }

    const bookId = borrow.bookId.toString();
    if (!isObjectId(bookId)) {
      await borrows.updateOne(
        { _id: borrowObjectId },
        { $set: { returnedAt: null, returnDate: borrow.returnDate ?? null } }
      );
      res.status(404).json({ message: 'Book not found.' });
      return;
    }

    try {
      const updatedBook = await books.findOneAndUpdate(
        { _id: new ObjectId(bookId) },
        { $inc: { availableCopies: 1 } },
        { returnDocument: 'after' }
      );

      if (!updatedBook) {
        await borrows.updateOne(
          { _id: borrowObjectId },
          { $set: { returnedAt: null, returnDate: borrow.returnDate ?? null } }
        );
        res.status(404).json({ message: 'Book not found.' });
        return;
      }

      res.status(200).json({
        success: true,
        message: `"${borrow.bookTitle}" returned successfully.`,
        data: { borrow: updatedBorrow, book: updatedBook },
      });
    } catch (error) {
      await borrows.updateOne(
        { _id: borrowObjectId },
        { $set: { returnedAt: null, returnDate: borrow.returnDate ?? null } }
      );
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  const id = extractParam(req.params.id);
  if (!isObjectId(id)) {
    res.status(400).json({ message: 'Invalid borrow ID.' });
    return;
  }

  try {
    const borrows = getBorrowsCollection();
    const books = getBooksCollection();
    const borrowObjectId = new ObjectId(id);
    const borrow = await borrows.findOne({ _id: borrowObjectId });

    if (!borrow) {
      res.status(404).json({ message: 'Borrow record not found.' });
      return;
    }

    if (!ownsBorrow(borrow, req.user!.userId, req.user!.email.trim().toLowerCase())) {
      res.status(403).json({ message: 'You can only return your own borrow records.' });
      return;
    }

    if (borrow.returnedAt) {
      res.status(400).json({ message: 'This borrow has already been returned.' });
      return;
    }

    const deleted = await borrows.deleteOne({ _id: borrowObjectId });
    if (deleted.deletedCount === 1) {
      await books.updateOne(
        { _id: new ObjectId(borrow.bookId.toString()) },
        { $inc: { availableCopies: 1 } }
      );
    }

    res.status(200).json({
      success: true,
      message: `"${borrow.bookTitle}" returned successfully.`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
