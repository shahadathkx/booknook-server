import { Router } from 'express';
import {
  getBooks,
  getBookById,
  addBook,
  borrowBook,
  returnBook,
} from '../controllers/bookController';

const router = Router();

// Catalog routes
router.get('/', getBooks);
router.post('/', addBook);
router.get('/:id', getBookById);

// Checkout & Return actions
router.post('/:id/borrow', borrowBook);
router.post('/:id/return', returnBook);

export default router;
