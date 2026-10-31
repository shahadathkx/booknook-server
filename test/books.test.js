process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import 'dotenv/config';
import { app } from '../dist/index.js';
import { connectToDatabase, closeDatabaseConnection } from '../dist/config/db.js';
import { initializeBooksCollection, getBooksCollection } from '../dist/models/bookModel.js';
import { initializeBorrowsCollection, getBorrowsCollection } from '../dist/models/borrowModel.js';

let appServer;
let baseUrl;
let jwksServer;
let keyPair;
let publicJwk;

const OWNER_EMAIL = 'owner@booknook.library';
const STRANGER_EMAIL = 'stranger@other.library';

let ownerToken;
let strangerToken;

test.before(async () => {
  // 1. Setup ephemeral JWKS server for BetterAuth JWT verification
  keyPair = await generateKeyPair('RS256');
  publicJwk = await exportJWK(keyPair.publicKey);
  publicJwk.kid = 'books-test-key-1';
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

  // Generate tokens for owner and stranger
  ownerToken = await new SignJWT({ email: OWNER_EMAIL, name: 'Owner User' })
    .setProtectedHeader({ alg: 'RS256', kid: 'books-test-key-1' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(keyPair.privateKey);

  strangerToken = await new SignJWT({ email: STRANGER_EMAIL, name: 'Stranger User' })
    .setProtectedHeader({ alg: 'RS256', kid: 'books-test-key-1' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(keyPair.privateKey);

  // 2. Connect DB & start Express
  await connectToDatabase();
  await initializeBooksCollection();
  await initializeBorrowsCollection();

  await new Promise((resolve) => {
    appServer = app.listen(0, () => {
      const port = appServer.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (appServer) {
    await new Promise((resolve) => appServer.close(resolve));
  }
  if (jwksServer) {
    await new Promise((resolve) => jwksServer.close(resolve));
  }
  await closeDatabaseConnection();
});

test('GET /books: public route supports ?limit, ?sort=newest, ?category, ?search', async () => {
  // Public request without token
  const res = await fetch(`${baseUrl}/books?limit=6&sort=newest`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(json.data.length <= 6);

  // Filter by category
  const catRes = await fetch(`${baseUrl}/books?category=Fiction`);
  assert.equal(catRes.status, 200);
  const catJson = await catRes.json();
  assert.ok(catJson.data.every(b => b.category === 'Fiction'));

  // Search case-insensitive
  const searchRes = await fetch(`${baseUrl}/books?search=harper`);
  assert.equal(searchRes.status, 200);
  const searchJson = await searchRes.json();
  assert.ok(searchJson.data.length > 0);
  assert.match(searchJson.data[0].author, /harper/i);
});

test('GET /books?email=: requires JWT and ensures email matches token email', async () => {
  // 1. Calling ?email without JWT returns 401
  const noTokenRes = await fetch(`${baseUrl}/books?email=${OWNER_EMAIL}`);
  assert.equal(noTokenRes.status, 401);
  const noTokenJson = await noTokenRes.json();
  assert.equal(noTokenJson.success, false);

  // 2. Calling ?email with mismatched token returns 403 Forbidden
  const mismatchRes = await fetch(`${baseUrl}/books?email=${OWNER_EMAIL}`, {
    headers: { Authorization: `Bearer ${strangerToken}` },
  });
  assert.equal(mismatchRes.status, 403);
  const mismatchJson = await mismatchRes.json();
  assert.equal(mismatchJson.success, false);
  assert.match(mismatchJson.message, /forbidden/i);

  // 3. Calling ?email with matching token returns 200
  const matchRes = await fetch(`${baseUrl}/books?email=${OWNER_EMAIL}`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(matchRes.status, 200);
  const matchJson = await matchRes.json();
  assert.equal(matchJson.success, true);
});

test('POST /books (protected): validates fields, sets copies, createdAt, and addedBy from token', async () => {
  // Missing token -> 401
  const noToken = await fetch(`${baseUrl}/books`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Test Book' }),
  });
  assert.equal(noToken.status, 401);

  // Invalid category -> 400
  const badCategory = await fetch(`${baseUrl}/books`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({
      title: 'Bad Category Book',
      author: 'Author',
      category: 'ComicBook',
      description: 'A valid description.',
      totalCopies: 3,
    }),
  });
  assert.equal(badCategory.status, 400);

  // Valid creation
  const validPayload = {
    title: 'The Silmarillion',
    author: 'J.R.R. Tolkien',
    category: 'Fiction',
    description: 'A collection of mythopoeic stories detailing the creation of Eä and the history of Middle-earth.',
    totalCopies: 4,
    // Attempt to spoof addedBy in body: should be ignored!
    addedBy: { name: 'Spoofer', email: 'spoofer@hacker.io' },
  };

  const createRes = await fetch(`${baseUrl}/books`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify(validPayload),
  });

  assert.equal(createRes.status, 201);
  const createJson = await createRes.json();
  assert.equal(createJson.success, true);
  const createdBook = createJson.data;

  assert.equal(createdBook.title, validPayload.title);
  assert.equal(createdBook.totalCopies, 4);
  assert.equal(createdBook.availableCopies, 4, 'availableCopies should equal totalCopies');
  assert.ok(createdBook.createdAt);

  // Strict check: addedBy MUST come from token (ownerToken), not spoofed body
  assert.equal(createdBook.addedBy.email, OWNER_EMAIL);
  assert.equal(createdBook.addedBy.name, 'Owner User');
});

test('GET /books/:id (protected): validates ObjectId, returns 404 if missing/invalid', async () => {
  // Missing token -> 401
  const noAuth = await fetch(`${baseUrl}/books/invalid-id`);
  assert.equal(noAuth.status, 401);

  // Invalid ObjectId -> 404
  const invalidIdRes = await fetch(`${baseUrl}/books/not-an-id`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(invalidIdRes.status, 404);

  // Non-existent valid ObjectId -> 404
  const nonExistentRes = await fetch(`${baseUrl}/books/6541f71a9b1c2d3e4f5a6b7c`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(nonExistentRes.status, 404);

  // Existing book -> 200
  const booksRes = await fetch(`${baseUrl}/books?limit=1`);
  const booksJson = await booksRes.json();
  const book = booksJson.data[0];

  const getRes = await fetch(`${baseUrl}/books/${book._id}`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(getRes.status, 200);
  const getJson = await getRes.json();
  assert.equal(getJson.data._id, book._id);
});

test('PATCH /books/:id (protected): only owner can update; adjusts availableCopies by difference', async () => {
  // 1. Create a book by owner
  const createRes = await fetch(`${baseUrl}/books`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({
      title: 'Dune',
      author: 'Frank Herbert',
      category: 'Science',
      description: 'Set on the desert planet Arrakis, Dune is the story of Paul Atreides.',
      totalCopies: 5,
    }),
  });
  const book = (await createRes.json()).data;

  // 2. Attempt update by non-owner -> 403 Forbidden
  const strangerUpdate = await fetch(`${baseUrl}/books/${book._id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${strangerToken}`,
    },
    body: JSON.stringify({ title: 'Hacked Dune' }),
  });
  assert.equal(strangerUpdate.status, 403);

  // 3. Update by owner: change title and increase totalCopies from 5 to 8 (diff = +3)
  const ownerUpdate = await fetch(`${baseUrl}/books/${book._id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({
      title: 'Dune: Deluxe Edition',
      totalCopies: 8,
    }),
  });
  assert.equal(ownerUpdate.status, 200);
  const updateJson = await ownerUpdate.json();
  assert.equal(updateJson.data.title, 'Dune: Deluxe Edition');
  assert.equal(updateJson.data.totalCopies, 8);
  assert.equal(updateJson.data.availableCopies, 8, 'availableCopies should increase by +3');

  // 4. Update totalCopies downwards to 2 (diff = -6 -> available should adjust and never below 0)
  const reduceUpdate = await fetch(`${baseUrl}/books/${book._id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({ totalCopies: 2 }),
  });
  assert.equal(reduceUpdate.status, 200);
  const reduceJson = await reduceUpdate.json();
  assert.equal(reduceJson.data.totalCopies, 2);
  assert.equal(reduceJson.data.availableCopies, 2);
});

test('DELETE /books/:id (protected): only owner can delete; also removes related borrows', async () => {
  // 1. Create a book by owner
  const createRes = await fetch(`${baseUrl}/books`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({
      title: 'Foundation',
      author: 'Isaac Asimov',
      category: 'Science',
      description: 'The story of the Galactic Empire and psychohistory by Hari Seldon.',
      totalCopies: 2,
    }),
  });
  const book = (await createRes.json()).data;

  // Insert a test borrow record linked to this book
  await getBorrowsCollection().insertOne({
    bookId: book._id,
    bookTitle: book.title,
    bookImage: book.image,
    userEmail: 'patron@example.com',
    userName: 'Patron',
    borrowDate: new Date(),
    returnDate: null,
  });

  // 2. Stranger tries to delete -> 403 Forbidden
  const strangerDel = await fetch(`${baseUrl}/books/${book._id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${strangerToken}` },
  });
  assert.equal(strangerDel.status, 403);

  // 3. Owner deletes -> 200 OK
  const ownerDel = await fetch(`${baseUrl}/books/${book._id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(ownerDel.status, 200);

  // Verify book is gone from db
  const deletedBook = await getBooksCollection().findOne({ _id: book._id });
  assert.equal(deletedBook, null);

  // Verify related borrows are removed from borrows collection
  const remainingBorrows = await getBorrowsCollection().find({
    $or: [{ bookId: book._id }, { bookId: new (await import('mongodb')).ObjectId(book._id) }],
  }).toArray();
  assert.equal(remainingBorrows.length, 0);
});
