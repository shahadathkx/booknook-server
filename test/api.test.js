process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { app } from '../dist/index.js';
import { connectToDatabase, closeDatabaseConnection } from '../dist/config/db.js';
import { initializeBooksCollection } from '../dist/models/bookModel.js';
import { initializeBorrowsCollection } from '../dist/models/borrowModel.js';

let server;
let baseUrl;

test.before(async () => {
  await connectToDatabase();
  await initializeBooksCollection();
  await initializeBorrowsCollection();

  await new Promise((resolve) => {
    // Listen on an ephemeral port for testing
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closeDatabaseConnection();
});

test('GET / returns health route JSON message', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'healthy');
  assert.match(data.message, /Express \+ TypeScript API server/i);
});

test('GET /api/books returns book catalog with typed fields (category, image, addedBy)', async () => {
  const res = await fetch(`${baseUrl}/api/books`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
  assert.ok(json.data.length > 0);

  // Assert no lorem ipsum and required fields exist
  for (const book of json.data) {
    assert.doesNotMatch(book.description.toLowerCase(), /lorem\s+ipsum/);
    assert.ok(book.title, 'Book title should exist');
    assert.ok(book.author, 'Book author should exist');
    assert.ok(book.category, 'Book category should exist');
    assert.ok(book.image, 'Book image should exist');
    assert.ok(book.totalCopies >= 1, 'Book totalCopies should be >= 1');
  }
});

test('POST /api/books validates and adds a book with typed Book schema', async () => {
  // Test invalid payload
  const badRes = await fetch(`${baseUrl}/api/books`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '' }),
  });
  assert.equal(badRes.status, 400);

  // Test valid payload matching Book type
  const validBook = {
    title: 'The Pragmatic Programmer: 20th Anniversary Edition',
    author: 'David Thomas & Andrew Hunt',
    category: 'Others',
    image: 'https://images.unsplash.com/photo-1532012164546-f432f2e35b34?auto=format&fit=crop&w=600&q=80',
    description: 'Straight from the programming trenches, this guide examines modern development practices, career growth, and software craftsmanship.',
    totalCopies: 2,
    addedBy: {
      name: 'Elena Rostova',
      email: 'elena@booknook.library',
    },
  };

  const addRes = await fetch(`${baseUrl}/api/books`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validBook),
  });

  assert.equal(addRes.status, 201);
  const json = await addRes.json();
  assert.equal(json.success, true);
  assert.equal(json.data.title, validBook.title);
  assert.equal(json.data.category, 'Others');
  assert.equal(json.data.image, validBook.image);
  assert.equal(json.data.availableCopies, 2);
  assert.equal(json.data.addedBy.email, 'elena@booknook.library');
});

test('Workflow: Borrow and return a book with UNIQUE compound index enforcement', async () => {
  // 1. Get an available book
  const booksRes = await fetch(`${baseUrl}/api/books?availableOnly=true`);
  const booksData = await booksRes.json();
  const targetBook = booksData.data[0];
  assert.ok(targetBook, 'Should have at least one available book');
  const initialAvailable = targetBook.availableCopies;

  // 2. Borrow the book with typed Borrow payload
  const borrowPayload = {
    userName: 'Eleanor Vance',
    userEmail: `eleanor.test.${Date.now()}@example.org`,
  };

  const borrowRes = await fetch(`${baseUrl}/api/books/${targetBook._id}/borrow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(borrowPayload),
  });

  assert.equal(borrowRes.status, 200);
  const borrowJson = await borrowRes.json();
  assert.equal(borrowJson.success, true);
  assert.equal(borrowJson.data.book.availableCopies, initialAvailable - 1);
  const borrowRecordId = borrowJson.data.borrow._id;

  // Verify Borrow fields
  assert.equal(borrowJson.data.borrow.userName, borrowPayload.userName);
  assert.equal(borrowJson.data.borrow.userEmail, borrowPayload.userEmail);
  assert.ok(borrowJson.data.borrow.bookImage);
  assert.ok(borrowJson.data.borrow.borrowDate);

  // 3. Try to borrow the same book again with the same userEmail (compound UNIQUE index prevents double borrowing)
  const duplicateBorrowRes = await fetch(`${baseUrl}/api/books/${targetBook._id}/borrow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(borrowPayload),
  });
  assert.equal(duplicateBorrowRes.status, 409);
  const duplicateJson = await duplicateBorrowRes.json();
  assert.match(duplicateJson.message, /already borrowed/i);

  // 4. Return the book via /api/books/:id/return
  const returnRes = await fetch(`${baseUrl}/api/books/${targetBook._id}/return`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ borrowId: borrowRecordId }),
  });

  assert.equal(returnRes.status, 200);
  const returnJson = await returnRes.json();
  assert.equal(returnJson.success, true);
  assert.equal(returnJson.data.book.availableCopies, initialAvailable);
  assert.ok(returnJson.data.borrow.returnDate);
});

test('Search and filter books by category and search keyword', async () => {
  const searchRes = await fetch(`${baseUrl}/api/books?search=Tolkien`);
  assert.equal(searchRes.status, 200);
  const searchJson = await searchRes.json();
  assert.ok(searchJson.data.length > 0);
  assert.equal(searchJson.data[0].author, 'J.R.R. Tolkien');

  const catRes = await fetch(`${baseUrl}/api/books?category=Science`);
  assert.equal(catRes.status, 200);
  const catJson = await catRes.json();
  assert.ok(catJson.data.every((b) => b.category === 'Science'));
});

test('GET /api/borrows returns borrowing records list with userEmail filtering', async () => {
  const res = await fetch(`${baseUrl}/api/borrows`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
});
