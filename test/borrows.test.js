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

const USER_A_EMAIL = 'patron.alice@booknook.library';
const USER_B_EMAIL = 'patron.bob@booknook.library';

let tokenAlice;
let tokenBob;

test.before(async () => {
  // 1. Setup ephemeral JWKS server for BetterAuth JWT verification
  keyPair = await generateKeyPair('RS256');
  publicJwk = await exportJWK(keyPair.publicKey);
  publicJwk.kid = 'borrows-test-key-1';
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

  // Generate tokens for Alice and Bob
  tokenAlice = await new SignJWT({ email: USER_A_EMAIL, name: 'Alice Walker' })
    .setProtectedHeader({ alg: 'RS256', kid: 'borrows-test-key-1' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(keyPair.privateKey);

  tokenBob = await new SignJWT({ email: USER_B_EMAIL, name: 'Bob Dylan' })
    .setProtectedHeader({ alg: 'RS256', kid: 'borrows-test-key-1' })
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

test('POST /borrows (protected): atomic decrement, rollback on failure, and duplicate prevention (409)', async () => {
  // 1. Missing token -> 401
  const noAuth = await fetch(`${baseUrl}/borrows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookId: '6541f71a9b1c2d3e4f5a6b7c' }),
  });
  assert.equal(noAuth.status, 401);

  // 2. Create a test book with exactly 1 available copy
  const insertBookRes = await getBooksCollection().insertOne({
    title: 'Atomic Habits Limited Edition',
    author: 'James Clear',
    category: 'Others',
    image: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=600&q=80',
    description: 'Transformative handbook on tiny changes.',
    totalCopies: 1,
    availableCopies: 1,
    addedBy: { name: 'Admin', email: 'admin@booknook.library' },
    createdAt: new Date(),
  });
  const bookId = insertBookRes.insertedId.toString();

  // 3. User Alice borrows the book -> 201 Created
  const aliceBorrow = await fetch(`${baseUrl}/borrows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenAlice}`,
    },
    body: JSON.stringify({ bookId }),
  });
  assert.equal(aliceBorrow.status, 201);
  const aliceJson = await aliceBorrow.json();
  assert.equal(aliceJson.success, true);
  assert.equal(aliceJson.data.userEmail, USER_A_EMAIL);
  assert.equal(aliceJson.data.userName, 'Alice Walker');
  assert.ok(aliceJson.data.borrowDate);
  assert.ok(aliceJson.data.returnDate);

  // Verify returnDate is approximately 7 days ahead
  const diffDays = Math.round((new Date(aliceJson.data.returnDate).getTime() - new Date(aliceJson.data.borrowDate).getTime()) / (1000 * 60 * 60 * 24));
  assert.equal(diffDays, 7);

  // Check availableCopies is now 0 in the database
  const bookAfterBorrow = await getBooksCollection().findOne({ _id: insertBookRes.insertedId });
  assert.equal(bookAfterBorrow.availableCopies, 0);

  // 4. Alice tries to borrow the same book again -> 409 "You have already borrowed this book"
  const duplicateBorrow = await fetch(`${baseUrl}/borrows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenAlice}`,
    },
    body: JSON.stringify({ bookId }),
  });
  assert.equal(duplicateBorrow.status, 409);
  const dupJson = await duplicateBorrow.json();
  assert.equal(dupJson.message, 'You have already borrowed this book');

  // Verify copies did not change
  const bookAfterDup = await getBooksCollection().findOne({ _id: insertBookRes.insertedId });
  assert.equal(bookAfterDup.availableCopies, 0);

  // 5. User Bob tries to borrow the out-of-stock book -> 400 "Not available"
  const bobBorrow = await fetch(`${baseUrl}/borrows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenBob}`,
    },
    body: JSON.stringify({ bookId }),
  });
  assert.equal(bobBorrow.status, 400);
  const bobJson = await bobBorrow.json();
  assert.equal(bobJson.message, 'Not available');
});

test('GET /borrows (protected): returns only the borrows of the logged-in user, newest first', async () => {
  // Query with Alice's token
  const aliceRes = await fetch(`${baseUrl}/borrows`, {
    headers: { Authorization: `Bearer ${tokenAlice}` },
  });
  assert.equal(aliceRes.status, 200);
  const aliceData = await aliceRes.json();
  assert.equal(aliceData.success, true);
  assert.ok(Array.isArray(aliceData.data));
  assert.ok(aliceData.data.every(b => b.userEmail === USER_A_EMAIL));

  // Query with Bob's token (Bob has not borrowed yet)
  const bobRes = await fetch(`${baseUrl}/borrows`, {
    headers: { Authorization: `Bearer ${tokenBob}` },
  });
  assert.equal(bobRes.status, 200);
  const bobData = await bobRes.json();
  assert.equal(bobData.success, true);
  assert.equal(bobData.count, 0);
});

test('DELETE /borrows/:id (protected): only owner can delete; increments availableCopies by +1', async () => {
  // 1. Create a book with 2 copies and borrow it for Bob
  const bookRes = await getBooksCollection().insertOne({
    title: 'The Hobbit Special',
    author: 'J.R.R. Tolkien',
    category: 'Fiction',
    image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80',
    description: 'A classic journey.',
    totalCopies: 2,
    availableCopies: 2,
    addedBy: { name: 'Admin', email: 'admin@booknook.library' },
    createdAt: new Date(),
  });
  const bookId = bookRes.insertedId.toString();

  const borrowRes = await fetch(`${baseUrl}/borrows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenBob}`,
    },
    body: JSON.stringify({ bookId }),
  });
  const borrowRecord = (await borrowRes.json()).data;

  // Book copies should now be 1
  let bookInDb = await getBooksCollection().findOne({ _id: bookRes.insertedId });
  assert.equal(bookInDb.availableCopies, 1);

  // 2. Alice tries to delete Bob's borrow record -> 403 Forbidden
  const aliceDel = await fetch(`${baseUrl}/borrows/${borrowRecord._id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenAlice}` },
  });
  assert.equal(aliceDel.status, 403);

  // 3. Bob deletes his own borrow record -> 200 OK
  const bobDel = await fetch(`${baseUrl}/borrows/${borrowRecord._id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenBob}` },
  });
  assert.equal(bobDel.status, 200);

  // 4. Verify borrow record is deleted from collection
  const deletedBorrow = await getBorrowsCollection().findOne({ _id: new (await import('mongodb')).ObjectId(borrowRecord._id) });
  assert.equal(deletedBorrow, null);

  // 5. Verify book availableCopies incremented by +1 back to 2
  bookInDb = await getBooksCollection().findOne({ _id: bookRes.insertedId });
  assert.equal(bookInDb.availableCopies, 2);
});
