import { Request, Response, NextFunction } from 'express';
import {
  findAllBorrows,
  findBorrowById,
  markRecordAsReturned,
} from '../models/borrowModel';
import { incrementCopies } from '../models/bookModel';
import { ApiResponse, BorrowStatus } from '../types';

function extractParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
}

export async function getBorrowRecords(req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> {
  try {
    const { status, email, bookId } = req.query;
    const records = await findAllBorrows({
      status: typeof status === 'string' ? (status as BorrowStatus) : undefined,
      borrowerEmail: typeof email === 'string' ? email : undefined,
      bookId: typeof bookId === 'string' ? bookId : undefined,
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

    if (record.status === 'returned') {
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
        borrowRecord: updatedRecord,
        book: updatedBook,
      },
    });
  } catch (error) {
    next(error);
  }
}
