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

test('GET /api/books returns book catalog without lorem ipsum', async () => {
  const res = await fetch(`${baseUrl}/api/books`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
  assert.ok(json.data.length > 0);

  // Assert no lorem ipsum anywhere
  for (const book of json.data) {
    assert.doesNotMatch(book.description.toLowerCase(), /lorem\s+ipsum/);
    assert.doesNotMatch(book.title.toLowerCase(), /lorem\s+ipsum/);
  }
});

test('POST /api/books validates required fields and adds a book', async () => {
  // Test invalid payload
  const badRes = await fetch(`${baseUrl}/api/books`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '' })
  });
  assert.equal(badRes.status, 400);

  // Test valid payload
  const validBook = {
    title: 'The Pragmatic Programmer',
    author: 'Andrew Hunt & David Thomas',
    genre: 'Software Engineering',
    description: 'Straight from the programming trenches, this timeless guide examines modern software development, covering personal responsibility, career development, and architectural strategies.',
    totalCopies: 2,
    coverImage: 'https://images.unsplash.com/photo-1532012164546-f432f2e35b34?auto=format&fit=crop&w=600&q=80'
  };

  const addRes = await fetch(`${baseUrl}/api/books`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validBook)
  });

  assert.equal(addRes.status, 201);
  const json = await addRes.json();
  assert.equal(json.success, true);
  assert.equal(json.data.title, validBook.title);
  assert.equal(json.data.availableCopies, 2);
  assert.equal(json.data.status, 'available');
});

test('Workflow: Borrow and return a book', async () => {
  // 1. Get an available book
  const booksRes = await fetch(`${baseUrl}/api/books?status=available`);
  const booksData = await booksRes.json();
  const targetBook = booksData.data[0];
  assert.ok(targetBook, 'Should have at least one available book');
  const initialAvailable = targetBook.availableCopies;

  // 2. Borrow the book
  const borrowPayload = {
    borrowerName: 'Eleanor Vance',
    borrowerEmail: 'eleanor.vance@example.org'
  };

  const borrowRes = await fetch(`${baseUrl}/api/books/${targetBook._id}/borrow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(borrowPayload)
  });

  assert.equal(borrowRes.status, 200);
  const borrowJson = await borrowRes.json();
  assert.equal(borrowJson.success, true);
  assert.equal(borrowJson.data.book.availableCopies, initialAvailable - 1);
  const borrowRecordId = borrowJson.data.borrowRecord._id;

  // 3. Try to borrow the same book again with same email (should be prevented)
  const duplicateBorrowRes = await fetch(`${baseUrl}/api/books/${targetBook._id}/borrow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(borrowPayload)
  });
  assert.equal(duplicateBorrowRes.status, 409);

  // 4. Return the book via /api/books/:id/return
  const returnRes = await fetch(`${baseUrl}/api/books/${targetBook._id}/return`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ borrowId: borrowRecordId })
  });

  assert.equal(returnRes.status, 200);
  const returnJson = await returnRes.json();
  assert.equal(returnJson.success, true);
  assert.equal(returnJson.data.book.availableCopies, initialAvailable);
  assert.equal(returnJson.data.borrowRecord.status, 'returned');
});

test('Search and filter books by title, author, and status', async () => {
  const searchRes = await fetch(`${baseUrl}/api/books?search=Tolkien`);
  assert.equal(searchRes.status, 200);
  const searchJson = await searchRes.json();
  assert.ok(searchJson.data.length > 0);
  assert.equal(searchJson.data[0].author, 'J.R.R. Tolkien');

  const statusRes = await fetch(`${baseUrl}/api/books?status=available`);
  assert.equal(statusRes.status, 200);
  const statusJson = await statusRes.json();
  assert.ok(statusJson.data.every(b => b.status === 'available'));
});

test('GET /api/borrows returns borrowing records list', async () => {
  const res = await fetch(`${baseUrl}/api/borrows`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
});
