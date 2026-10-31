# BookNook Server 📚

> Backend API service for **BookNook**, a small online library platform designed around three core operations: **Add a book**, **Borrow a book**, and **Return a book**.

---

## 🚀 Features & Endpoints

All responses provide predictable, structured JSON formatted specifically for UI toast notifications and custom modal dialogs (no browser `alert()`, `confirm()`, or `prompt()` required).

### 1. Catalog Management (`/api/books`)

- **`GET /api/books`**
  - **Query Parameters**:
    - `search` *(optional)*: Search title, author, or genre.
    - `status` *(optional)*: Filter by availability (`available` | `borrowed`).
    - `genre` *(optional)*: Filter by genre category.
  - **Response**: Array of books with real synopsis, stock numbers, and live availability.

- **`POST /api/books`**
  - **Body**:
    ```json
    {
      "title": "The Pragmatic Programmer",
      "author": "Andrew Hunt & David Thomas",
      "genre": "Software Engineering",
      "description": "Straight from the programming trenches, this guide examines modern development practices.",
      "totalCopies": 3,
      "coverImage": "https://images.unsplash.com/photo-1532012164546-f432f2e35b34?auto=format&fit=crop&w=600&q=80"
    }
    ```
  - **Validation**: Strict validation on title, author, description, and positive copy count.

- **`GET /api/books/:id`**
  - Retrieves individual book details by ID.

---

### 2. Borrow a Book (`POST /api/books/:id/borrow`)

- **Endpoint**: `POST /api/books/:id/borrow`
- **Body**:
  ```json
  {
    "borrowerName": "Jane Doe",
    "borrowerEmail": "jane.doe@example.com",
    "dueDate": "2026-11-14T00:00:00.000Z"
  }
  ```
- **Rules & Behavior**:
  - Decrements `availableCopies` atomically.
  - Automatically updates book status to `borrowed` when stock reaches `0`.
  - Prevents duplicate active checkouts of the same book by the same borrower.
  - Returns a user-friendly message ready for client toast notifications.

---

### 3. Return a Book (`POST /api/books/:id/return`)

- **Endpoint**: `POST /api/books/:id/return`
- **Body** (either `borrowId` or `borrowerEmail`):
  ```json
  {
    "borrowId": "6541f71a9b1c2d3e4f5a6b7c"
  }
  ```
  *or*
  ```json
  {
    "borrowerEmail": "jane.doe@example.com"
  }
  ```
- **Rules & Behavior**:
  - Increments `availableCopies` up to `totalCopies`.
  - Sets book status back to `available`.
  - Marks loan transaction as `returned` with return timestamp.

---

### 4. Loans & History (`/api/borrows`)

- **`GET /api/borrows`**
  - Optional filters: `?status=active`, `?email=jane.doe@example.com`.
  - Useful for displaying a patron's active loans and return action modals.
- **`POST /api/borrows/:id/return`**
  - Direct return by loan record ID.

---

## 🛠️ Project Structure

```text
booknook-server/
├── index.js                  # Main server entry & bootstrap
├── package.json              # Project scripts & dependencies
├── .env.example              # Environment variables template
├── src/
│   ├── app.js                # Express app configuration & middleware
│   ├── config/
│   │   └── db.js             # MongoDB connection pool & singleton
│   ├── controllers/
│   │   ├── bookController.js # Add, borrow, return, and catalog handlers
│   │   └── borrowController.js # Loan history & record return handlers
│   ├── middleware/
│   │   └── errorHandler.js   # Centralized error & 404 response handler
│   ├── models/
│   │   ├── bookModel.js      # Book collection schema, indexes & queries
│   │   └── borrowModel.js    # Borrow record collection & state transitions
│   ├── seed/
│   │   └── seedData.js       # Curated initial library books (no lorem ipsum)
│   └── types/
│       └── index.js          # Typed contracts & JSDoc definitions
└── test/
    └── api.test.js           # Automated integration test suite
```

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory based on `.env.example`:

```env
PORT=7000
CLIENT_ORIGIN=http://localhost:3000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/?retryWrites=true&w=majority
DB_NAME=booknook
```

---

## 🏃 Running the Application

### Start Development Server
```bash
npm run dev
```

### Start Production Server
```bash
npm start
```

### Run Automated Tests
```bash
npm test
```
