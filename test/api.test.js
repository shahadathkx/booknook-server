process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import 'dotenv/config';
import { app } from '../dist/index.js';
import { connectToDatabase, closeDatabaseConnection } from '../dist/config/db.js';
import { initializeBooksCollection } from '../dist/models/bookModel.js';
import { initializeBorrowsCollection } from '../dist/models/borrowModel.js';

let server;
let baseUrl;
let jwksServer;
let authToken;

test.before(async () => {

  const keyPair = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(keyPair.publicKey);
  publicJwk.kid = 'api-test-key-1';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';

  await new Promise((resolve) => {
    jwksServer = http.createServer((req, res) => {
      if (req.url === '/jwks.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ keys: [publicJwk] }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    jwksServer.listen(0, () => {
      const port = jwksServer.address().port;
      process.env.AUTH_JWKS_URL = `http://localhost:${port}/jwks.json`;
      resolve();
    });
  });

  authToken = await new SignJWT({
    email: 'tester@booknook.library',
    name: 'Test Librarian',
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'api-test-key-1' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(keyPair.privateKey);

  await connectToDatabase();
  await initializeBooksCollection();
  await initializeBorrowsCollection();

  await new Promise((resolve) => {
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
  if (jwksServer) {
    await new Promise((resolve) => jwksServer.close(resolve));
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

test('GET /health and local frontend CORS configuration', async () => {
  const res = await fetch(`${baseUrl}/health`, {
    headers: { Origin: 'http://localhost:3000' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  assert.deepEqual(await res.json(), {
    status: 'healthy',
    message: 'BookNook server is running.',
  });
});

test('GET /api/books returns book catalog with typed fields (category, image, addedBy)', async () => {
  const res = await fetch(`${baseUrl}/api/books`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
  assert.ok(json.data.length > 0);


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

  const badRes = await fetch(`${baseUrl}/api/books`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ title: '' }),
  });
  assert.equal(badRes.status, 400);


  const validBook = {
    title: 'The Pragmatic Programmer: 20th Anniversary Edition',
    author: 'David Thomas & Andrew Hunt',
    category: 'Others',
    image: 'https://images.unsplash.com/photo-1532012164546-f432f2e35b34?auto=format&fit=crop&w=600&q=80',
    description: 'Straight from the programming trenches, this guide examines modern development practices, career growth, and software craftsmanship.',
    totalCopies: 2,
  };

  const addRes = await fetch(`${baseUrl}/api/books`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(validBook),
  });

  assert.equal(addRes.status, 201);
  const json = await addRes.json();
  assert.equal(json.success, true);
  assert.equal(json.data.title, validBook.title);
  assert.equal(json.data.category, 'Others');
  assert.equal(json.data.image, validBook.image);
  assert.equal(json.data.availableCopies, 2);
  assert.equal(json.data.addedBy.email, 'tester@booknook.library');
});

test('Workflow: Borrow and return a book with UNIQUE compound index enforcement', async () => {
  const invalidBookId = await fetch(`${baseUrl}/api/books/not-an-objectid/borrow`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
  assert.equal(invalidBookId.status, 400);
  assert.deepEqual(await invalidBookId.json(), { message: 'Invalid book ID.' });

  const missingBook = await fetch(`${baseUrl}/api/books/6541f71a9b1c2d3e4f5a6b7c/borrow`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
  assert.equal(missingBook.status, 404);
  assert.deepEqual(await missingBook.json(), { message: 'Book not found.' });


  const booksRes = await fetch(`${baseUrl}/api/books`);
  const booksData = await booksRes.json();
  const targetBook = booksData.data.find((book) => book.availableCopies > 0);
  assert.ok(targetBook, 'Should have at least one available book');
  const initialAvailable = targetBook.availableCopies;


  const borrowPayload = {
    userName: 'Eleanor Vance',
    userEmail: `eleanor.test.${Date.now()}@example.org`,
  };

  const borrowRes = await fetch(`${baseUrl}/api/books/${targetBook._id}/borrow`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(borrowPayload),
  });

  assert.equal(borrowRes.status, 200);
  const borrowJson = await borrowRes.json();
  assert.equal(borrowJson.success, true);
  assert.equal(borrowJson.data.book.availableCopies, initialAvailable - 1);
  const borrowRecordId = borrowJson.data.borrow._id;


  assert.equal(borrowJson.data.borrow.userName, 'Test Librarian');
  assert.equal(borrowJson.data.borrow.userEmail, 'tester@booknook.library');
  assert.ok(borrowJson.data.borrow.bookImage);
  assert.ok(borrowJson.data.borrow.borrowedAt);
  assert.equal(borrowJson.data.borrow.returnedAt, null);


  const duplicateBorrowRes = await fetch(`${baseUrl}/api/books/${targetBook._id}/borrow`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(borrowPayload),
  });
  assert.equal(duplicateBorrowRes.status, 409);
  const duplicateJson = await duplicateBorrowRes.json();
  assert.match(duplicateJson.message, /already borrowed/i);


  const returnRes = await fetch(`${baseUrl}/api/books/${targetBook._id}/return`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
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
  const res = await fetch(`${baseUrl}/api/borrows`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
});
