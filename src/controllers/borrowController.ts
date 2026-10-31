import { Request, Response, NextFunction } from 'express';
import {
  findAllBorrows,
  findBorrowById,
  markRecordAsReturned,
} from '../models/borrowModel';
import { incrementCopies } from '../models/bookModel';
import { ApiResponse } from '../types';

function extractParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
}

export async function getBorrowRecords(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { userEmail, email, bookId, status } = req.query;
    const targetEmail = (userEmail || email) as string;

    const records = await findAllBorrows({
      userEmail: typeof targetEmail === 'string' ? targetEmail : undefined,
      bookId: typeof bookId === 'string' ? bookId : undefined,
      status: (status === 'active' || status === 'returned') ? status : undefined,
    });

    res.status(200).json({
      success: true,
      message: 'Borrow records retrieved successfully.',
      data: records,
      count: records.length,
    });
  } catch (error) {
    next(error);
  }
}

export async function returnBorrowRecord(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const id = extractParam(req.params.id);
    const record = await findBorrowById(id);

    if (!record) {
      res.status(404).json({
        success: false,
        message: 'Borrow record not found.',
      });
      return;
    }

    if (record.returnDate) {
      res.status(400).json({
        success: false,
        message: 'This book loan has already been marked as returned.',
      });
      return;
    }

    const updatedRecord = await markRecordAsReturned(id);
    const updatedBook = await incrementCopies(record.bookId.toString());

    res.status(200).json({
      success: true,
      message: `"${record.bookTitle}" has been returned successfully.`,
      data: {
        borrow: updatedRecord,
        book: updatedBook,
      },
    });
  } catch (error) {
    next(error);
  }
}
