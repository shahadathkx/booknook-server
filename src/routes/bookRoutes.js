import { Router } from 'express';
import {
  getBooks,
  getBookById,
  addBook,
  borrowBook,
  returnBook,
} from '../controllers/bookController.js';

const router = Router();

// Retrieve all books with optional search / filter
router.get('/', getBooks);

// Add a new book to the library catalog
router.post('/', addBook);

// Retrieve single book details
router.get('/:id', getBookById);

// Borrow a book
router.post('/:id/borrow', borrowBook);

// Return a book
router.post('/:id/return', returnBook);

export default router;
