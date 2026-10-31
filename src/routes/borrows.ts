import { Router, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import { getBooksCollection } from '../models/bookModel';
import { getBorrowsCollection } from '../models/borrowModel';
import { verifyJWT, AuthRequest } from '../middleware/verifyJWT';
import { Borrow, ApiResponse } from '../types';

const router = Router();

function extractParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
}

/**
 * POST /borrows (protected)
 * Steps:
 * 1. Find the book.
 * 2. Reject if the user already borrowed it (duplicate key error -> 409 "You have already borrowed this book").
 * 3. Atomically decrement availableCopies using updateOne({_id, availableCopies: {$gt: 0}}, {$inc: {availableCopies: -1}}),
 *    and if nothing matched return 400 "Not available".
 * 4. Insert borrow {bookId, bookTitle, bookImage, userEmail, userName, borrowDate: now, returnDate: now + 7 days}.
 * 5. If the insert fails, roll the decrement back.
 */
router.post('/', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  const { bookId } = req.body;

  if (!bookId || typeof bookId !== 'string' || !ObjectId.isValid(bookId)) {
    res.status(400).json({
      success: false,
      message: 'A valid bookId is required in the request body.',
    });
    return;
  }

  const booksCollection = getBooksCollection();
  const borrowsCollection = getBorrowsCollection();
  const userEmail = req.user!.email.trim().toLowerCase();
  const userName = req.user!.name || userEmail.split('@')[0];
  const bookObjectId = new ObjectId(bookId);

  try {
    // 1. Find the book
    const book = await booksCollection.findOne({ _id: bookObjectId as any });
    if (!book) {
      res.status(404).json({
        success: false,
        message: 'Book not found.',
      });
      return;
    }

    // 2. Reject if the user already borrowed it
    const existingBorrow = await borrowsCollection.findOne({
      bookId: bookObjectId as any,
      userEmail,
    });
    if (existingBorrow) {
      res.status(409).json({
        success: false,
        message: 'You have already borrowed this book',
      });
      return;
    }

    // 3. Atomically decrement availableCopies using updateOne
    const updateResult = await booksCollection.updateOne(
      { _id: bookObjectId as any, availableCopies: { $gt: 0 } as any },
      { $inc: { availableCopies: -1 } } as any
    );

    // If nothing matched, return 400 "Not available"
    if (updateResult.matchedCount === 0) {
      res.status(400).json({
        success: false,
        message: 'Not available',
      });
      return;
    }

    // 4. Insert borrow {bookId, bookTitle, bookImage, userEmail, userName, borrowDate: now, returnDate: now + 7 days}
    const now = new Date();
    const returnDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days loan duration

    const newBorrow: Borrow = {
      bookId: bookObjectId,
      bookTitle: book.title,
      bookImage: book.image,
      userEmail,
      userName,
      borrowDate: now,
      returnDate,
    };

    try {
      const insertResult = await borrowsCollection.insertOne(newBorrow as any);
      newBorrow._id = insertResult.insertedId;

      res.status(201).json({
        success: true,
        message: `"${book.title}" borrowed successfully. Due date: ${returnDate.toLocaleDateString()}.`,
        data: newBorrow,
      });
    } catch (insertError: any) {
      // 5. If the insert fails, roll the decrement back
      await booksCollection.updateOne(
        { _id: bookObjectId as any },
        { $inc: { availableCopies: 1 } } as any
      );

      // Handle duplicate key error code 11000 from unique compound index
      if (insertError.code === 11000) {
        res.status(409).json({
          success: false,
          message: 'You have already borrowed this book',
        });
        return;
      }

      throw insertError;
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /borrows (protected)
 * Only the borrows of the logged-in user (email from token), newest first.
 */
router.get('/', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const userEmail = req.user!.email.trim().toLowerCase();
    const borrowsCollection = getBorrowsCollection();

    const userBorrows = await borrowsCollection
      .find({ userEmail })
      .sort({ borrowDate: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      message: 'User borrows retrieved successfully.',
      data: userBorrows,
      count: userBorrows.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /borrows/:id (protected)
 * Only the owner of that borrow; deletes it and $inc availableCopies by +1.
 */
router.delete('/:id', verifyJWT, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const id = extractParam(req.params.id);

    if (!ObjectId.isValid(id)) {
      res.status(404).json({
        success: false,
        message: 'Borrow record not found (invalid ID format).',
      });
      return;
    }

    const borrowsCollection = getBorrowsCollection();
    const booksCollection = getBooksCollection();
    const userEmail = req.user!.email.trim().toLowerCase();

    // 1. Find the borrow record
    const borrow = await borrowsCollection.findOne({ _id: new ObjectId(id) as any });
    if (!borrow) {
      res.status(404).json({
        success: false,
        message: 'Borrow record not found.',
      });
      return;
    }

    // 2. Only the owner of that borrow can delete it
    if (borrow.userEmail.toLowerCase() !== userEmail) {
      res.status(403).json({
        success: false,
        message: 'Forbidden: You can only return and delete your own borrow records.',
      });
      return;
    }

    // 3. Delete the borrow record
    await borrowsCollection.deleteOne({ _id: new ObjectId(id) as any });

    // 4. $inc availableCopies by +1
    await booksCollection.updateOne(
      { _id: new ObjectId(borrow.bookId) as any },
      { $inc: { availableCopies: 1 } } as any
    );

    res.status(200).json({
      success: true,
      message: `"${borrow.bookTitle}" returned successfully and borrow record deleted.`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
