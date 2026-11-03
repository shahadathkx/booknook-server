# BookNook Server (booknook-server) 📚

> Robust Express + TypeScript backend API for **BookNook**, a small online library platform ("Add a book, borrow a book, return a book"). Built with MongoDB connection pooling, BetterAuth JWKS token verification, atomic copy tracking, and full deployment readiness for Render and Vercel.

---

## 🚀 Deployment

### Deploy on Render (Recommended)

This repository includes a [`render.yaml`](./render.yaml) file for automatic Blueprint deployment.

1. **Connect Repo**: In your Render dashboard, choose **New > Blueprint** and connect this repository.
2. **Environment Variables**: Configure the following environment variables:
   - `MONGODB_URI`: Your MongoDB Atlas connection string.
   - `DB_NAME`: Database name (e.g., `booknook`).
   - `CLIENT_URL`: URL of your frontend (e.g., `https://booknook.vercel.app` or `http://localhost:3000`).
   - `AUTH_JWKS_URL`: Frontend BetterAuth JWKS endpoint (e.g., `https://your-app.com/api/auth/jwks`).
3. **Manual Web Service Config (Alternative)**:
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`

The server automatically listens on `process.env.PORT` bound to `0.0.0.0`.

---

### Deploy on Vercel

This repository includes [`vercel.json`](./vercel.json) and [`api/index.ts`](./api/index.ts) configured for Vercel Serverless Functions:

1. Import this repository in your Vercel Dashboard.
2. In **Project Settings > Environment Variables**, add:
   - `MONGODB_URI`
   - `DB_NAME`
   - `CLIENT_URL`
   - `AUTH_JWKS_URL`
3. Click **Deploy**. Vercel will build TypeScript and route all requests through `api/index.ts`. The cached MongoDB connection singleton automatically optimizes connection reuse across serverless cold starts.

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` for local development:

```env
PORT=7000
CLIENT_URL=http://localhost:3000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/?retryWrites=true&w=majority
DB_NAME=booknook
AUTH_JWKS_URL=http://localhost:3000/api/auth/jwks
```

---

## 📖 API Documentation

