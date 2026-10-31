import { Router } from 'express';
import {
  getBorrowRecords,
  returnBorrowRecord,
} from '../controllers/borrowController';

const router = Router();

// Borrow transaction history & active loans
router.get('/', getBorrowRecords);

// Return loan by record ID
router.post('/:id/return', returnBorrowRecord);

export default router;
