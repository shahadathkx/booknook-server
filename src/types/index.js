/**
 * @typedef {'available' | 'borrowed'} BookStatus
 */

/**
 * @typedef {Object} Book
 * @property {string} [_id]
 * @property {string} title - Title of the book
 * @property {string} author - Author of the book
 * @property {string} genre - Category or genre
 * @property {string} description - Meaningful book summary (no lorem ipsum)
 * @property {string} [coverImage] - Cover image URL
 * @property {number} totalCopies - Total copies owned by the library
 * @property {number} availableCopies - Number of copies currently available to borrow
 * @property {BookStatus} status - 'available' when copies > 0, otherwise 'borrowed'
 * @property {Date|string} [createdAt]
 * @property {Date|string} [updatedAt]
 */

/**
 * @typedef {'active' | 'returned'} BorrowStatus
 */

/**
 * @typedef {Object} BorrowRecord
 * @property {string} [_id]
 * @property {string} bookId - Reference to the borrowed book
 * @property {string} bookTitle - Snapshot title of the book
 * @property {string} borrowerName - Full name of the borrower
 * @property {string} borrowerEmail - Email of the borrower
 * @property {Date|string} borrowDate - Timestamp when the book was checked out
 * @property {Date|string} dueDate - Expected return date
 * @property {Date|string|null} returnDate - Timestamp when the book was returned, or null if active
 * @property {BorrowStatus} status - Current state of the borrow record
 */

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} success
 * @property {string} message
 * @property {any} [data]
 * @property {string} [error]
 */

export {};
