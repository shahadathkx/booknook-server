import { Router } from 'express';
import {
  getBorrowRecords,
  returnBorrowRecord,
} from '../controllers/borrowController.js';

const router = Router();

// Retrieve borrow records (supports ?status=active or ?email=...)
router.get('/', getBorrowRecords);

// Return book directly by borrow record ID
router.post('/:id/return', returnBorrowRecord);

export default router;
