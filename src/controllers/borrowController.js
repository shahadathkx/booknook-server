import {
  findAllBorrows,
  findBorrowById,
  markRecordAsReturned,
} from '../models/borrowModel.js';
import { incrementCopies, findBookById } from '../models/bookModel.js';

/**
 * Controller to list all borrow records with optional status or email filter.
 */
export async function getBorrowRecords(req, res, next) {
  try {
    const { status, email, bookId } = req.query;
    const borrows = await findAllBorrows({
      status,
      borrowerEmail: email,
      bookId,
    });

    res.status(200).json({
      success: true,
      message: 'Borrow records retrieved successfully',
      data: borrows,
      count: borrows.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to return a book directly using the borrow record ID.
 */
export async function returnBorrowRecord(req, res, next) {
  try {
    const { id } = req.params;
    const record = await findBorrowById(id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Borrow record not found.',
      });
    }

    if (record.status === 'returned') {
      return res.status(400).json({
        success: false,
        message: 'This book has already been returned.',
      });
    }

    const updatedRecord = await markRecordAsReturned(id);
    const updatedBook = await incrementCopies(record.bookId.toString());

    res.status(200).json({
      success: true,
      message: `"${record.bookTitle}" has been returned successfully.`,
      data: {
        borrowRecord: updatedRecord,
        book: updatedBook,
      },
    });
  } catch (error) {
    next(error);
  }
}