All responses return structured JSON:
- `200` / `201` on success
- `400` for invalid parameters or business logic failures (e.g., "Not available")
- `401` for missing or invalid Bearer tokens
- `403` for forbidden actions (e.g., modifying another user's book)
- `400` for invalid ObjectIds and `404` for valid IDs whose records do not exist
- `409` for duplicate borrow attempts ("You have already borrowed this book")

---

### 1. Health Check
- **`GET /health`** (the legacy `GET /` response is also available)
- **Auth**: Public
- **Description**: Returns server operational status and available endpoint list.
- **Response `200`**:
  ```json
  {
    "status": "healthy",
    "message": "BookNook Express + TypeScript API server is running smoothly.",
    "service": "BookNook Server",
    "timestamp": "2026-10-31T23:00:00.000Z"
  }
  ```

---

### 2. Get All Books
- **`GET /books`** (also accessible at `/api/books`)
- **Auth**: Public
- **Query Parameters**:
  - `?limit=6`: Limits the number of books returned.
  - `?sort=newest`: Sorts books by creation date descending (`createdAt: -1`).
  - `?category=Fiction`: Filters by category (`Fiction`, `Science`, `History`, `Kids`, `Others`).
  - `?search=tolkien`: Case-insensitive search matching `title` or `author`.
- **Response `200`**:
  ```json
  {
    "success": true,
    "message": "Books retrieved successfully.",
    "data": [
      {
        "_id": "67241234567890abcdef1234",
        "title": "To Kill a Mockingbird",
        "author": "Harper Lee",
        "category": "Fiction",
        "image": "https://images.unsplash.com/...",
        "description": "A story of innocence, empathy, and racial justice in the American South.",
        "totalCopies": 4,
        "availableCopies": 3,
        "addedBy": {
          "name": "Admin",
          "email": "curator@booknook.library"
        },
        "createdAt": "2026-10-31T20:00:00.000Z"
      }
    ],
    "count": 1
  }
  ```

---

### 3. Get My Books
- **`GET /books/my`** (also accessible at `/api/books/my`)
- **Auth**: Protected; returns books added by the authenticated user.

---

### 4. Get Book Details
- **`GET /books/:id`** (also accessible at `/api/books/:id`)
- **Auth**: Public
- **Description**: Fetches individual book details by MongoDB ObjectId. Invalid IDs return `400`; missing books return `404`.
- **Response `200`**:
  ```json
  {
    "success": true,
    "message": "Book details retrieved successfully.",
    "data": { ...book }
  }
  ```

---

### 5. Add a Book
- **`POST /books`** (also accessible at `/api/books`)
- **Auth**: Protected (Requires `Authorization: Bearer <token>`)
- **Description**: Adds a new book to the library catalog. Validates fields, automatically initializes `availableCopies = totalCopies`, sets `createdAt = new Date()`, and assigns `addedBy: { name, email }` strictly from the verified JWT payload.
- **Request Body**:
  ```json
  {
    "title": "The Pragmatic Programmer",
    "author": "Andrew Hunt & David Thomas",
    "category": "Others",
    "image": "https://images.unsplash.com/...",
    "description": "Straight from the programming trenches, this guide examines software development craftsmanship.",
    "totalCopies": 3
  }
  ```
- **Response `201`**:
  ```json
  {
    "success": true,
    "message": "\"The Pragmatic Programmer\" has been successfully added to the BookNook catalog.",
    "data": { ...newBook }
  }
  ```

---

### 6. Update a Book
- **`PATCH /books/:id`** (also accessible at `/api/books/:id`)
- **Auth**: Protected (Only the book owner `addedBy.email === req.user.email`)
- **Description**: Updates book details (`title`, `author`, `category`, `image`, `description`, `totalCopies`). When `totalCopies` changes, dynamically adjusts `availableCopies` by the difference (`diff = newTotal - oldTotal`), never dropping below `0`.
- **Request Body** *(any combination)*:
  ```json
  {
    "title": "The Pragmatic Programmer: 20th Anniversary Edition",
    "totalCopies": 5
  }
  ```
- **Response `200`**:
  ```json
  {
    "success": true,
    "message": "Book updated successfully.",
    "data": { ...updatedBook }
  }
  ```

---

### 7. Delete a Book
- **`DELETE /books/:id`** (also accessible at `/api/books/:id`)
- **Auth**: Protected (Only the book owner `addedBy.email === req.user.email`)
- **Description**: Deletes the specified book from the library and cascadingly removes all related borrow records from the `borrows` collection.
- **Response `200`**:
  ```json
  {
    "success": true,
    "message": "\"The Pragmatic Programmer\" and related borrow record(s) were successfully deleted."
  }
  ```

---

### 8. Borrow a Book
- **`POST /borrows`** (also accessible at `/api/borrows`)
- **`POST /api/books/:id/borrow`** is also available for borrowing by book ID.
- **Auth**: Protected (Requires `Authorization: Bearer <token>`)
- **Description**:
  1. Finds the book.
  2. Rejects if the user already borrowed the book (`409` "You have already borrowed this book").
  3. Atomically decrements `availableCopies` only when a copy is available. If out of stock, returns `400` "Not available".
  4. Inserts borrow record `{ userId, bookId, borrowedAt, returnedAt: null }` (legacy display fields remain available).
  5. If insertion fails (unique compound index constraint), automatically rolls back the decrement (`$inc: +1`).
- **Request Body**:
  ```json
  {
    "bookId": "67241234567890abcdef1234"
  }
  ```
- **Response `201`**:
  ```json
  {
    "success": true,
    "message": "\"To Kill a Mockingbird\" borrowed successfully.",
    "data": {
      "_id": "67249876543210fedcba5678",
      "userId": "user-123",
      "bookId": "67241234567890abcdef1234",
      "bookTitle": "To Kill a Mockingbird",
      "bookImage": "https://images.unsplash.com/...",
      "userEmail": "reader@example.com",
      "userName": "Jane Reader",
      "borrowedAt": "2026-10-31T23:00:00.000Z",
      "returnedAt": null,
      "borrowDate": "2026-10-31T23:00:00.000Z",
      "returnDate": "2026-11-07T23:00:00.000Z"
    }
  }
  ```

---

### 8. Get Logged-in User's Borrows
- **`GET /borrows`** (also accessible at `/api/borrows`)
- **Auth**: Protected (Requires `Authorization: Bearer <token>`)
- **Description**: Returns the authenticated user's active borrow records with each book populated in `book`.
- **Response `200`**:
  ```json
  {
    "success": true,
    "message": "User borrows retrieved successfully.",
    "data": [ ...userBorrows ],
    "count": 1
  }
  ```

---

### 9. Return a Book
- **`POST /api/borrows/:id/return`**
- **Auth**: Protected (only the borrower can return a record)
- **Description**: Sets `returnedAt` and increments the associated book's `availableCopies`. Invalid borrow IDs return `400`; missing records return `404`.
- **`DELETE /borrows/:id`** (also accessible at `/api/borrows/:id`)
- **Auth**: Protected (Only the borrower `borrow.userEmail === req.user.email`)
- **Description**: Deletes the borrow record and restores the book's stock by incrementing `availableCopies` by `+1` (`$inc: { availableCopies: 1 }`).
- **Response `200`**:
  ```json
  {
    "success": true,
    "message": "\"To Kill a Mockingbird\" returned successfully and borrow record deleted."
  }
  ```

---

## 🧪 Automated Testing

Run the full integration test suite with Node's native test runner:

```bash
npm test
```

### Test Coverage
- **`test/books.test.js`**: Public queries, limits, sort, category filtering, search, token-scoped email access, protected routes, ownership checks, dynamic stock updates, and cascading borrow deletion.
- **`test/borrows.test.js`**: Atomic decrement, rollback on failure, 7-day display due date, double-borrow prevention (`409`), populated user-scoped active borrows, and return stock increments.
- **`test/verifyJWT.test.js`**: BetterAuth JWKS token verification with ephemeral RSA key-pairs, header extraction, and rejection of malformed/untrusted tokens.
- **`test/api.test.js`**: End-to-end operational health check and catalog integration.

---

## 📜 Development Scripts

- **`npm run dev`**: Start with nodemon and ts-node on `http://localhost:7000`.
- **`npm run build`**: Compile TypeScript into `dist/`.
- **`npm start`**: Run production server from `dist/index.js`.
- **`npm test`**: Run automated integration tests.
